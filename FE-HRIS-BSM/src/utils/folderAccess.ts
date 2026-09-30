/**
 * Akses folder lokal via File System Access API (browser Chromium).
 * User memilih folder sekali (mis. D:\program\hrd\report), handle-nya
 * disimpan di IndexedDB sehingga export berikutnya langsung tulis
 * file tanpa dialog/izin ulang.
 */

const DB_NAME = "hris-folder";
const STORE = "handles";
const KEY = "gaji-roti-pdf";

export interface DirHandle {
  name: string;
  queryPermission?: (desc?: { mode?: string }) => Promise<string>;
  requestPermission?: (desc?: { mode?: string }) => Promise<string>;
  getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<FileHandle>;
}

export interface FileHandle {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { id?: string; mode?: string }) => Promise<DirHandle>;
  }
}

export const folderApiTersedia = (): boolean =>
  typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

function bukaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const q = indexedDB.open(DB_NAME, 1);
    q.onupgradeneeded = () => {
      q.result.createObjectStore(STORE);
    };
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}

export async function muatFolder(): Promise<DirHandle | null> {
  try {
    const db = await bukaDb();
    const hasil: DirHandle | null = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const rq = tx.objectStore(STORE).get(KEY);
      rq.onsuccess = () => resolve((rq.result as DirHandle) || null);
      rq.onerror = () => reject(rq.error);
    });
    db.close();
    return hasil;
  } catch {
    return null;
  }
}

export async function simpanFolder(handle: DirHandle): Promise<void> {
  const db = await bukaDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function pastikanIzinTulis(dir: DirHandle): Promise<boolean> {
  try {
    if (await dir.queryPermission?.({ mode: "readwrite" }) === "granted") return true;
    return (await dir.requestPermission?.({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}
