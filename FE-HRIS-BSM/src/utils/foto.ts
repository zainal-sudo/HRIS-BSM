/**
 * URL bukti/foto.
 *
 * Foto izin & lembur TIDAK disimpan di disk aplikasi ini — Kolom DB
 * (`tijin.ij_foto` / `tlembur.lem_foto`) hanya menyimpan NAMA FILE, mis.
 * "IZ202602210017.jpeg". Berkasnya dipegang server legacy (upload.php) dan
 * disajikan dari direktori `bukti/`.
 *
 * Base URL dapat dioverride lewat VITE_FOTO_BASE_URL (lihat src/env.d.ts)
 * supaya tidak perlu mengubah kode saat server/IP berpindah.
 */
import { api } from "@/api/axios";

const FOTO_BASE = (
  (import.meta.env.VITE_FOTO_BASE_URL as string | undefined) ||
  "http://103.103.22.7/cutikaryawan/bukti"
).replace(/\/+$/, "");

/**
 * Bangun URL lengkap dari nama file. Nilai yang sudah berupa URL absolut
 * dikembalikan apa adanya.
 */
export function fotoUrl(filename?: string | null): string {
  const name = (filename || "").trim();
  if (!name) return "";
  if (/^https?:\/\//i.test(name)) return name;
  return `${FOTO_BASE}/${encodeURIComponent(name)}`;
}

/** Ukuran file maksimum upload (5 MB). */
export const MAX_FOTO_BYTES = 5 * 1024 * 1024;

/** Ekstensi gambar yang diizinkan pada input upload. */
export const FOTO_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

/** Validasi file gambar sisi klien. Kembalikan pesan error, atau "" bila OK. */
export function validateFotoFile(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (!FOTO_EXTENSIONS.includes(ext)) {
    return `Format ${ext || "?"} tidak didukung. Gunakan: ${FOTO_EXTENSIONS.join(", ")}.`;
  }
  if (file.size > MAX_FOTO_BYTES) {
    return `Ukuran file maksimal ${Math.round(MAX_FOTO_BYTES / 1024 / 1024)} MB.`;
  }
  return "";
}

/**
 * Unggah foto ke server bukti lewat proxy backend, dan kembalikan NAMA FILE
 * hasil server untuk disimpan ke DB.
 *
 * Endpoint & prefix berbeda per modul:
 *   - izin  -> POST /izin/upload   (prefix "IZ", di-hardcode di routes.js)
 *   - lembur-> POST /lembur/upload (prefix "LM", default di lembburController)
 *
 * Response diteruskan apa adanya dari upload.php (bukan envelope {success,data}
 * milik app), jadi bentuknya selalu { status, filename, message? }.
 *
 * Melempar Error bila gagal agar BaseForm menampilkannya sebagai satu toast
 * dan form TIDAK ikut tersimpan.
 */
export async function uploadFotoBukti(
  file: File,
  opts: { endpoint: string; prefix: string }
): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("prefix", opts.prefix);

  const { data } = await api.post(opts.endpoint, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  if (data?.status !== "success" || !data?.filename) {
    throw new Error(data?.message || "Upload foto gagal");
  }
  return String(data.filename);
}
