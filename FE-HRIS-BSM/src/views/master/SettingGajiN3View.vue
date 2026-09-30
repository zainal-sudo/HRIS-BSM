<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import CurrencyInput from "@/components/CurrencyInput.vue";
import { api, getErrorMessage } from "@/api/axios";
import { formatNumber } from "@/utils/format";
import { sortByKey, nextSort, sortIconName, type SortDir } from "@/utils/table";

/**
 * Setting Gaji N3 — duplikasi form Delphi ufrmSettingGaji dari
 * D:\program\hrd N3 (PT Entri Jaya Makmur, kode unit 6, database hrd_entri).
 *
 * Sama seperti Setting Gaji BSM + 2 kolom: Tunj. Makan & Tunj. Transport.
 * Modul dikunci untuk unit 6 (tanpa pilihan pabrik).
 */

interface RowSettingGajiN3 {
  nik: string;
  nama: string;
  jabatan: string;
  gapok: number;
  tmakan: number;
  transport: number;
  tkompetensi: number;
  tjabatan: number;
  tlain: number;
  tbpjstk: number;
  tbpjs: number;
  tkoperasi: number;
  pph21: number;
}

const toast = useToast();

const rows = ref<RowSettingGajiN3[]>([]);
const loading = ref(false);
const saving = ref(false);

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

/** Pencarian lokal: NIK, nama, jabatan */
const kataKunci = ref("");

const filteredRows = computed(() => {
  const k = kataKunci.value.trim().toLowerCase();
  if (!k) return rows.value;
  return rows.value.filter((r) =>
    [r.nik, r.nama, r.jabatan].some((v) =>
      String(v || "").toLowerCase().includes(k)
    )
  );
});

const sortedRows = computed(() => {
  if (!sortBy.value || !sortDir.value) return filteredRows.value;
  return sortByKey(filteredRows.value, sortBy.value, sortDir.value, (r, k) => r[k as keyof RowSettingGajiN3]);
});

const num = (v: unknown): number => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

const fmt = (v: number) => formatNumber(Number(Number(v || 0).toFixed(0)));

const total = computed(() => {
  const t = { gapok: 0, tmakan: 0, transport: 0, tkompetensi: 0, tjabatan: 0, tlain: 0, tbpjstk: 0, tbpjs: 0, tkoperasi: 0, pph21: 0 };
  for (const r of sortedRows.value) {
    t.gapok += num(r.gapok);
    t.tmakan += num(r.tmakan);
    t.transport += num(r.transport);
    t.tkompetensi += num(r.tkompetensi);
    t.tjabatan += num(r.tjabatan);
    t.tlain += num(r.tlain);
    t.tbpjstk += num(r.tbpjstk);
    t.tbpjs += num(r.tbpjs);
    t.tkoperasi += num(r.tkoperasi);
    t.pph21 += num(r.pph21);
  }
  return t;
});

const simpanDialog = ref(false);

/** Refresh — setara loaddataall Delphi N3 (pabrik terkunci 6) */
async function muatData() {
  loading.value = true;
  try {
    const { data } = await api.get("/setting-gaji-n3");
    const list: any[] = data.data || [];
    rows.value = list.map((d) => ({
      nik: d.nik,
      nama: d.nama,
      jabatan: d.jabatan || "",
      gapok: num(d.gapok),
      tmakan: num(d.tmakan),
      transport: num(d.transport),
      tkompetensi: num(d.tkompetensi),
      tjabatan: num(d.tjabatan),
      tlain: num(d.tlain),
      tbpjstk: num(d.tbpjstk),
      tbpjs: num(d.tbpjs),
      tkoperasi: num(d.tkoperasi),
      pph21: num(d.pph21),
    }));
    toast.success(`${rows.value.length} karyawan dimuat`);
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data setting gaji"));
  } finally {
    loading.value = false;
  }
}

function kosongkanGrid() {
  rows.value = [];
}

/** Simpan — setara simpandata Delphi N3 */
async function simpan() {
  simpanDialog.value = false;
  if (rows.value.length === 0) {
    toast.warning("Tidak ada data untuk disimpan");
    return;
  }
  saving.value = true;
  try {
    const payload = {
      rows: rows.value.map((r) => ({
        nik: r.nik,
        gapok: num(r.gapok),
        tmakan: num(r.tmakan),
        transport: num(r.transport),
        tkompetensi: num(r.tkompetensi),
        tjabatan: num(r.tjabatan),
        tlain: num(r.tlain),
        tbpjstk: num(r.tbpjstk),
        tbpjs: num(r.tbpjs),
        tkoperasi: num(r.tkoperasi),
        pph21: num(r.pph21),
      })),
    };
    const { data } = await api.put("/setting-gaji-n3", payload);
    toast.success(data.message || "Data setting gaji berhasil disimpan");
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menyimpan data setting gaji"));
  } finally {
    saving.value = false;
  }
}

function exportCsv() {
  if (rows.value.length === 0) return;
  const header = [
    "NIK", "Nama", "Jabatan", "Gapok", "Tunj. Makan", "Tunj. Transport",
    "Tunj. Kompetensi", "Tunj. Jabatan", "Tunj. Absensi", "BPJS TK", "BPJS",
    "Koperasi", "PPh21",
  ];
  const lines = sortedRows.value.map((r) =>
    [
      r.nik, r.nama, r.jabatan, num(r.gapok), num(r.tmakan), num(r.transport),
      num(r.tkompetensi), num(r.tjabatan), num(r.tlain), num(r.tbpjstk),
      num(r.tbpjs), num(r.tkoperasi), num(r.pph21),
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob(["\ufeff" + [header.join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "setting-gaji-n3_unit6.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

const editableColumns = [
  { key: "gapok", label: "Gapok", width: "110px" },
  { key: "tmakan", label: "Tunj. Makan", width: "110px" },
  { key: "transport", label: "Tunj. Transport", width: "115px" },
  { key: "tkompetensi", label: "Tunj. Kompetensi", width: "120px" },
  { key: "tjabatan", label: "Tunj. Jabatan", width: "115px" },
  { key: "tlain", label: "Tunj. Absensi", width: "115px" },
  { key: "tbpjstk", label: "BPJS TK", width: "100px" },
  { key: "tbpjs", label: "BPJS", width: "100px" },
  { key: "tkoperasi", label: "Koperasi", width: "100px" },
  { key: "pph21", label: "PPh21", width: "100px" },
] as const;

const sortableColumns = [
  { key: "nik", label: "NIK", width: "100px", align: "" },
  { key: "nama", label: "Nama", width: "170px", align: "" },
  { key: "jabatan", label: "Jabatan", width: "140px", align: "" },
] as const;

onMounted(() => {
  void muatData();
});
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h2 class="page-title">Setting Gaji N3</h2>
        <div class="page-sub">Master tunjangan &amp; potongan gaji PT Entri Jaya Makmur (unit 6)</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <span class="badge muted">PT Entri Jaya Makmur (unit 6)</span>
        <div class="search-box">
          <MsIcon name="search" :size="14" />
          <input v-model="kataKunci" type="text" placeholder="Cari NIK / nama / jabatan..." />
          <button v-if="kataKunci" class="search-clear" title="Hapus pencarian" @click="kataKunci = ''">
            <MsIcon name="close" :size="13" />
          </button>
        </div>
        <button class="btn" :disabled="loading" @click="muatData">
          <MsIcon name="refresh" :size="15" /> {{ loading ? "Memuat..." : "Refresh" }}
        </button>
      </div>
      <div class="toolbar-right">
        <button class="btn" @click="kosongkanGrid">
          <MsIcon name="filter_list_off" :size="15" /> Kosongkan
        </button>
        <button class="btn" :disabled="rows.length === 0" @click="exportCsv">
          <MsIcon name="download" :size="15" /> Export CSV
        </button>
        <button class="btn primary" :disabled="saving || rows.length === 0" @click="simpanDialog = true">
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
        <b>{{ fmt(total.gapok) }}</b> Total Gapok
      </div>
      <div class="sum-item">
        <span class="sum-icon lembur"><MsIcon name="card_giftcard" :size="15" /></span>
        <b>{{ fmt(total.tjabatan + total.tkompetensi + total.tmakan + total.transport + total.tlain) }}</b> Total Tunjangan
      </div>
      <div class="sum-item">
        <span class="sum-icon potong"><MsIcon name="cancel" :size="15" /></span>
        <b>{{ fmt(total.tbpjs + total.tbpjstk + total.tkoperasi + total.pph21) }}</b> Total Potongan
      </div>
    </div>

    <div class="table-card">
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th class="c" style="width: 34px">No</th>
              <th
                v-for="c in sortableColumns"
                :key="c.key"
                class="sortable"
                :class="[{ sorted: sortBy === c.key }, c.align]"
                :style="{ width: c.width }"
                title="Klik untuk mengurutkan"
                @click="toggleSort(c.key)"
              >
                {{ c.label }}<MsIcon :name="sortIcon(c.key)" :size="12" className="th-sort" />
              </th>
              <th
                v-for="c in editableColumns"
                :key="c.key"
                class="sortable r"
                :class="{ sorted: sortBy === c.key }"
                :style="{ width: c.width }"
                title="Klik untuk mengurutkan"
                @click="toggleSort(c.key)"
              >
                {{ c.label }}<MsIcon :name="sortIcon(c.key)" :size="12" className="th-sort" />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td :colspan="14" class="row-empty">Memuat data...</td>
            </tr>
            <tr v-else-if="rows.length === 0">
              <td :colspan="14" class="row-empty">
                Belum ada data. Klik "Refresh" untuk memuat karyawan unit 6.
              </td>
            </tr>
            <tr v-for="(r, i) in sortedRows" :key="r.nik">
              <td class="c">{{ i + 1 }}</td>
              <td>{{ r.nik }}</td>
              <td :title="r.nama">{{ r.nama }}</td>
              <td :title="r.jabatan">{{ r.jabatan || "-" }}</td>
              <td class="c"><CurrencyInput v-model="r.gapok" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.tmakan" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.transport" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.tkompetensi" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.tjabatan" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.tlain" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.tbpjstk" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.tbpjs" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.tkoperasi" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.pph21" class="cell-input" /></td>
            </tr>
          </tbody>
          <tfoot v-if="rows.length > 0">
            <tr>
              <td colspan="4" class="r strong">TOTAL</td>
              <td class="r strong">{{ fmt(total.gapok) }}</td>
              <td class="r strong">{{ fmt(total.tmakan) }}</td>
              <td class="r strong">{{ fmt(total.transport) }}</td>
              <td class="r strong">{{ fmt(total.tkompetensi) }}</td>
              <td class="r strong">{{ fmt(total.tjabatan) }}</td>
              <td class="r strong">{{ fmt(total.tlain) }}</td>
              <td class="r strong">{{ fmt(total.tbpjstk) }}</td>
              <td class="r strong">{{ fmt(total.tbpjs) }}</td>
              <td class="r strong">{{ fmt(total.tkoperasi) }}</td>
              <td class="r strong">{{ fmt(total.pph21) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="table-note">
        <MsIcon name="info" :size="13" />
        Klik judul kolom untuk mengurutkan. Kolom <b>NIK / Nama / Jabatan</b> terkunci,
        kolom angka diketik langsung di grid lalu tekan <b>Simpan</b> (1 transaksi untuk
        semua baris, hanya unit 6). Hanya karyawan aktif dengan sistem gaji
        <b>Harian / Bulanan</b> yang tampil, sesuai form Setting Gaji Delphi N3.
      </div>
    </div>

    <!-- Konfirmasi simpan -->
    <v-dialog v-model="simpanDialog" max-width="440" persistent>
      <v-card rounded="false">
        <v-card-item class="py-3">
          <div class="d-flex align-center">
            <span class="material-symbols-outlined" style="color: #d97706; margin-right: 8px">warning</span>
            <v-card-title class="text-body-1 font-weight-bold pa-0">Simpan Setting Gaji N3</v-card-title>
          </div>
        </v-card-item>
        <v-card-text class="text-body-2">
          <div class="mb-2">
            Unit <b>PT Entri Jaya Makmur (6)</b> dengan <b>{{ rows.length }}</b> karyawan.
            Yakin ingin menyimpan perubahan?
          </div>
        </v-card-text>
        <v-card-actions class="pa-4 pt-2">
          <v-spacer />
          <v-btn variant="text" color="grey-darken-2" @click="simpanDialog = false">Batal</v-btn>
          <v-btn color="primary" variant="flat" @click="simpan()">Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts">
export default {
  name: "SettingGajiN3View",
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
</style>
