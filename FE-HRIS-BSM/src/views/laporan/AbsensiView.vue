<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import { api, getErrorMessage } from "@/api/axios";
import { firstDayOfMonth, todaySql } from "@/utils/format";
import {
  sortByKey,
  filterByValueSets,
  distinctValues,
  nextSort,
  sortIconName,
} from "@/utils/table";
import ColumnFilterPopup from "@/components/ColumnFilterPopup.vue";

const toast = useToast();

const filters = reactive({
  start_date: firstDayOfMonth(),
  end_date: todaySql(),
});

const loading = ref(false);
const rows = ref<any[]>([]);
const summary = ref<any>({ total_data: 0, total_masuk: 0, total_terlambat: 0, total_potong_gaji: 0 });
const loaded = ref(false);

// ── Sort & filter per kolom (lokal, popup checklist di header) ──
const sortBy = ref<string | null>(null);
const sortDir = ref<"asc" | "desc" | null>(null);
const filterSets = reactive<Record<string, string[]>>({});
const openFilterKey = ref<string | null>(null);

const hasColFilters = computed(() =>
  Object.values(filterSets).some((arr) => Array.isArray(arr) && arr.length > 0)
);

function toggleSort(key: string) {
  const s = nextSort(sortBy.value, sortDir.value, key);
  sortBy.value = s.key;
  sortDir.value = s.dir;
}

function sortIcon(key: string) {
  return sortIconName(key, sortBy.value, sortDir.value);
}

function isFilterActive(key: string): boolean {
  return !!filterSets[key] && filterSets[key].length > 0;
}

function toggleFilterPopup(key: string) {
  openFilterKey.value = openFilterKey.value === key ? null : key;
}

async function fetchDistinct(key: string): Promise<(string | number)[]> {
  return distinctValues(rows.value, key, (r, k) => r[k]);
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

const displayRows = computed(() => {
  const keys = columns.value.map((c) => c.key);
  let list = filterByValueSets(rows.value, filterSets, keys, (r, k) => r[k]);
  if (sortBy.value && sortDir.value) {
    list = sortByKey(list, sortBy.value, sortDir.value, (r, k) => r[k]);
  }
  return list;
});

const columns = computed(() => [
  { key: "Tanggal", label: "Tanggal", width: 95 },
  { key: "Hari", label: "Hari", width: 80 },
  { key: "Nik", label: "NIK", width: 100 },
  { key: "Nama", label: "Nama", width: 200 },
  { key: "Jabatan", label: "Jabatan", width: 150 },
  { key: "Nama_Unit", label: "Unit", width: 140 },
  { key: "Jam_in", label: "Jam In", width: 70 },
  { key: "Jam_out", label: "Jam Out", width: 70 },
  { key: "Keterangan", label: "Keterangan", width: 110 },
  { key: "Payroll", label: "Payroll", width: 110 },
  { key: "NoIjin", label: "No Ijin", width: 110 },
  { key: "KeteranganIjin", label: "Ket Ijin", width: 130 },
]);

function statusIcon(k: string) {
  if (k === "Masuk") return "check_circle";
  if (k === "Terlambat") return "error";
  if (k === "Potong Gaji") return "cancel";
  return "remove_circle_outline";
}

function ketClass(k: string) {
  if (k === "Masuk") return "ket-masuk";
  if (k === "Terlambat") return "ket-terlambat";
  if (k === "Potong Gaji") return "ket-potong";
  return "";
}

function cellClass(key: string, r: any) {
  if (key === "Keterangan" && r[key]) return "cell-ket";
  return "";
}

async function load() {
  if (!filters.start_date || !filters.end_date) {
    toast.error("Start dan end tanggal wajib diisi");
    return;
  }
  loading.value = true;
  loaded.value = false;
  try {
    const { data } = await api.get("/laporan/absensi", {
      params: {
        start_date: filters.start_date,
        end_date: filters.end_date,
        filters: "{}",
      },
    });
    rows.value = data.data || [];
    summary.value = data.message?.summary || {};
    loaded.value = true;
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat laporan"));
  } finally {
    loading.value = false;
  }
}

function exportCsv() {
  if (displayRows.value.length === 0) return;
  const header = columns.value.map((c) => c.label).join(",");
  const lines = displayRows.value.map((r) =>
    columns.value.map((c) => `"${(r[c.key] ?? "").toString().replace(/"/g, '""')}"`).join(",")
  );
  const blob = new Blob(["\ufeff" + [header, ...lines].join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `laporan-absensi_${filters.start_date}_${filters.end_date}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h2 class="page-title">Laporan Absensi</h2>
        <div class="page-sub">Rekap kehadiran karyawan per periode</div>
      </div>
      <div class="head-actions">
        <div class="period-inline">
          <label>Dari</label>
          <input v-model="filters.start_date" type="date" />
          <label>Sampai</label>
          <input v-model="filters.end_date" type="date" />
        </div>
        <button v-if="hasColFilters" class="btn" title="Bersihkan filter kolom" @click="clearColFilters">
          <MsIcon name="filter_list_off" :size="15" />
        </button>
        <button class="btn primary" :disabled="loading" @click="load">
          <MsIcon name="refresh" :size="15" /> {{ loading ? "Memuat..." : "Muat Laporan" }}
        </button>
        <button class="btn" :disabled="displayRows.length === 0" @click="exportCsv">
          <MsIcon name="download" :size="15" /> Export CSV
        </button>
      </div>
    </div>

    <div v-if="loaded" class="summary-strip">
      <div class="sum-item"><span class="sum-icon total"><MsIcon name="table_rows" :size="15" /></span><b>{{ summary.total_data }}</b> Total</div>
      <div class="sum-item"><span class="sum-icon masuk"><MsIcon name="check_circle" :size="15" /></span><b>{{ summary.total_masuk }}</b> Masuk</div>
      <div class="sum-item"><span class="sum-icon terlambat"><MsIcon name="error" :size="15" /></span><b>{{ summary.total_terlambat }}</b> Terlambat</div>
      <div class="sum-item"><span class="sum-icon potong"><MsIcon name="cancel" :size="15" /></span><b>{{ summary.total_potong_gaji }}</b> Potong Gaji</div>
    </div>

    <div class="table-card">
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th
                v-for="(c, idx) in columns"
                :key="c.key"
                :style="{ width: c.width + 'px' }"
                class="sortable"
                :class="{ sorted: sortBy === c.key }"
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
                  :class="{ 'align-right': idx > columns.length / 2 }"
                  :col-label="c.label"
                  :selected="filterSets[c.key] || []"
                  :fetch-values="() => fetchDistinct(c.key)"
                  @apply="(vals) => applyFilterSet(c.key, vals)"
                  @close="openFilterKey = null"
                  @click.stop
                />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading"><td :colspan="columns.length" class="row-empty">Memuat data...</td></tr>
            <tr v-else-if="loaded && displayRows.length === 0"><td :colspan="columns.length" class="row-empty">Tidak ada data</td></tr>
            <tr v-for="(r, i) in displayRows" :key="i">
              <td v-for="c in columns" :key="c.key" :class="cellClass(c.key, r)">
                <span v-if="c.key === 'Keterangan' && r[c.key]" class="ket-chip" :class="ketClass(r[c.key])">
                  <MsIcon :name="statusIcon(r[c.key])" :size="12" /> {{ r[c.key] }}
                </span>
                <template v-else>{{ r[c.key] ?? "-" }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: "AbsensiView",
};
</script>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
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
.period-inline input {
  border: none;
  outline: none;
  font-size: 12px;
  font-family: "Plus Jakarta Sans", sans-serif;
  color: var(--ds-on-surface, #1b2d4a);
  background: transparent;
}
.btn {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  color: var(--ds-on-surface, #1b2d4a);
  font-size: 11.5px;
  font-weight: 700;
  font-family: "Plus Jakarta Sans", sans-serif;
  cursor: pointer;
}
.btn.primary {
  background: var(--ds-primary, #3b5998);
  border-color: var(--ds-primary-dark, #2c4472);
  color: #fff;
}
.btn.active {
  background: #dbe4f3;
  border-color: var(--ds-primary, #3b5998);
  color: var(--ds-primary, #3b5998);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn:hover:not(:disabled) {
  filter: brightness(0.96);
}
.summary-strip {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
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
.sum-icon.terlambat { background: #e8871e; }
.sum-icon.potong { background: #d63031; }
.table-card {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
}
.table-scroll {
  overflow: auto;
  max-height: 62vh;
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
  padding: 6px 8px;
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
  padding: 5px 8px;
  border: 1px solid #d7dde5;
  color: var(--ds-on-surface, #1b2d4a);
  white-space: nowrap;
}
.data-table tbody tr:nth-child(even) {
  background: #f4f6fa;
}
.data-table tbody tr:hover {
  background: #e9eef7;
}
.row-empty {
  text-align: center;
  color: #8a94a3;
  padding: 24px !important;
}
.ket-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 3px;
  font-weight: 700;
}
.ket-masuk { background: #d3f0d9; color: #1e7b30; }
.ket-terlambat { background: #fdecc8; color: #ae5f0e; }
.ket-potong { background: #fbdCDC; color: #c02828; }
.cell-ket { text-align: center; }
</style>