<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import CetakSlipGajiBsm, { type SlipGajiBsmItem } from "@/components/CetakSlipGajiBsm.vue";
import { api, getErrorMessage } from "@/api/axios";
import { formatNumber } from "@/utils/format";
import { sortByKey, nextSort, sortIconName, filterByValueSets, distinctValues, type SortDir } from "@/utils/table";
import ColumnFilterPopup from "@/components/ColumnFilterPopup.vue";
import {
  folderApiTersedia,
  muatFolder,
  simpanFolder,
  pastikanIzinTulis,
  type DirHandle,
} from "@/utils/folderAccess";

/**
 * Proses Gaji BSM — duplikasi form Delphi ufrmProsesGaji
 * (D:\program\hrd bsm) memakai database server kedua.
 *
 * Alur: pilih periode -> Muat Karyawan (master) -> Tarik Absensi (dari
 * rekap absensi server utama) -> koreksi manual bila perlu -> Muat
 * Tersimpan / Simpan -> slip.
 *
 * Catatan:
 *  - Grid hanya untuk unit "PT Bumi Sarana Maju" (BSM Olshop, Rotiq, dll
 *    tidak ikut proses gaji modul ini).
 *  - Kolom Tidak Masuk / Terlambat / Pot. Hari ditarik dari laporan Rekap
 *    Absensi (procedure rekap_absensiv3 di server utama) karena server BSM
 *    tidak punya routine rekap & datanya mentok 2021. Angsuran masih
 *    diisi manual karena zkaryawanall tidak ada.
 */

interface RowGajiBsm {
  nik: string;
  nama: string;
  jabatan: string;
  unit: string;
  gapok: number;
  tkompetensi: number;
  tjabatan: number;
  potjabatan: number;
  tabsensi: number;
  bpjstk: number;
  bpjs: number;
  koperasi: number;
  tidakmasuk: number;
  terlambat: number;
  potonghari: number;
  angsuran: number;
  pph21: number;
  potTerlambat: number;
  potHarikerja: number;
  potTidakmasuk: number;
  potongan: number;
  total: number;
  rekening: string;
  email: string;
}

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const toast = useToast();
const slipRef = ref<InstanceType<typeof CetakSlipGajiBsm> | null>(null);

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

const rows = ref<RowGajiBsm[]>([]);
const loading = ref(false);
const absenLoading = ref(false);
const saving = ref(false);
const adaDataTersimpan = ref<number | null>(null);

/** Sort lokal per kolom (klik judul kolom: asc -> desc -> mati) */
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

const sortedRows = computed(() => {
  if (!sortBy.value || !sortDir.value) return filteredRows.value;
  return sortByKey(filteredRows.value, sortBy.value, sortDir.value, (r, k) => r[k as keyof RowGajiBsm]);
});

/** Pencarian lokal: NIK, nama, jabatan, unit, rekening */
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
  return distinctValues(rows.value, key, (r, k) => r[k as keyof RowGajiBsm]);
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
  let list = filterByValueSets(rows.value, filterSets, filterKeys.value, (r, k) => r[k as keyof RowGajiBsm]);
  const k = kataKunci.value.trim().toLowerCase();
  if (!k) return list;
  return list.filter((r) =>
    [r.nik, r.nama, r.jabatan, r.unit, r.rekening].some((v) =>
      String(v || "").toLowerCase().includes(k)
    )
  );
});

const konfirmasiJumlah = ref(0);
const simpanDialog = ref(false);
const simpanOke = ref(false);
const pdfExport = reactive({ jalan: false, sudah: 0, total: 0 });

const num = (v: unknown): number => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

/** Rincian & total mengikuti rumus InsertNilai2 di Delphi */
function recalc(r: RowGajiBsm) {
  const potTerlambat = num(r.terlambat) * 5000;
  const potHarikerja = (num(r.potonghari) * (num(r.gapok) + (num(r.tjabatan) - num(r.potjabatan)) + num(r.tabsensi))) / 25;
  const potTidakmasuk = (num(r.tidakmasuk) * num(r.tabsensi)) / 25;
  const dasar = num(r.gapok) + (num(r.tjabatan) - num(r.potjabatan)) + num(r.tkompetensi) + num(r.tabsensi);
  const potongan =
    num(r.bpjs) + num(r.bpjstk) + num(r.koperasi) + num(r.angsuran) +
    potTerlambat + potHarikerja + potTidakmasuk + num(r.pph21);
  r.potTerlambat = potTerlambat;
  r.potHarikerja = potHarikerja;
  r.potTidakmasuk = potTidakmasuk;
  r.potongan = potongan;
  r.total = dasar - potongan;
}

const namaBulan = computed(() => BULAN[filters.periode - 1] || "");
const periodeLabel = computed(() => `${namaBulan.value} ${filters.tahun}`);
const slipRows = computed(() => sortedRows.value as unknown as SlipGajiBsmItem[]);

const total = computed(() => {
  const t = {
    gapok: 0,
    tunjangan: 0,
    potongan: 0,
    pph21: 0,
    angsuran: 0,
    total: 0,
  };
  for (const r of sortedRows.value) {
    t.gapok += num(r.gapok);
    t.tunjangan += num(r.tjabatan) + num(r.tkompetensi) + num(r.tabsensi);
    t.potongan += num(r.potongan);
    t.pph21 += num(r.pph21);
    t.angsuran += num(r.angsuran);
    t.total += num(r.total);
  }
  return t;
});

const fmt = (v: number, dec = 0) =>
  formatNumber(Number(v.toFixed(dec)));

/**
 * Cutoff absensi: 21 bulan sebelumnya s/d 20 bulan terpilih.
 * Gaji periode 9/2026 memakai absensi 21/08/2026 - 20/09/2026.
 * (Diverifikasi cocok dengan data tersimpan tgajibulanan 9/2026)
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

/** Tombol untuk mengembalikan ke cutoff resmi (21 s/d 20) */
function pakaiCutoff() {
  setDefaultRange();
  toast.info(`Rentang absensi disetel ke cutoff ${rangeLabel.value}`);
}

function kosongkanGrid() {
  rows.value = [];
  adaDataTersimpan.value = null;
}

function barisDariMaster(d: any): RowGajiBsm {
  const r: RowGajiBsm = {
    nik: d.nik,
    nama: d.nama,
    jabatan: d.jabatan || "",
    unit: d.unit || "",
    gapok: num(d.gapok),
    tkompetensi: num(d.tkompetensi),
    tjabatan: num(d.tjabatan),
    potjabatan: 0,
    tabsensi: num(d.tabsensi),
    bpjstk: num(d.bpjstk),
    bpjs: num(d.bpjs),
    koperasi: num(d.koperasi),
    tidakmasuk: 0,
    terlambat: 0,
    potonghari: 0,
    angsuran: 0,
    pph21: num(d.pph21),
    potTerlambat: 0,
    potHarikerja: 0,
    potTidakmasuk: 0,
    potongan: 0,
    total: 0,
    rekening: (d.rekening || "").trim(),
    email: (d.email || "").trim(),
  };
  recalc(r);
  return r;
}

/** 1. Muat master karyawan (InsertNilai) */
async function muatKaryawan() {
  loading.value = true;
  try {
    const { data } = await api.get("/gaji-bsm/karyawan");
    const list: any[] = data.data || [];
    rows.value = list.map(barisDariMaster);
    adaDataTersimpan.value = null;
    toast.success(`${rows.value.length} karyawan unit PT Bumi Sarana Maju dimuat`);
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data karyawan"));
  } finally {
    loading.value = false;
  }
}

/** 2. Tarik absensi dari rekap absensi server utama (rekap_absensiv3) */
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
    const { data } = await api.get("/gaji-bsm/absensi", {
      params: { start_date: filters.start_date, end_date: filters.end_date },
    });
    const list: any[] = data.data?.rows || [];
    const peta = new Map(rows.value.map((r) => [r.nik, r]));

    let cocok = 0;
    for (const a of list) {
      const r = peta.get(String(a.nik).trim());
      if (!r) continue;
      r.tidakmasuk = num(a.tidakmasuk);
      r.terlambat = num(a.terlambat);
      r.potonghari = num(a.potonghari);
      recalc(r);
      cocok += 1;
    }

    const tanpaData: string[] = data.data?.tanpaData || [];
    if (cocok === 0) {
      toast.warning("Tidak ada rekap absensi yang cocok dengan NIK di grid");
    } else {
      toast.success(
        `Absensi ${rangeLabel.value} terproses untuk ${cocok} karyawan` +
          (tanpaData.length > 0 ? `, ${tanpaData.length} karyawan tanpa data absensi` : "")
      );
    }
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menarik data absensi"));
  } finally {
    absenLoading.value = false;
  }
}

/** 3. Muat data yang sudah tersimpan (InsertNilai2) */
async function muatTersimpan() {
  loading.value = true;
  try {
    const { data } = await api.get("/gaji-bsm", {
      params: { periode: filters.periode, tahun: filters.tahun },
    });
    const list: any[] = data.data?.rows || [];
    rows.value = list.map((d) => {
      const r: RowGajiBsm = {
        nik: d.nik,
        nama: d.nama,
        jabatan: d.jabatan || "",
        unit: d.unit || "",
        gapok: num(d.gapok),
        tkompetensi: num(d.tkompetensi),
        tjabatan: num(d.tjabatan),
        potjabatan: num(d.potjabatan),
        tabsensi: num(d.tabsensi),
        bpjstk: num(d.bpjstk),
        bpjs: num(d.bpjs),
        koperasi: num(d.koperasi),
        tidakmasuk: num(d.tidakmasuk),
        terlambat: num(d.terlambat),
        potonghari: num(d.potonghari),
        angsuran: num(d.angsuran),
        pph21: num(d.pph21),
        potTerlambat: num(d.potTerlambat),
        potHarikerja: num(d.potHarikerja),
        potTidakmasuk: num(d.potTidakmasuk),
        potongan: num(d.potongan),
        total: num(d.total),
        rekening: (d.rekening || "").trim(),
        email: (d.email || "").trim(),
      };
      recalc(r);
      return r;
    });
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

/** Cek apakah periode ini sudah punya data (untuk peringatan sebelum simpan) */
async function cekTersimpan(): Promise<number> {
  try {
    const { data } = await api.get("/gaji-bsm", {
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

/** 3. Simpan: hapus periode lama lalu insert ulang (1 transaksi di server) */
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
        unit: r.unit,
        jabatan: r.jabatan,
        gapok: num(r.gapok),
        tkompetensi: num(r.tkompetensi),
        tjabatan: num(r.tjabatan),
        potjabatan: num(r.potjabatan),
        tabsensi: num(r.tabsensi),
        bpjstk: num(r.bpjstk),
        bpjs: num(r.bpjs),
        koperasi: num(r.koperasi),
        tidakmasuk: num(r.tidakmasuk),
        terlambat: num(r.terlambat),
        potonghari: num(r.potonghari),
        angsuran: num(r.angsuran),
        pph21: num(r.pph21),
      })),
    };
    const { data } = await api.post("/gaji-bsm/simpan", payload);
    adaDataTersimpan.value = data.data?.jumlah ?? rows.value.length;
    toast.success(data.message || "Data gaji berhasil disimpan");
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menyimpan data gaji"));
  } finally {
    saving.value = false;
  }
}

function exportCsv() {
  if (rows.value.length === 0) return;
  const header = [
    "NIK", "Nama", "Jabatan", "Unit", "Gaji Pokok", "Tunjangan Jabatan",
    "Tunjangan Kompetensi", "Tunjangan Absensi", "Potongan Jabatan", "BPJS",
    "BPJS TK", "Koperasi", "Tidak Masuk", "Terlambat", "Potong Hari",
    "Angsuran", "PPh21", "Total Potongan", "Total Gaji", "Rekening",
  ];
  const lines = sortedRows.value.map((r) =>
    [
      r.nik, r.nama, r.jabatan, r.unit, num(r.gapok), num(r.tjabatan), num(r.tkompetensi),
      num(r.tabsensi), num(r.potjabatan), num(r.bpjs), num(r.bpjstk), num(r.koperasi),
      num(r.tidakmasuk), num(r.terlambat), num(r.potonghari), num(r.angsuran), num(r.pph21),
      num(r.potongan), num(r.total), r.rekening,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob(["\ufeff" + [header.join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gaji-bsm_${filters.tahun}_${String(filters.periode).padStart(2, "0")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function cetakSlip(list: SlipGajiBsmItem[]) {
  if (list.length === 0) {
    toast.warning("Tidak ada slip untuk dicetak");
    return;
  }
  const ok = slipRef.value?.print(list);
  if (!ok) toast.warning("Popup cetak diblokir browser, izinkan pop-up untuk situs ini");
}

function cetakSemua() {
  cetakSlip(slipRows.value);
}

function slipDari(r: RowGajiBsm): SlipGajiBsmItem {
  return { ...r } as unknown as SlipGajiBsmItem;
}

/** Export semua slip di grid ke PDF, satu file per NIK, langsung ke folder lokal. */
async function exportSemuaPdf() {
  if (sortedRows.value.length === 0) {
    toast.warning("Tidak ada data untuk di-export");
    return;
  }

  if (!folderApiTersedia()) {
    return exportLewatUnduhan();
  }

  let dir = await muatFolder();
  if (!dir) {
    toast.info("Pada dialog yang muncul, pilih folder D:\\program\\hrd\\report");
    try {
      dir = (await window.showDirectoryPicker?.({ id: "gaji-bsm-pdf", mode: "readwrite" })) || null;
    } catch {
      return; // user membatalkan dialog
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
      const item = slipDari(r);
      const hasil = await slipRef.value?.renderPdfBlob(item);
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

/** Cadangan: unduh satu per satu bila Folder API tidak tersedia */
async function exportLewatUnduhan() {
  pdfExport.jalan = true;
  pdfExport.sudah = 0;
  pdfExport.total = sortedRows.value.length;
  let gagal = 0;
  for (const r of sortedRows.value) {
    try {
      await slipRef.value?.exportPdfFile(slipDari(r));
    } catch {
      gagal += 1;
    }
    pdfExport.sudah += 1;
    await new Promise((res) => setTimeout(res, 400));
  }
  pdfExport.jalan = false;
  if (gagal === 0) {
    toast.success(
      `${pdfExport.total} file PDF terunduh (format NIK_BULANTAHUN.pdf). ` +
        "Jika browser meminta izin unduhan ganda, pilih Izinkan."
    );
  } else {
    toast.warning(`Selesai dengan ${gagal} gagal dari ${pdfExport.total} karyawan`);
  }
}

interface HasilEmail {
  nik: string;
  nama: string;
  email: string;
  file: string;
  status: string;
}

/** Kirim slip gaji via email ke tiap karyawan (PDF dilampirkan) */
const emailDialog = ref(false);
const emailSubject = ref("");
const emailMessage = ref("");
const emailHasil = ref<HasilEmail[]>([]);
const emailKirim = reactive({ jalan: false, sudah: 0, total: 0 });
const tesSmtpJalan = ref(false);

async function tesKoneksiSmtp() {
  tesSmtpJalan.value = true;
  try {
    const { data } = await api.get("/gaji-bsm/smtp-test");
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
    const item = slipDari(r);
    try {
      const pdf = await slipRef.value?.renderPdfBlob(item);
      if (!pdf) throw new Error("Gagal membuat PDF");
      const { data } = await api.post("/gaji-bsm/kirim-slip", {
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

const sortableColumns = [
  { key: "nik", label: "NIK", width: "100px", align: "" },
  { key: "nama", label: "Nama", width: "170px", align: "" },
  { key: "jabatan", label: "Jabatan", width: "120px", align: "" },
  { key: "unit", label: "Unit", width: "110px", align: "" },
  { key: "gapok", label: "Gaji Pokok", width: "100px", align: "r" },
  { key: "tjabatan", label: "Tunj. Jabatan", width: "105px", align: "r" },
  { key: "tkompetensi", label: "Tunj. Kompetensi", width: "110px", align: "r" },
  { key: "tabsensi", label: "Tunj. Absensi", width: "105px", align: "r" },
  { key: "potjabatan", label: "Pot. Jabatan", width: "100px", align: "c" },
  { key: "bpjs", label: "BPJS", width: "90px", align: "c" },
  { key: "bpjstk", label: "BPJS TK", width: "90px", align: "c" },
  { key: "koperasi", label: "Koperasi", width: "90px", align: "c" },
  { key: "tidakmasuk", label: "Tidak Masuk", width: "95px", align: "c" },
  { key: "terlambat", label: "Terlambat", width: "85px", align: "c" },
  { key: "potonghari", label: "Pot. Hari", width: "85px", align: "c" },
  { key: "angsuran", label: "Angsuran", width: "90px", align: "c" },
  { key: "pph21", label: "PPh21", width: "90px", align: "c" },
  { key: "potongan", label: "Total Potongan", width: "115px", align: "r" },
  { key: "rekening", label: "Rekening", width: "120px", align: "" },
  { key: "total", label: "Total", width: "120px", align: "r" },
] as const;

onMounted(() => {
  setDefaultRange();
  void cekTersimpan();
});
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h2 class="page-title">Proses Gaji BSM</h2>
        <div class="page-sub">Gaji bulanan &amp; tunjangan unit PT Bumi Sarana Maju (server BSM)</div>
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
        <button
          class="btn"
          title="Kembalikan rentang ke cutoff resmi: 21 bulan lalu s/d 20 bulan ini"
          @click="pakaiCutoff"
        >
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
          title="Tarik Tidak Masuk / Terlambat / Pot. Hari dari Laporan Rekap Absensi"
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
        <b>{{ fmt(total.gapok) }}</b> Gaji Pokok
      </div>
      <div class="sum-item">
        <span class="sum-icon lembur"><MsIcon name="card_giftcard" :size="15" /></span>
        <b>{{ fmt(total.tunjangan) }}</b> Total Tunjangan
      </div>
      <div class="sum-item">
        <span class="sum-icon potong"><MsIcon name="cancel" :size="15" /></span>
        <b>{{ fmt(total.potongan) }}</b> Total Potongan
      </div>
      <div class="sum-item">
        <span class="sum-icon total"><MsIcon name="account_balance_wallet" :size="15" /></span>
        <b>{{ fmt(total.total) }}</b> Total Gaji
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
              <td :colspan="22" class="row-empty">Memuat data...</td>
            </tr>
            <tr v-else-if="rows.length === 0">
              <td :colspan="22" class="row-empty">
                Belum ada data. Klik "Muat Karyawan" atau "Muat Tersimpan" untuk periode ini.
              </td>
            </tr>
            <tr v-for="(r, i) in sortedRows" :key="r.nik">
              <td class="c">{{ i + 1 }}</td>
              <td>{{ r.nik }}</td>
              <td :title="r.nama">{{ r.nama }}</td>
              <td :title="r.jabatan">{{ r.jabatan }}</td>
              <td>{{ r.unit || "-" }}</td>
              <td class="r">{{ fmt(r.gapok) }}</td>
              <td class="c"><input v-model.number="r.tjabatan" class="cell-input" type="number" min="0" step="1000" @input="recalc(r)" /></td>
              <td class="c"><input v-model.number="r.tkompetensi" class="cell-input" type="number" min="0" step="1000" @input="recalc(r)" /></td>
              <td class="c"><input v-model.number="r.tabsensi" class="cell-input" type="number" min="0" step="1000" @input="recalc(r)" /></td>
              <td class="c"><input v-model.number="r.potjabatan" class="cell-input" type="number" min="0" step="1000" @input="recalc(r)" /></td>
              <td class="c"><input v-model.number="r.bpjs" class="cell-input" type="number" min="0" step="1000" @input="recalc(r)" /></td>
              <td class="c"><input v-model.number="r.bpjstk" class="cell-input" type="number" min="0" step="1000" @input="recalc(r)" /></td>
              <td class="c"><input v-model.number="r.koperasi" class="cell-input" type="number" min="0" step="1000" @input="recalc(r)" /></td>
              <td class="c"><input v-model.number="r.tidakmasuk" class="cell-input" type="number" min="0" step="1" @input="recalc(r)" /></td>
              <td class="c"><input v-model.number="r.terlambat" class="cell-input" type="number" min="0" step="1" @input="recalc(r)" /></td>
              <td class="c"><input v-model.number="r.potonghari" class="cell-input" type="number" min="0" step="1" @input="recalc(r)" /></td>
              <td class="c"><input v-model.number="r.angsuran" class="cell-input" type="number" min="0" step="1000" @input="recalc(r)" /></td>
              <td class="c"><input v-model.number="r.pph21" class="cell-input" type="number" min="0" step="1000" @input="recalc(r)" /></td>
              <td class="r">{{ fmt(r.potongan) }}</td>
              <td>{{ r.rekening || "-" }}</td>
              <td class="r strong">{{ fmt(r.total) }}</td>
              <td class="c">
                <button class="row-btn" title="Cetak slip gaji" @click="cetakSlip([slipDari(r)])">
                  <MsIcon name="print" :size="14" />
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot v-if="rows.length > 0">
            <tr>
              <td colspan="5" class="r strong">TOTAL</td>
              <td class="r strong">{{ fmt(total.gapok) }}</td>
              <td colspan="4" class="r strong">{{ fmt(total.tunjangan) }}</td>
              <td colspan="8"></td>
              <td class="r strong">{{ fmt(total.potongan) }}</td>
              <td></td>
              <td class="r strong">{{ fmt(total.total) }}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="table-note">
        <MsIcon name="info" :size="13" />
        Klik judul kolom untuk mengurutkan (naik &rarr; turun &rarr; batal) dan ikon filter di tiap
        judul kolom untuk menyaring nilai tertentu. Kolom <b>Gaji Pokok</b>, <b>Rekening</b> dan
        <b>Total Potongan</b> terkunci (otomatis dari master karyawan). Sisa kolom bisa diedit.
        <b>Total Gaji</b> = Gaji Pokok + (Tunjangan Jabatan - Potongan Jabatan) + Tunjangan
        Kompetensi + Tunjangan Absensi - seluruh potongan. Tombol <b>Tarik Absensi</b> mengisi kolom
        <b>Tidak Masuk</b> (cuti tahunan + sakit + cuti khusus), <b>Terlambat</b> dan
        <b>Pot. Hari</b> dari Laporan Rekap Absensi; <b>Angsuran</b> masih diisi manual.
        Cutoff absensi mengikuti periode gaji: <b>21 bulan sebelumnya s/d 20 bulan terpilih</b>
        (mis. gaji September 2026 memakai absensi 21/08/2026 - 20/09/2026) — tombol
        <b>Cutoff 21-20</b> mengembalikan rentang ke aturan itu. Proses ini khusus unit
        <b>PT Bumi Sarana Maju</b> (BSM Olshop, Rotiq, dan unit lain tidak ikut). Menyimpan akan
        menghapus data periode ini lalu menyimpan ulang.
      </div>
    </div>

    <CetakSlipGajiBsm ref="slipRef" :rows="slipRows" :periode="filters.periode" :tahun="filters.tahun" />

    <!-- Konfirmasi simpan -->
    <v-dialog v-model="simpanDialog" max-width="440" persistent>
      <v-card rounded="false">
        <v-card-item class="py-3">
          <div class="d-flex align-center">
            <span class="material-symbols-outlined" style="color: #d97706; margin-right: 8px">warning</span>
            <v-card-title class="text-body-1 font-weight-bold pa-0">Simpan Data Gaji BSM</v-card-title>
          </div>
        </v-card-item>
        <v-card-text class="text-body-2">
          <div class="mb-2">
            Periode <b>{{ periodeLabel }}</b> dengan <b>{{ rows.length }}</b> karyawan.
          </div>
          <div v-if="konfirmasiJumlah > 0" class="warn-box">
            Sudah ada <b>{{ konfirmasiJumlah }}</b> data tersimpan pada periode ini. Data lama
            akan dihapus lalu diganti dengan data di atas.
          </div>
          <div v-else>Belum ada data tersimpan pada periode ini.</div>
          <div class="text-caption mt-2">
            Hanya karyawan unit <b>PT Bumi Sarana Maju</b> yang tersimpan. Karyawan unit lain
            (mis. BSM Olshop) yang ada di periode ini akan ikut terhapus.
          </div>
        </v-card-text>
        <v-card-actions class="pa-4 pt-2">
          <v-spacer />
          <v-btn variant="text" color="grey-darken-2" @click="simpanDialog = false">Batal</v-btn>
          <v-btn color="primary" variant="flat" @click="simpanOke = true; simpan()">Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Kirim slip gaji via email -->
    <v-dialog v-model="emailDialog" max-width="640" persistent scrollable>
      <v-card rounded="false">
        <v-card-item class="py-3">
          <div class="d-flex align-center">
            <span class="material-symbols-outlined" style="color: #3b5998; margin-right: 8px">send</span>
            <v-card-title class="text-body-1 font-weight-bold pa-0">Kirim Slip Gaji BSM via Email</v-card-title>
          </div>
        </v-card-item>
        <v-card-text class="text-body-2">
          <div class="mb-3">
            Slip periode <b>{{ periodeLabel }}</b> dikirim ke <b>{{ sortedRows.length }}</b> karyawan
            di grid ({{ emailAdaAlamat }} punya alamat email). Tiap karyawan menerima PDF
            slip gajinya masing-masing sebagai lampiran.
          </div>
          <div class="mb-3">
            <label class="dlg-label">Subjek Email</label>
            <input v-model="emailSubject" type="text" class="dlg-input" :disabled="emailKirim.jalan" />
          </div>
          <div class="mb-1">
            <label class="dlg-label">Pesan / Isi Email</label>
            <textarea v-model="emailMessage" rows="3" class="dlg-input" :disabled="emailKirim.jalan" />
          </div>
          <div v-if="emailKirim.jalan" class="my-3">
            <v-progress-linear
              :model-value="emailKirim.total ? (emailKirim.sudah / emailKirim.total) * 100 : 0"
              color="primary"
              height="8"
            />
            <div class="text-caption mt-1">Mengirim {{ emailKirim.sudah }} dari {{ emailKirim.total }}...</div>
          </div>
          <div v-if="emailHasil.length > 0" class="mt-3">
            <div class="text-subtitle-2 font-weight-bold mb-1">Hasil Pengiriman:</div>
            <div class="hasil-scroll">
              <table class="hasil-tabel">
                <thead>
                  <tr><th>NIK</th><th>Nama</th><th>Email</th><th>Status</th></tr>
                </thead>
                <tbody>
                  <tr v-for="h in emailHasil" :key="h.nik">
                    <td>{{ h.nik }}</td>
                    <td>{{ h.nama }}</td>
                    <td>{{ h.email }}</td>
                    <td class="strong" :class="h.status === 'Berhasil' ? 'ok' : 'gagal'">{{ h.status }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </v-card-text>
        <v-card-actions class="pa-4 pt-2">
          <v-btn variant="text" color="primary" :disabled="emailKirim.jalan || tesSmtpJalan" @click="tesKoneksiSmtp">
            {{ tesSmtpJalan ? "Mengetes..." : "Tes Koneksi" }}
          </v-btn>
          <v-spacer />
          <v-btn variant="text" color="grey-darken-2" :disabled="emailKirim.jalan" @click="emailDialog = false">
            {{ emailHasil.length > 0 && !emailKirim.jalan ? "Tutup" : "Batal" }}
          </v-btn>
          <v-btn color="primary" variant="flat" :disabled="emailKirim.jalan" @click="kirimEmailSemua">
            {{ emailKirim.jalan ? `Mengirim ${emailKirim.sudah}/${emailKirim.total}...` : "Kirim" }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts">
export default {
  name: "GajiBsmView",
};
</script>

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
.dlg-input:disabled {
  background: #f1f3f7;
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
