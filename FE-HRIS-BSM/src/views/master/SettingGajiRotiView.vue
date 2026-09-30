<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import CurrencyInput from "@/components/CurrencyInput.vue";
import { api, getErrorMessage } from "@/api/axios";
import { formatNumber } from "@/utils/format";
import { sortByKey, nextSort, sortIconName, type SortDir } from "@/utils/table";

/**
 * Setting Gaji Roti — hanya 2 kolom tkaryawan yang diatur:
 *  - Gaji Pokok    : bisa diedit
 *  - Gaji / Hari   : READ ONLY, otomatis = Gaji Pokok / 26
 *
 * Data karyawan: aktif unit RotiQ (sama dengan Proses Gaji Roti).
 * Nilai gaji per hari dihitung ulang di server saat Simpan, jadi kolom
 * tersebut tidak bisa diisi manual dari grid.
 */

const HARI_BULAN = 26;

interface RowSettingGajiRoti {
  nik: string;
  nama: string;
  jabatan: string;
  unit: string;
  sistemgaji: string;
  gapok: number;
  gajiperhari: number;
}

interface UnitRoti {
  kode: string;
  nama: string;
}

const toast = useToast();

const unitList = ref<UnitRoti[]>([]);
const unit = ref("");
const rows = ref<RowSettingGajiRoti[]>([]);
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

/** Pencarian lokal: NIK, nama, jabatan, unit */
const kataKunci = ref("");

const filteredRows = computed(() => {
  const k = kataKunci.value.trim().toLowerCase();
  if (!k) return rows.value;
  return rows.value.filter((r) =>
    [r.nik, r.nama, r.jabatan, r.unit].some((v) =>
      String(v || "").toLowerCase().includes(k)
    )
  );
});

const sortedRows = computed(() => {
  if (!sortBy.value || !sortDir.value) return filteredRows.value;
  return sortByKey(filteredRows.value, sortBy.value, sortDir.value, (r, k) => r[k as keyof RowSettingGajiRoti]);
});

const num = (v: unknown): number => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

const fmt = (v: number) => formatNumber(Number(Number(v || 0).toFixed(0)));

/** Gaji per hari = gaji pokok / 26 (kolom read only) */
const perHari = (gapok: number) => Math.round(num(gapok) / HARI_BULAN);

const total = computed(() => {
  let gapok = 0;
  let gajiperhari = 0;
  for (const r of sortedRows.value) {
    gapok += num(r.gapok);
    gajiperhari += perHari(r.gapok);
  }
  return { gapok, gajiperhari };
});

const unitNama = computed(
  () => unitList.value.find((u) => String(u.kode) === String(unit.value))?.nama || ""
);

const simpanDialog = ref(false);

async function muatUnit() {
  try {
    const { data } = await api.get("/setting-gaji-roti/unit");
    unitList.value = data.data || [];
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat daftar unit"));
  }
}

/** Refresh — grid karyawan aktif unit RotiQ */
async function muatData() {
  loading.value = true;
  try {
    const { data } = await api.get("/setting-gaji-roti", { params: { unit: unit.value } });
    const list: any[] = data.data || [];
    rows.value = list.map((d) => ({
      nik: d.nik,
      nama: d.nama,
      jabatan: d.jabatan || "",
      unit: d.unit || "",
      sistemgaji: d.sistemgaji || "",
      gapok: num(d.gapok),
      gajiperhari: perHari(d.gapok),
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

/** Simpan — gapok per NIK, gaji/hari dihitung server (1 transaksi) */
async function simpan() {
  simpanDialog.value = false;
  if (rows.value.length === 0) {
    toast.warning("Tidak ada data untuk disimpan");
    return;
  }
  saving.value = true;
  try {
    const payload = {
      rows: rows.value.map((r) => ({ nik: r.nik, gapok: num(r.gapok) })),
    };
    const { data } = await api.put("/setting-gaji-roti", payload);
    toast.success(data.message || "Data setting gaji berhasil disimpan");
    await muatData();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menyimpan data setting gaji"));
  } finally {
    saving.value = false;
  }
}

function exportCsv() {
  if (rows.value.length === 0) return;
  const header = ["NIK", "Nama", "Jabatan", "Unit", "Sistem Gaji", "Gaji Pokok", "Gaji/Hari"];
  const lines = sortedRows.value.map((r) =>
    [
      r.nik, r.nama, r.jabatan, r.unit, r.sistemgaji, num(r.gapok), perHari(r.gapok),
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob(["\ufeff" + [header.join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `setting-gaji-roti${unit.value ? `_${unit.value}` : ""}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const sortableColumns = [
  { key: "nik", label: "NIK", width: "110px", align: "" },
  { key: "nama", label: "Nama", width: "200px", align: "" },
  { key: "jabatan", label: "Jabatan", width: "150px", align: "" },
  { key: "unit", label: "Unit", width: "140px", align: "" },
  { key: "sistemgaji", label: "Sistem Gaji", width: "100px", align: "c" },
] as const;

const totalColspan = sortableColumns.length + 2;

onMounted(() => {
  void muatUnit();
  void muatData();
});
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h2 class="page-title">Setting Gaji Roti</h2>
        <div class="page-sub">Gaji pokok &amp; gaji per hari (rumus) karyawan unit RotiQ</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <label class="filter-label">Unit</label>
        <select v-model="unit" class="filter-select" @change="muatData">
          <option value="">Semua Unit RotiQ</option>
          <option v-for="u in unitList" :key="u.kode" :value="u.kode">{{ u.nama }}</option>
        </select>
        <button class="btn" :disabled="loading" @click="muatData">
          <MsIcon name="refresh" :size="15" /> {{ loading ? "Memuat..." : "Refresh" }}
        </button>
        <span class="badge muted">RotiQ</span>
        <span v-if="unitNama" class="badge">{{ unitNama }}</span>
        <div class="search-box">
          <MsIcon name="search" :size="14" />
          <input v-model="kataKunci" type="text" placeholder="Cari NIK / nama / jabatan..." />
          <button v-if="kataKunci" class="search-clear" title="Hapus pencarian" @click="kataKunci = ''">
            <MsIcon name="close" :size="13" />
          </button>
        </div>
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
        <b>{{ fmt(total.gapok) }}</b> Total Gaji Pokok
      </div>
      <div class="sum-item">
        <span class="sum-icon lembur"><MsIcon name="calculate" :size="15" /></span>
        <b>{{ fmt(total.gajiperhari) }}</b> Total Gaji/Hari
      </div>
      <div class="sum-item">
        <span class="sum-icon hitung"><MsIcon name="info" :size="15" /></span>
        Gaji/Hari = Gaji Pokok / {{ HARI_BULAN }}
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
                class="sortable r"
                :class="{ sorted: sortBy === 'gapok' }"
                style="width: 140px"
                title="Klik untuk mengurutkan"
                @click="toggleSort('gapok')"
              >
                Gaji Pokok
                <MsIcon :name="sortIcon('gapok')" :size="12" className="th-sort" />
              </th>
              <th
                class="sortable r readonly"
                :class="{ sorted: sortBy === 'gajiperhari' }"
                style="width: 140px"
                title="Rumus: gaji pokok / 26 (tidak bisa diedit)"
                @click="toggleSort('gajiperhari')"
              >
                Gaji/Hari
                <MsIcon :name="sortIcon('gajiperhari')" :size="12" className="th-sort" />
                <MsIcon name="lock" :size="12" className="th-lock" />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td :colspan="totalColspan" class="row-empty">Memuat data...</td>
            </tr>
            <tr v-else-if="rows.length === 0">
              <td :colspan="totalColspan" class="row-empty">
                Belum ada data. Klik "Refresh" untuk memuat karyawan unit RotiQ.
              </td>
            </tr>
            <tr v-for="(r, i) in sortedRows" :key="r.nik">
              <td class="c">{{ i + 1 }}</td>
              <td>{{ r.nik }}</td>
              <td :title="r.nama">{{ r.nama }}</td>
              <td :title="r.jabatan">{{ r.jabatan || "-" }}</td>
              <td :title="r.unit">{{ r.unit || "-" }}</td>
              <td class="c">{{ r.sistemgaji || "-" }}</td>
              <td class="c"><CurrencyInput v-model="r.gapok" class="cell-input" /></td>
              <td class="c cell-readonly" :title="`Gaji pokok ${fmt(r.gapok)} / ${HARI_BULAN}`">
                {{ fmt(perHari(r.gapok)) }}
              </td>
            </tr>
          </tbody>
          <tfoot v-if="rows.length > 0">
            <tr>
              <td :colspan="sortableColumns.length + 1" class="r strong">TOTAL</td>
              <td class="r strong">{{ fmt(total.gapok) }}</td>
              <td class="r strong">{{ fmt(total.gajiperhari) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="table-note">
        <MsIcon name="info" :size="13" />
        Kolom <b>Gaji Pokok</b> diketik langsung di grid, kolom <b>Gaji/Hari</b> terkunci
        (read only) dan selalu dihitung otomatis <b>Gaji Pokok / {{ HARI_BULAN }}</b>,
        termasuk saat menyimpan di server. Tekan <b>Simpan</b> untuk menulis
        <b>kar_gaji_pokok</b> + <b>kar_gaji_per_hari</b> pada <b>tkaryawan</b>
        (1 transaksi untuk semua baris). Hanya karyawan aktif unit <b>RotiQ</b> yang tampil.
      </div>
    </div>

    <!-- Konfirmasi simpan -->
    <v-dialog v-model="simpanDialog" max-width="440" persistent>
      <v-card rounded="false">
        <v-card-item class="py-3">
          <div class="d-flex align-center">
            <span class="material-symbols-outlined" style="color: #d97706; margin-right: 8px">warning</span>
            <v-card-title class="text-body-1 font-weight-bold pa-0">Simpan Setting Gaji Roti</v-card-title>
          </div>
        </v-card-item>
        <v-card-text class="text-body-2">
          <div class="mb-2">
            Unit <b>{{ unitNama || "Semua Unit RotiQ" }}</b> dengan <b>{{ rows.length }}</b> karyawan.
            Yakin ingin menyimpan perubahan?
          </div>
          <div class="text-caption text-medium-emphasis">
            Gaji/Hari dihitung ulang otomatis = Gaji Pokok / {{ HARI_BULAN }}.
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
  name: "SettingGajiRotiView",
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
.filter-label {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.filter-select {
  height: 30px;
  padding: 0 8px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: #fff;
  color: #1b2d4a;
  font-size: 12px;
  font-family: "Plus Jakarta Sans", sans-serif;
  max-width: 220px;
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
.sum-icon.hitung { background: #3b5998; }
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
.data-table th.readonly {
  background: #3b4757;
}
.data-table th.readonly:hover {
  background: #47546a;
}
.th-sort {
  vertical-align: middle;
  margin-left: 4px;
  opacity: 0.55;
}
.th-lock {
  vertical-align: middle;
  margin-left: 4px;
  opacity: 0.7;
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
.cell-readonly {
  background: #eceff4;
  color: #5b6472;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
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
