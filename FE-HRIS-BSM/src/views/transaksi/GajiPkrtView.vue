<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import CurrencyInput from "@/components/CurrencyInput.vue";
import CetakSlipGajiPkrt from "@/components/CetakSlipGajiPkrt.vue";
import { api, getErrorMessage } from "@/api/axios";
import { formatNumber } from "@/utils/format";
import { sortByKey, nextSort, sortIconName, type SortDir } from "@/utils/table";
import ColumnFilterPopup from "@/components/ColumnFilterPopup.vue";
import JSZip from "jszip";
import {
  folderApiTersedia,
  muatFolder,
  simpanFolder,
  pastikanIzinTulis,
  type DirHandle,
} from "@/utils/folderAccess";

/**
 * Proses Gaji PKRT — padanan form proses gaji PKRT lama (Delphi),
 * memakai database server utama.
 *
 * Rumus mengikuti file acuan "PKRT sept 2026 Payroll.xlsx" (sheet all+rekap):
 *   THP            = Gapok + Tunj. Jabatan + Tunj. Kompetensi + Tunj. Makan
 *   Rupiah Lembur  = Poin / 173 * THP
 *   Insentif       = Hari Insentif * 7.000
 *   Potong Gaji    = Hari Potong / 25 * THP
 *   Total Potongan = PPh21 + BPJS Kes + BPJS TK + Simpanan Kop + Cicilan + Potong Gaji
 *   Gaji           = THP + Lembur + Insentif - Total Potongan  (dibulatkan)
 *
 * Kolom "Hari Potong" ditarik dari Rekap Absensi (field "Potong_Gaji"),
 * sedangkan Poin & Hari Insentif diinput manual di grid. Sisanya mengikuti
 * master Setting Gaji PKRT.
 */

interface RowGajiPkrt {
  nik: string;
  nama: string;
  jabatan: string;
  unit: string;
  rekening: string;
  email: string;
  gapok: number;
  tjabatan: number;
  tkompetensi: number;
  tmakan: number;
  pph21: number;
  bpjskesehatan: number;
  bpjstk: number;
  simpankoperasi: number;
  cicilan: number;
  poin: number;
  hariinsentif: number;
  haripotong: number;
  thp: number;
  lembur: number;
  insentif: number;
  nominalpotgaji: number;
  potongan: number;
  gaji: number;
  gajibulat: number;
}

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Konstanta rumus, sama dengan src/helpers/pkrt.js di backend */
const PEMBAGI_LEMBUR = 173;
const PEMBAGI_POTONG = 25;
const TARIF_INSENTIF = 7000;

const toast = useToast();
const slipRef = ref<InstanceType<typeof CetakSlipGajiPkrt> | null>(null);

const now = new Date();
const filters = reactive({
  periode: now.getMonth() + 1,
  tahun: now.getFullYear(),
  start_date: "",
  end_date: "",
});

const bulanOptions = BULAN.map((label, i) => ({ label, value: i + 1 }));
const tahunOptions = computed(() => {
  const tahun = now.getFullYear();
  return [tahun - 2, tahun - 1, tahun, tahun + 1].map((t) => ({ label: String(t), value: t }));
});

const rows = ref<RowGajiPkrt[]>([]);
const loading = ref(false);
const absenLoading = ref(false);
const saving = ref(false);
const adaDataTersimpan = ref<number | null>(null);

const sortBy = ref<string | null>("nik");
const sortDir = ref<SortDir | null>("asc");

function toggleSort(key: string) {
  const s = nextSort(sortBy.value, sortDir.value, key);
  sortBy.value = s.key;
  sortDir.value = s.dir;
}

function sortIcon(key: string) {
  return sortIconName(key, sortBy.value, sortDir.value);
}

const kataKunci = ref("");
const filterSets = reactive<Record<string, string[]>>({});
const openFilterKey = ref<string | null>(null);

const hasColFilters = computed(() =>
  Object.values(filterSets).some((arr) => Array.isArray(arr) && arr.length > 0)
);

function isFilterActive(key: string): boolean {
  return !!filterSets[key] && filterSets[key].length > 0;
}

function toggleFilterPopup(key: string) {
  openFilterKey.value = openFilterKey.value === key ? null : key;
}

async function fetchDistinct(key: string): Promise<(string | number)[]> {
  const set = new Set<string | number>();
  for (const r of rows.value) {
    const v = r[key as keyof RowGajiPkrt];
    if (v === null || v === undefined || v === "") continue;
    set.add(v);
  }
  return [...set].sort((a, b) => String(a).localeCompare(String(b), "id", { numeric: true }));
}

function applyFilterSet(key: string, values: string[]) {
  if (values.length === 0) {
    delete filterSets[key];
  } else {
    filterSets[key] = values;
  }
  openFilterKey.value = null;
}

function clearColFilters() {
  for (const k of Object.keys(filterSets)) delete filterSets[k];
}

const filterKeys = computed(() => sortableColumns.map((c) => c.key as string));

const filteredRows = computed(() => {
  let list = rows.value;
  const active = filterKeys.value.filter((k) => (filterSets[k] || []).length > 0);
  if (active.length > 0) {
    list = list.filter((r) =>
      active.every((k) => (filterSets[k] || []).includes(String(r[k as keyof RowGajiPkrt])))
    );
  }
  const k = kataKunci.value.trim().toLowerCase();
  if (!k) return list;
  return list.filter((r) =>
    [r.nik, r.nama, r.jabatan, r.unit, r.rekening].some((v) =>
      String(v || "").toLowerCase().includes(k)
    )
  );
});

const sortedRows = computed(() => {
  if (!sortBy.value || !sortDir.value) return filteredRows.value;
  return sortByKey(filteredRows.value, sortBy.value, sortDir.value, (r, k) =>
    r[k as keyof RowGajiPkrt]
  );
});

const num = (v: unknown): number => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

/** Hitung ulang kolom turunan — identik dengan hitungGajiPkrt() di backend */
function recalc(r: RowGajiPkrt) {
  const thp = num(r.gapok) + num(r.tjabatan) + num(r.tkompetensi) + num(r.tmakan);
  const lembur = (num(r.poin) / PEMBAGI_LEMBUR) * thp;
  const insentif = num(r.hariinsentif) * TARIF_INSENTIF;
  const nominalpotgaji = (num(r.haripotong) / PEMBAGI_POTONG) * thp;
  const potongan =
    num(r.pph21) +
    num(r.bpjskesehatan) +
    num(r.bpjstk) +
    num(r.simpankoperasi) +
    num(r.cicilan) +
    nominalpotgaji;
  const gaji = thp + lembur + insentif - potongan;
  r.thp = thp;
  r.lembur = lembur;
  r.insentif = insentif;
  r.nominalpotgaji = nominalpotgaji;
  r.potongan = potongan;
  r.gaji = gaji;
  r.gajibulat = Math.round(gaji);
}

const namaBulan = computed(() => BULAN[filters.periode - 1] || "");
const periodeLabel = computed(() => `${namaBulan.value} ${filters.tahun}`);

const total = computed(() => {
  const t = {
    gapok: 0, tunjangan: 0, thp: 0, lembur: 0, insentif: 0,
    pph21: 0, bpjs: 0, lainnya: 0, potongan: 0, gaji: 0,
    bpjskesehatan: 0, bpjstk: 0, simpankoperasi: 0, cicilan: 0,
    nominalpotgaji: 0,
  };
  for (const r of sortedRows.value) {
    t.gapok += num(r.gapok);
    t.tunjangan += num(r.tjabatan) + num(r.tkompetensi) + num(r.tmakan);
    t.thp += num(r.thp);
    t.lembur += num(r.lembur);
    t.insentif += num(r.insentif);
    t.pph21 += num(r.pph21);
    t.bpjs += num(r.bpjskesehatan) + num(r.bpjstk);
    t.lainnya += num(r.simpankoperasi) + num(r.cicilan);
    t.bpjskesehatan += num(r.bpjskesehatan);
    t.bpjstk += num(r.bpjstk);
    t.simpankoperasi += num(r.simpankoperasi);
    t.cicilan += num(r.cicilan);
    t.nominalpotgaji += num(r.nominalpotgaji);
    t.potongan += num(r.potongan);
    t.gaji += num(r.gajibulat);
  }
  return t;
});

const fmt = (v: number, dec = 0) => formatNumber(Number(Number(v || 0).toFixed(dec)));

/**
 * Cutoff absensi: 21 bulan sebelumnya s/d 20 bulan terpilih
 * (gaji periode 9/2026 memakai absensi 21/08/2026 - 20/09/2026).
 */
function setDefaultRange() {
  const blnLalu = new Date(filters.tahun, filters.periode - 2, 1);
  filters.start_date =
    `${blnLalu.getFullYear()}-${String(blnLalu.getMonth() + 1).padStart(2, "0")}-21`;
  filters.end_date = `${filters.tahun}-${String(filters.periode).padStart(2, "0")}-20`;
}

const rangeLabel = computed(() =>
  filters.start_date && filters.end_date ? `${filters.start_date} s/d ${filters.end_date}` : "-"
);

function pakaiCutoff() {
  setDefaultRange();
  toast.info(`Rentang absensi disetel ke cutoff ${rangeLabel.value}`);
}

function kosongkanGrid() {
  rows.value = [];
  adaDataTersimpan.value = null;
}

const simpanDialog = ref(false);
const simpanOke = ref(false);
const pdfExport = reactive({ jalan: false, sudah: 0, total: 0 });

function barisDari(d: any): RowGajiPkrt {
  const r: RowGajiPkrt = {
    nik: String(d.nik),
    nama: d.nama,
    jabatan: d.jabatan || "",
    unit: d.unit || "",
    rekening: (d.rekening || "").trim(),
    email: (d.email || "").trim(),
    gapok: num(d.gapok),
    tjabatan: num(d.tjabatan),
    tkompetensi: num(d.tkompetensi),
    tmakan: num(d.tmakan),
    pph21: num(d.pph21),
    bpjskesehatan: num(d.bpjskesehatan),
    bpjstk: num(d.bpjstk),
    simpankoperasi: num(d.simpankoperasi),
    cicilan: num(d.cicilan),
    poin: num(d.poin),
    hariinsentif: num(d.hariinsentif),
    haripotong: num(d.haripotong),
    thp: 0,
    lembur: 0,
    insentif: 0,
    nominalpotgaji: 0,
    potongan: 0,
    gaji: 0,
    gajibulat: 0,
  };
  recalc(r);
  return r;
}

/** 1. Muat master karyawan + setting gaji (Setting Gaji PKRT) */
async function muatKaryawan() {
  loading.value = true;
  try {
    const { data } = await api.get("/gaji-pkrt/karyawan");
    const list: any[] = data.data || [];
    rows.value = list.map(barisDari);
    adaDataTersimpan.value = null;
    toast.success(`${rows.value.length} karyawan PKRT dimuat dari master`);
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data karyawan"));
  } finally {
    loading.value = false;
  }
}

/** 2. Tarik "Hari Potong" dari rekap absensi (kolom "Potong Gaji").
 *  Poin & Hari Insentif tidak ada di rekap absensi, jadi dibiarkan sesuai
 *  isian manual di grid (tidak ditimpa menjadi 0). */
async function tarikAbsensi() {
  if (rows.value.length === 0) {
    toast.warning("Muat data karyawan terlebih dahulu");
    return;
  }
  if (!filters.start_date || !filters.end_date) {
    toast.warning("Tentukan rentang tanggal absensi");
    return;
  }
  if (filters.start_date > filters.end_date) {
    toast.warning("Tanggal awal tidak boleh melewati tanggal akhir");
    return;
  }

  absenLoading.value = true;
  try {
    const { data } = await api.get("/gaji-pkrt/absensi", {
      params: { start_date: filters.start_date, end_date: filters.end_date },
    });
    const list: any[] = data.data?.rows || [];
    const peta = new Map(rows.value.map((r) => [r.nik, r]));

    let cocok = 0;
    for (const a of list) {
      const r = peta.get(String(a.nik).trim());
      if (!r) continue;
      r.haripotong = num(a.potonghari);
      recalc(r);
      cocok += 1;
    }

    const tanpaData: string[] = data.data?.tanpaData || [];
    if (cocok === 0) {
      toast.warning("Tidak ada rekap absensi yang cocok dengan NIK di grid");
    } else {
      toast.success(
        `Hari Potong ${rangeLabel.value} terproses untuk ${cocok} karyawan` +
          (tanpaData.length > 0 ? `, ${tanpaData.length} karyawan tanpa data absensi` : "") +
          ". Poin & Hari Insentif tetap memakai isian manual."
      );
    }
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menarik data absensi"));
  } finally {
    absenLoading.value = false;
  }
}

/** 3. Muat data yang sudah tersimpan */
async function muatTersimpan() {
  loading.value = true;
  try {
    const { data } = await api.get("/gaji-pkrt", {
      params: { periode: filters.periode, tahun: filters.tahun },
    });
    const list: any[] = data.data?.rows || [];
    rows.value = list.map(barisDari);
    adaDataTersimpan.value = list.length;
    if (list.length === 0) {
      toast.info(`Belum ada data gaji tersimpan untuk periode ${periodeLabel.value}`);
    } else {
      toast.success(`${list.length} data gaji periode ${periodeLabel.value} dimuat`);
    }
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data tersimpan"));
  } finally {
    loading.value = false;
  }
}

async function cekTersimpan(): Promise<number> {
  try {
    const { data } = await api.get("/gaji-pkrt", {
      params: { periode: filters.periode, tahun: filters.tahun },
    });
    const jml = data.data?.jumlah || 0;
    adaDataTersimpan.value = jml;
    return jml;
  } catch {
    return 0;
  }
}

async function mintaSimpan() {
  if (rows.value.length === 0) {
    toast.warning("Tidak ada data untuk disimpan");
    return;
  }
  konfirmasiJumlah.value =
    adaDataTersimpan.value === null ? await cekTersimpan() : adaDataTersimpan.value;
  simpanDialog.value = true;
}

const konfirmasiJumlah = ref(0);

/** Simpan: hapus periode lama di server lalu insert ulang (1 transaksi) */
async function simpan() {
  if (!simpanOke.value) return;
  simpanOke.value = false;
  simpanDialog.value = false;

  saving.value = true;
  try {
    const payload = {
      periode: filters.periode,
      tahun: filters.tahun,
      rows: rows.value.map((r) => ({
        nik: r.nik,
        nama: r.nama,
        jabatan: r.jabatan,
        unit: r.unit,
        rekening: r.rekening,
        email: r.email,
        gapok: num(r.gapok),
        tjabatan: num(r.tjabatan),
        tkompetensi: num(r.tkompetensi),
        tmakan: num(r.tmakan),
        poin: num(r.poin),
        hariinsentif: num(r.hariinsentif),
        haripotong: num(r.haripotong),
        pph21: num(r.pph21),
        bpjskesehatan: num(r.bpjskesehatan),
        bpjstk: num(r.bpjstk),
        simpankoperasi: num(r.simpankoperasi),
        cicilan: num(r.cicilan),
      })),
    };
    const { data } = await api.post("/gaji-pkrt/simpan", payload);
    adaDataTersimpan.value = data.data?.jumlah ?? rows.value.length;
    toast.success(data.message || "Data gaji PKRT berhasil disimpan");
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menyimpan data gaji PKRT"));
  } finally {
    saving.value = false;
  }
}

function exportCsv() {
  if (rows.value.length === 0) return;
  const header = [
    "NIK", "Nama", "Jabatan", "Unit", "Gapok", "Tunj. Jabatan",
    "Tunj. Kompetensi", "Tunj. Makan", "THP", "Poin", "Lembur",
    "Hari Insentif", "Insentif", "PPh21", "BPJS Kesehatan", "BPJS TK",
    "Simpanan Koperasi", "Cicilan", "Hari Potong", "Potong Gaji",
    "Total Potongan", "Gaji", "Gaji Bulat", "Rekening",
  ];
  const lines = sortedRows.value.map((r) =>
    [
      r.nik, r.nama, r.jabatan, r.unit, num(r.gapok), num(r.tjabatan),
      num(r.tkompetensi), num(r.tmakan), num(r.thp), num(r.poin), num(r.lembur),
      num(r.hariinsentif), num(r.insentif), num(r.pph21), num(r.bpjskesehatan),
      num(r.bpjstk), num(r.simpankoperasi), num(r.cicilan), num(r.haripotong),
      num(r.nominalpotgaji), num(r.potongan), num(r.gaji), num(r.gajibulat), r.rekening,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob(["\ufeff" + [header.join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gaji-pkrt_${filters.tahun}_${String(filters.periode).padStart(2, "0")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const slipRows = computed(() => sortedRows.value as any);

function cetakSemua() {
  if (slipRows.value.length === 0) {
    toast.warning("Tidak ada slip untuk dicetak");
    return;
  }
  const ok = slipRef.value?.print(slipRows.value);
  if (!ok) toast.warning("Popup cetak diblokir browser, izinkan pop-up untuk situs ini");
}

function cetakSatu(r: RowGajiPkrt) {
  const ok = slipRef.value?.print([{ ...r } as any]);
  if (!ok) toast.warning("Popup cetak diblokir browser, izinkan pop-up untuk situs ini");
}

/** Export semua slip di grid ke PDF, satu file per NIK, langsung ke folder lokal. */
async function exportSemuaPdf() {
  if (sortedRows.value.length === 0) {
    toast.warning("Tidak ada data untuk di-export");
    return;
  }
  if (!folderApiTersedia()) return exportLewatUnduhan();

  let dir = await muatFolder();
  if (!dir) {
    toast.info("Pada dialog yang muncul, pilih folder D:\\program\\hrd\\report");
    try {
      dir = (await window.showDirectoryPicker?.({ id: "gaji-pkrt-pdf", mode: "readwrite" })) || null;
    } catch {
      return;
    }
    if (!dir) return;
    await simpanFolder(dir);
  }
  if (!(await pastikanIzinTulis(dir))) {
    toast.error("Zin tulis ke folder ditolak browser");
    return;
  }

  pdfExport.jalan = true;
  pdfExport.sudah = 0;
  pdfExport.total = sortedRows.value.length;
  let gagal = 0;
  for (const r of sortedRows.value) {
    try {
      const hasil = await slipRef.value?.renderPdfBlob({ ...r } as any);
      if (!hasil) throw new Error("gagal render");
      const fh = await (dir as DirHandle).getFileHandle(hasil.filename, { create: true });
      const w = await fh.createWritable();
      await w.write(hasil.blob);
      await w.close();
    } catch {
      gagal += 1;
    }
    pdfExport.sudah += 1;
  }
  pdfExport.jalan = false;
  const ok = pdfExport.total - gagal;
  if (gagal === 0) {
    toast.success(`${ok} file PDF tersimpan di D:\\program\\hrd\\report`);
  } else {
    toast.warning(`${ok} file tersimpan, ${gagal} gagal dari ${pdfExport.total} karyawan`);
  }
}

/** Cadangan: unduh semua slip sebagai 1 file ZIP (hindari prompt "Keep" browser) */
async function exportLewatUnduhan() {
  if (sortedRows.value.length === 0) return;
  pdfExport.jalan = true;
  pdfExport.sudah = 0;
  pdfExport.total = sortedRows.value.length;
  let gagal = 0;

  const zip = new JSZip();

  for (const r of sortedRows.value) {
    try {
      const hasil = await slipRef.value?.renderPdfBlob({ ...r } as any);
      if (!hasil) throw new Error("gagal render");
      zip.file(hasil.filename, hasil.blob);
    } catch {
      gagal += 1;
    }
    pdfExport.sudah += 1;
  }

  if (pdfExport.total - gagal > 0) {
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gaji-pkrt_${filters.tahun}_${String(filters.periode).padStart(2, "0")}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  pdfExport.jalan = false;
  if (gagal === 0) {
    toast.success(
      `${pdfExport.total} slip gaji dikemas ke 1 file ZIP dan diunduh.`
    );
  } else {
    toast.warning(`${pdfExport.total - gagal} slip masuk ZIP, ${gagal} gagal.`);
  }
}

interface HasilEmail {
  nik: string;
  nama: string;
  email: string;
  file: string;
  status: string;
}

const emailDialog = ref(false);
const emailSubject = ref("");
const emailMessage = ref("");
const emailHasil = ref<HasilEmail[]>([]);
const emailKirim = reactive({ jalan: false, sudah: 0, total: 0 });
const tesSmtpJalan = ref(false);

async function tesKoneksiSmtp() {
  tesSmtpJalan.value = true;
  try {
    const { data } = await api.get("/gaji-pkrt/smtp-test");
    toast.success(data.message || "Koneksi SMTP OK");
  } catch (e) {
    toast.error(getErrorMessage(e, "Tes koneksi SMTP gagal"));
  } finally {
    tesSmtpJalan.value = false;
  }
}

const emailAdaAlamat = computed(
  () => sortedRows.value.filter((r) => r.email.trim() !== "" && r.email.trim() !== "-").length
);

function bukaEmailDialog() {
  if (sortedRows.value.length === 0) {
    toast.warning("Tidak ada data untuk dikirim");
    return;
  }
  emailSubject.value = `Slip Gaji Periode ${periodeLabel.value}`;
  emailMessage.value =
    `Terlampir slip gaji Anda periode ${periodeLabel.value}. ` +
    "Apabila ada pertanyaan mengenai rincian gaji, silakan hubungi bagian HRD. Terima kasih.";
  emailHasil.value = [];
  emailKirim.jalan = false;
  emailKirim.sudah = 0;
  emailKirim.total = 0;
  emailDialog.value = true;
}

function blobKeBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function kirimEmailSemua() {
  if (!emailSubject.value.trim()) {
    toast.warning("Subjek email wajib diisi");
    return;
  }
  emailKirim.jalan = true;
  emailKirim.sudah = 0;
  emailKirim.total = sortedRows.value.length;
  emailHasil.value = [];

  for (const r of sortedRows.value) {
    try {
      const pdf = await slipRef.value?.renderPdfBlob({ ...r } as any);
      if (!pdf) throw new Error("Gagal membuat PDF");
      const { data } = await api.post("/gaji-pkrt/kirim-slip", {
        nik: r.nik,
        subject: emailSubject.value.trim(),
        message: emailMessage.value,
        filename: pdf.filename,
        pdfBase64: await blobKeBase64(pdf.blob),
      });
      emailHasil.value.push({
        nik: r.nik,
        nama: r.nama,
        email: data.data?.email || r.email,
        file: pdf.filename,
        status: "Berhasil",
      });
    } catch (e) {
      emailHasil.value.push({
        nik: r.nik,
        nama: r.nama,
        email: r.email || "-",
        file: "",
        status: getErrorMessage(e, "Gagal"),
      });
    }
    emailKirim.sudah += 1;
  }
  emailKirim.jalan = false;

  const ok = emailHasil.value.filter((h) => h.status === "Berhasil").length;
  if (ok === emailKirim.total) {
    toast.success(`Semua ${ok} email slip gaji berhasil dikirim`);
  } else {
    toast.warning(`${ok} berhasil, ${emailKirim.total - ok} gagal dari ${emailKirim.total} karyawan`);
  }
}

const editableColumns = [
  { key: "poin", label: "Poin", width: "70px", align: "c" },
  { key: "hariinsentif", label: "Hari Insentif", width: "95px", align: "c" },
  { key: "haripotong", label: "Hari Potong", width: "90px", align: "c" },
] as const;

interface Kolom {
  key: string;
  label: string;
  width: string;
  align: string;
}

const infoColumns = [
  { key: "nik", label: "NIK", width: "100px", align: "" },
  { key: "nama", label: "Nama", width: "170px", align: "" },
  { key: "jabatan", label: "Jabatan", width: "130px", align: "" },
  { key: "thp", label: "THP", width: "105px", align: "r" },
  { key: "lembur", label: "Lembur", width: "100px", align: "r" },
  { key: "insentif", label: "Insentif", width: "95px", align: "r" },
  { key: "pph21", label: "PPh21", width: "85px", align: "r" },
  { key: "bpjskesehatan", label: "BPJS Kes", width: "90px", align: "r" },
  { key: "bpjstk", label: "BPJS TK", width: "90px", align: "r" },
  { key: "simpankoperasi", label: "Koperasi", width: "90px", align: "r" },
  { key: "cicilan", label: "Cicilan", width: "85px", align: "r" },
  { key: "nominalpotgaji", label: "Potong Gaji", width: "100px", align: "r" },
  { key: "potongan", label: "Total Potongan", width: "110px", align: "r" },
  { key: "gajibulat", label: "Gaji", width: "110px", align: "r" },
] as const;

const sortableColumns = [...infoColumns, ...editableColumns] as unknown as readonly Kolom[];

onMounted(() => {
  setDefaultRange();
  void cekTersimpan();
});
</script>

<template>
  <div>
    <CetakSlipGajiPkrt ref="slipRef" :rows="slipRows" :periode="filters.periode" :tahun="filters.tahun" />

    <div class="page-head">
      <div>
        <h2 class="page-title">Proses Gaji PKRT</h2>
        <div class="page-sub">
          Gaji bulanan, lembur, insentif shift malam &amp; potongan unit PKRT
        </div>
      </div>
      <div class="head-actions">
        <div class="period-inline">
          <label>Bulan</label>
          <select v-model.number="filters.periode" @change="setDefaultRange">
            <option v-for="b in bulanOptions" :key="b.value" :value="b.value">{{ b.label }}</option>
          </select>
          <label>Tahun</label>
          <select v-model.number="filters.tahun" @change="setDefaultRange">
            <option v-for="t in tahunOptions" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
        </div>
        <div class="period-inline">
          <label>Dari</label>
          <input v-model="filters.start_date" type="date" />
          <label>Sampai</label>
          <input v-model="filters.end_date" type="date" />
        </div>
        <button class="btn" title="Kembalikan rentang ke cutoff resmi: 21 bulan lalu s/d 20 bulan ini" @click="pakaiCutoff">
          <MsIcon name="event_repeat" :size="15" /> Cutoff 21-20
        </button>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <span class="sum-icon total"><MsIcon name="payments" :size="14" /></span>
        <b>Periode {{ periodeLabel }}</b>
        <span class="badge muted" title="Rentang absensi yang dipakai saat menarik rekap">
          <MsIcon name="event_repeat" :size="12" /> {{ rangeLabel }}
        </span>
        <span v-if="adaDataTersimpan !== null" class="badge" :class="adaDataTersimpan > 0 ? 'ok' : 'muted'">
          {{ adaDataTersimpan > 0 ? `Tersimpan: ${adaDataTersimpan} karyawan` : "Belum tersimpan" }}
        </span>
        <div class="search-box">
          <MsIcon name="search" :size="14" />
          <input v-model="kataKunci" type="text" placeholder="Cari NIK / nama / jabatan / unit..." />
          <button v-if="kataKunci" class="search-clear" title="Hapus pencarian" @click="kataKunci = ''">
            <MsIcon name="close" :size="13" />
          </button>
        </div>
        <button v-if="hasColFilters" class="btn" title="Hapus semua filter kolom" @click="clearColFilters">
          <MsIcon name="filter_alt_off" :size="14" /> Reset Filter
        </button>
      </div>
      <div class="toolbar-right">
        <button class="btn" :disabled="loading" @click="muatKaryawan">
          <MsIcon name="person_search" :size="15" /> Muat Karyawan
        </button>
        <button
          class="btn"
          :disabled="absenLoading || rows.length === 0"
          title="Tarik Hari Potong dari Rekap Absensi (kolom Potong Gaji)"
          @click="tarikAbsensi"
        >
          <MsIcon name="fact_check" :size="15" />
          {{ absenLoading ? "Menarik..." : "Tarik Absensi" }}
        </button>
        <button class="btn" :disabled="loading" @click="muatTersimpan">
          <MsIcon name="history" :size="15" /> Muat Tersimpan
        </button>
        <button class="btn" @click="kosongkanGrid">
          <MsIcon name="filter_list_off" :size="15" /> Kosongkan
        </button>
        <button class="btn" :disabled="rows.length === 0" @click="exportCsv">
          <MsIcon name="download" :size="15" /> Export CSV
        </button>
        <button class="btn" :disabled="rows.length === 0" @click="cetakSemua">
          <MsIcon name="print" :size="15" /> Cetak Semua Slip
        </button>
        <button class="btn" :disabled="pdfExport.jalan || rows.length === 0" @click="exportSemuaPdf">
          <MsIcon name="picture_as_pdf" :size="15" />
          {{ pdfExport.jalan ? `Export PDF ${pdfExport.sudah}/${pdfExport.total}` : "Export Semua PDF" }}
        </button>
        <button class="btn" :disabled="emailKirim.jalan || rows.length === 0" @click="bukaEmailDialog">
          <MsIcon name="send" :size="15" />
          {{ emailKirim.jalan ? `Kirim ${emailKirim.sudah}/${emailKirim.total}` : "Kirim Email" }}
        </button>
        <button class="btn primary" :disabled="saving || rows.length === 0" @click="mintaSimpan">
          <MsIcon name="save" :size="15" /> {{ saving ? "Menyimpan..." : "Simpan" }}
        </button>
      </div>
    </div>

    <div class="summary-strip">
      <div class="sum-item">
        <span class="sum-icon total"><MsIcon name="group" :size="15" /></span>
        <b>{{ sortedRows.length }}</b>&nbsp;Karyawan
        <span v-if="kataKunci.trim() && sortedRows.length !== rows.length" class="filter-hint">
          dari {{ rows.length }}
        </span>
      </div>
      <div class="sum-item">
        <span class="sum-icon masuk"><MsIcon name="payments" :size="15" /></span>
        <b>{{ fmt(total.thp) }}</b> Total THP
      </div>
      <div class="sum-item">
        <span class="sum-icon lembur"><MsIcon name="schedule" :size="15" /></span>
        <b>{{ fmt(total.lembur) }}</b> Total Lembur
      </div>
      <div class="sum-item">
        <span class="sum-icon lembur"><MsIcon name="card_giftcard" :size="15" /></span>
        <b>{{ fmt(total.insentif) }}</b> Total Insentif
      </div>
      <div class="sum-item">
        <span class="sum-icon potong"><MsIcon name="cancel" :size="15" /></span>
        <b>{{ fmt(total.potongan) }}</b> Total Potongan
      </div>
      <div class="sum-item">
        <span class="sum-icon total"><MsIcon name="account_balance_wallet" :size="15" /></span>
        <b>{{ fmt(total.gaji) }}</b> Total Gaji
      </div>
    </div>

    <div class="table-card">
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th class="c" style="width: 34px">No</th>
              <th
                v-for="(c, idx) in sortableColumns"
                :key="c.key"
                class="sortable"
                :class="[{ sorted: sortBy === c.key }, c.align]"
                :style="{ width: c.width }"
                title="Klik untuk mengurutkan"
                @click="toggleSort(c.key)"
              >
                {{ c.label }}<MsIcon :name="sortIcon(c.key)" :size="12" className="th-sort" />
                <button
                  class="th-filter"
                  :class="{ active: isFilterActive(c.key) || openFilterKey === c.key }"
                  title="Filter kolom ini"
                  @click.stop="toggleFilterPopup(c.key)"
                >
                  <MsIcon :name="isFilterActive(c.key) ? 'filter_alt' : 'filter_list'" :size="12" />
                  <span v-if="isFilterActive(c.key)" class="filter-dot"></span>
                </button>
                <ColumnFilterPopup
                  v-if="openFilterKey === c.key"
                  :class="{ 'align-right': idx > sortableColumns.length / 2 }"
                  :col-label="c.label"
                  :selected="filterSets[c.key] || []"
                  :fetch-values="() => fetchDistinct(c.key)"
                  @apply="(vals) => applyFilterSet(c.key, vals)"
                  @close="openFilterKey = null"
                  @click.stop
                />
              </th>
              <th class="c" style="width: 60px">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td :colspan="19" class="row-empty">Memuat data...</td>
            </tr>
            <tr v-else-if="rows.length === 0">
              <td :colspan="19" class="row-empty">
                Belum ada data. Klik <b>Muat Karyawan</b> untuk memuat master, atau
                <b>Muat Tersimpan</b> untuk membuka periode {{ periodeLabel }}.
              </td>
            </tr>
            <tr v-for="(r, i) in sortedRows" :key="r.nik">
              <td class="c">{{ i + 1 }}</td>
              <td>{{ r.nik }}</td>
              <td :title="r.nama">{{ r.nama }}</td>
              <td :title="r.jabatan">{{ r.jabatan || "-" }}</td>
              <td class="r strong">{{ fmt(r.thp) }}</td>
              <td class="r">{{ fmt(r.lembur) }}</td>
              <td class="r">{{ fmt(r.insentif) }}</td>
              <td class="r">{{ fmt(r.pph21) }}</td>
              <td class="r">{{ fmt(r.bpjskesehatan) }}</td>
              <td class="r">{{ fmt(r.bpjstk) }}</td>
              <td class="r">{{ fmt(r.simpankoperasi) }}</td>
              <td class="r">{{ fmt(r.cicilan) }}</td>
              <td class="r">{{ fmt(r.nominalpotgaji) }}</td>
              <td class="r">{{ fmt(r.potongan) }}</td>
              <td class="r strong">{{ fmt(r.gajibulat) }}</td>
              <td class="c"><CurrencyInput v-model="r.poin" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.hariinsentif" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.haripotong" class="cell-input" /></td>
              <td class="c">
                <button class="row-btn" title="Cetak slip gaji karyawan ini" @click="cetakSatu(r)">
                  <MsIcon name="print" :size="13" />
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot v-if="rows.length > 0">
            <tr>
              <td colspan="4" class="r strong">TOTAL</td>
              <td class="r strong">{{ fmt(total.thp) }}</td>
              <td class="r strong">{{ fmt(total.lembur) }}</td>
              <td class="r strong">{{ fmt(total.insentif) }}</td>
              <td class="r strong">{{ fmt(total.pph21) }}</td>
              <td class="r strong">{{ fmt(total.bpjskesehatan) }}</td>
              <td class="r strong">{{ fmt(total.bpjstk) }}</td>
              <td class="r strong">{{ fmt(total.simpankoperasi) }}</td>
              <td class="r strong">{{ fmt(total.cicilan) }}</td>
              <td class="r strong">{{ fmt(total.nominalpotgaji) }}</td>
              <td class="r strong">{{ fmt(total.potongan) }}</td>
              <td class="r strong">{{ fmt(total.gaji) }}</td>
              <td class="r strong"></td>
              <td class="r strong"></td>
              <td class="r strong"></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="table-note">
        <MsIcon name="info" :size="13" />
        Kolom <b>Poin / Hari Insentif / Hari Potong</b> diketik manual di grid
        (tombol <b>Tarik Absensi</b> hanya mengisi <b>Hari Potong</b> dari kolom
        &quot;Potong Gaji&quot; di Rekap Absensi); kolom lainnya dihitung otomatis:
        <b>THP</b> = Gapok + Tunj. Jabatan + Tunj. Kompetensi + Tunj. Makan,
        <b>Lembur</b> = Poin / {{ PEMBAGI_LEMBUR }} &times; THP,
        <b>Insentif</b> = Hari Insentif &times; {{ TARIF_INSENTIF.toLocaleString("id-ID") }},
        <b>Potong Gaji</b> = Hari Potong / {{ PEMBAGI_POTONG }} &times; THP,
        <b>Gaji</b> = THP + Lembur + Insentif &minus; Total Potongan (dibulatkan).
        Nilai Gapok/Tunjangan/Potongan tetap diambil dari menu
        <b>Master &rsaquo; Setting Gaji PKRT</b>.
      </div>
    </div>

    <!-- Konfirmasi simpan -->
    <v-dialog v-model="simpanDialog" max-width="460" persistent>
      <v-card rounded="false">
        <v-card-item class="py-3">
          <div class="d-flex align-center">
            <span class="material-symbols-outlined" style="color: #d97706; margin-right: 8px">warning</span>
            <v-card-title class="text-body-1 font-weight-bold pa-0">Simpan Gaji PKRT</v-card-title>
          </div>
        </v-card-item>
        <v-card-text class="text-body-2">
          <div class="mb-2">
            Periode <b>{{ periodeLabel }}</b> dengan <b>{{ rows.length }}</b> karyawan.
          </div>
          <div class="warn-box">
            <span v-if="konfirmasiJumlah > 0">
              Periode ini sudah punya <b>{{ konfirmasiJumlah }}</b> data. Data lama akan
              <b>ditimpa</b> dengan data di grid.
            </span>
            <span v-else>
              Data akan disimpan ke tabel gaji PKRT sebagai hasil proses periode ini.
            </span>
          </div>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-checkbox
            v-model="simpanOke"
            color="primary"
            density="compact"
            hide-details
            label="Ya, simpan data gaji periode ini"
          />
          <v-spacer />
          <v-btn variant="text" rounded="false" @click="simpanDialog = false">Batal</v-btn>
          <v-btn color="primary" rounded="false" :disabled="!simpanOke" @click="simpan">Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog kirim email slip -->
    <v-dialog v-model="emailDialog" max-width="640" persistent>
      <v-card rounded="false">
        <v-card-item class="py-3">
          <v-card-title class="text-body-1 font-weight-bold">
            Kirim Slip Gaji via Email &mdash; {{ periodeLabel }}
          </v-card-title>
          <v-card-subtitle class="text-body-2">
            {{ sortedRows.length }} karyawan, {{ emailAdaAlamat }} punya alamat email.
            Slip dibuat sebagai PDF lalu dilampirkan.
          </v-card-subtitle>
        </v-card-item>
        <v-card-text class="text-body-2">
          <label class="dlg-label">Subjek</label>
          <input v-model="emailSubject" class="dlg-input" type="text" />
          <label class="dlg-label" style="margin-top: 10px">Pesan</label>
          <textarea v-model="emailMessage" class="dlg-input" rows="4"></textarea>
          <div v-if="emailKirim.jalan" class="warn-box" style="margin-top: 10px">
            <MsIcon name="progress_activity" :size="14" />
            Mengirim {{ emailKirim.sudah }} dari {{ emailKirim.total }}...
          </div>
          <div v-if="emailHasil.length > 0" class="hasil-scroll" style="margin-top: 10px">
            <table class="hasil-tabel">
              <thead>
                <tr><th>NIK</th><th>Nama</th><th>Email</th><th>Status</th></tr>
              </thead>
              <tbody>
                <tr v-for="h in emailHasil" :key="h.nik">
                  <td>{{ h.nik }}</td>
                  <td>{{ h.nama }}</td>
                  <td>{{ h.email }}</td>
                  <td :class="h.status === 'Berhasil' ? 'ok' : 'gagal'">{{ h.status }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-btn
            variant="text"
            rounded="false"
            :loading="tesSmtpJalan"
            prepend-icon="mdi-lan-connect"
            @click="tesKoneksiSmtp"
          >
            Tes SMTP
          </v-btn>
          <v-spacer />
          <v-btn variant="text" rounded="false" :disabled="emailKirim.jalan" @click="emailDialog = false">
            Tutup
          </v-btn>
          <v-btn
            color="primary"
            rounded="false"
            :loading="emailKirim.jalan"
            :disabled="!emailSubject.trim()"
            @click="kirimEmailSemua"
          >
            Kirim {{ sortedRows.length }} Email
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>


<style scoped>
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.page-title {
  font-size: 16px;
  font-weight: 900;
  color: var(--ds-primary-dark, #243656);
  margin: 0;
}
.page-sub {
  font-size: 11px;
  color: #6b7a90;
}
.head-actions {
  display: flex;
  gap: 7px;
  align-items: center;
  flex-wrap: wrap;
}
.period-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 32px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
}
.period-inline label {
  font-size: 10px;
  font-weight: 800;
  color: #55637a;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.period-inline input,
.period-inline select {
  border: none;
  outline: none;
  font-size: 12px;
  font-family: "Plus Jakarta Sans", sans-serif;
  color: var(--ds-on-surface, #1b2d4a);
  background: transparent;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding: 7px 10px;
  margin-bottom: 10px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: linear-gradient(180deg, #42587f 0%, #334a6e 100%);
  color: #fff;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  flex-wrap: wrap;
}
.toolbar-left b {
  font-weight: 800;
}
.search-box {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 6px 0 8px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #fff;
}
.search-box input {
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  font-size: 11.5px;
  font-family: "Plus Jakarta Sans", sans-serif;
  width: 200px;
}
.search-box input::placeholder {
  color: rgba(255, 255, 255, 0.6);
}
.search-clear {
  display: flex;
  align-items: center;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  padding: 2px;
}
.search-clear:hover {
  color: #fff;
}
.filter-hint {
  font-size: 10.5px;
  color: #8a94a3;
}
.toolbar-right {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.badge {
  padding: 2px 8px;
  font-size: 10.5px;
  font-weight: 800;
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: #fff;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.badge.muted {
  background: rgba(255, 255, 255, 0.12);
}
.btn {
  height: 30px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  font-family: "Plus Jakarta Sans", sans-serif;
  cursor: pointer;
  white-space: nowrap;
}
.btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.22);
}
.btn.primary {
  background: #ffd479;
  border-color: #f0c26a;
  color: #33415c;
}
.btn.primary:hover:not(:disabled) {
  background: #ffdf9a;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.summary-strip {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.sum-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  font-size: 11.5px;
  color: #55637a;
}
.sum-item b {
  font-size: 13px;
  color: var(--ds-on-surface, #1b2d4a);
}
.sum-icon {
  display: flex;
  align-items: center;
  color: #fff;
  border-radius: 3px;
  padding: 3px;
}
.sum-icon.total { background: #5b6472; }
.sum-icon.masuk { background: #2f9e44; }
.sum-icon.potong { background: #d63031; }
.sum-icon.lembur { background: #e8871e; }
.table-card {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
}
.table-scroll {
  overflow: auto;
  max-height: 58vh;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.data-table th {
  position: sticky;
  top: 0;
  background: var(--ds-primary-dark, #243656);
  color: #fff;
  padding: 6px 6px;
  text-align: left;
  border: 1px solid #1b2d4a;
  font-weight: 700;
  white-space: nowrap;
  z-index: 2;
}
.data-table th.sortable {
  cursor: pointer;
  user-select: none;
}
.data-table th.sortable:hover {
  background: #2e4468;
}
.data-table th.sorted {
  background: #31496f;
}
.th-sort {
  vertical-align: middle;
  margin-left: 4px;
  opacity: 0.55;
}
th.sorted .th-sort {
  opacity: 1;
}
.th-filter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: 2px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  vertical-align: middle;
  position: relative;
  border-radius: 3px;
}
.th-filter:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}
.th-filter.active {
  color: #ffd28a;
}
.th-filter .filter-dot {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #e8871e;
}
.data-table td {
  padding: 3px 6px;
  border: 1px solid #d7dde5;
  color: var(--ds-on-surface, #1b2d4a);
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.data-table tbody tr:nth-child(even) {
  background: #f4f6fa;
}
.data-table tbody tr:hover {
  background: #e9eef7;
}
.data-table tfoot td {
  position: sticky;
  bottom: 0;
  background: #eef2f9;
  font-weight: 700;
}
.c { text-align: center; }
.r { text-align: right; }
.strong { font-weight: 800; }
.row-empty {
  text-align: center;
  color: #8a94a3;
  padding: 24px !important;
}
.cell-input {
  width: 100%;
  height: 24px;
  padding: 0 4px;
  border: 1px solid transparent;
  background: transparent;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11px;
  color: var(--ds-on-surface, #1b2d4a);
  text-align: right;
  outline: none;
}
.cell-input:hover {
  border-color: #b9c3d2;
  background: #fff;
}
.cell-input:focus {
  border-color: var(--ds-primary, #3b5998);
  background: #fff;
}
.row-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  color: var(--ds-primary, #3b5998);
  cursor: pointer;
}
.row-btn:hover {
  background: #e9eef7;
}
.table-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 7px 10px;
  font-size: 10.5px;
  color: #6b7a90;
  border-top: 1px solid var(--ds-border, #b0b8c4);
  background: #f7f9fc;
}
.warn-box {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  background: #fef7e8;
  border: 1px solid #f0d29b;
  color: #92400e;
  font-size: 11.5px;
}
.dlg-label {
  display: block;
  font-size: 11px;
  font-weight: 800;
  color: #55637a;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 4px;
}
.dlg-input {
  width: 100%;
  border: 1px solid var(--ds-border, #b0b8c4);
  padding: 7px 9px;
  font-size: 12.5px;
  font-family: "Plus Jakarta Sans", sans-serif;
  color: var(--ds-on-surface, #1b2d4a);
  background: #fff;
  outline: none;
}
.dlg-input:focus {
  border-color: var(--ds-primary, #3b5998);
}
.hasil-scroll {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid #d7dde5;
}
.hasil-tabel {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.hasil-tabel th {
  position: sticky;
  top: 0;
  background: #eef2f9;
  padding: 5px 8px;
  text-align: left;
  border-bottom: 1px solid #d7dde5;
  z-index: 1;
}
.hasil-tabel td {
  padding: 4px 8px;
  border-bottom: 1px solid #eef1f5;
}
.hasil-tabel .ok { color: #1e7b30; }
.hasil-tabel .gagal { color: #c02828; }
</style>

