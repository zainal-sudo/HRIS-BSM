<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
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
const loaded = ref(false);

const columns = computed(() => {
  if (rows.value.length === 0) return [];
  return Object.keys(rows.value[0]).filter((k) => k.toLowerCase() !== "nik");
});

// ── Sort & filter per kolom (lokal, popup checklist di header) ──
const sortBy = ref<string | null>(null);
const sortDir = ref<"asc" | "desc" | null>(null);
const filterSets = reactive<Record<string, string[]>>({});
const openFilterKey = ref<string | null>(null);

const hasColFilters = computed(() =>
  Object.values(filterSets).some((arr) => Array.isArray(arr) && arr.length > 0)
);

function pickCell(r: any, k: string) {
  if (k === "NIK") return r.NIK ?? r.Nik ?? r.nik;
  return r[k];
}

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
  return distinctValues(rows.value, key, pickCell);
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
  const keys = ["NIK", ...columns.value];
  let list = filterByValueSets(rows.value, filterSets, keys, pickCell);
  if (sortBy.value && sortDir.value) {
    list = sortByKey(list, sortBy.value, sortDir.value, pickCell);
  }
  return list;
});

async function load() {
  if (!filters.start_date || !filters.end_date) {
    toast.error("Start dan end tanggal wajib diisi");
    return;
  }
  loading.value = true;
  loaded.value = false;
  try {
    const { data } = await api.get("/laporan/rekap-absensi", {
      params: {
        start_date: filters.start_date,
        end_date: filters.end_date,
        filters: "{}",
      },
    });
    rows.value = data.data || [];
    loaded.value = true;
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat rekap"));
  } finally {
    loading.value = false;
  }
}

function exportCsv() {
  if (displayRows.value.length === 0) return;
  const keys = ["NIK", ...Object.keys(rows.value[0]).filter((k) => k.toLowerCase() !== "nik")];
  const header = keys.join(",");
  const lines = displayRows.value.map((r) =>
    keys.map((k) => `"${(pickCell(r, k) ?? "").toString().replace(/"/g, '""')}"`).join(",")
  );
  const blob = new Blob(["\ufeff" + [header, ...lines].join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `rekap-absensi_${filters.start_date}_${filters.end_date}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

onMounted(load);
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h2 class="page-title">Rekap Absensi</h2>
        <div class="page-sub">Rekap per karyawan (hadir / sakit / izin / cuti / alpa)</div>
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
          <MsIcon name="refresh" :size="15" /> {{ loading ? "Memuat..." : "Muat Rekap" }}
        </button>
        <button class="btn" :disabled="displayRows.length === 0" @click="exportCsv">
          <MsIcon name="download" :size="15" /> Export CSV
        </button>
      </div>
    </div>

    <div class="table-card">
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th
                class="nik-col sortable"
                :class="{ sorted: sortBy === 'NIK' }"
                title="Klik untuk mengurutkan"
                @click="toggleSort('NIK')"
              >
                NIK<MsIcon :name="sortIcon('NIK')" :size="12" className="th-sort" />
                <button
                  class="th-filter"
                  :class="{ active: isFilterActive('NIK') || openFilterKey === 'NIK' }"
                  title="Filter kolom ini"
                  @click.stop="toggleFilterPopup('NIK')"
                >
                  <MsIcon :name="isFilterActive('NIK') ? 'filter_alt' : 'filter_list'" :size="12" />
                  <span v-if="isFilterActive('NIK')" class="filter-dot"></span>
                </button>
                <ColumnFilterPopup
                  v-if="openFilterKey === 'NIK'"
                  col-label="NIK"
                  :selected="filterSets['NIK'] || []"
                  :fetch-values="() => fetchDistinct('NIK')"
                  @apply="(vals) => applyFilterSet('NIK', vals)"
                  @close="openFilterKey = null"
                  @click.stop
                />
              </th>
              <th
                v-for="(c, idx) in columns"
                :key="c"
                class="sortable"
                :class="{ sorted: sortBy === c }"
                title="Klik untuk mengurutkan"
                @click="toggleSort(c)"
              >
                {{ c }}<MsIcon :name="sortIcon(c)" :size="12" className="th-sort" />
                <button
                  class="th-filter"
                  :class="{ active: isFilterActive(c) || openFilterKey === c }"
                  title="Filter kolom ini"
                  @click.stop="toggleFilterPopup(c)"
                >
                  <MsIcon :name="isFilterActive(c) ? 'filter_alt' : 'filter_list'" :size="12" />
                  <span v-if="isFilterActive(c)" class="filter-dot"></span>
                </button>
                <ColumnFilterPopup
                  v-if="openFilterKey === c"
                  :class="{ 'align-right': idx > columns.length / 2 }"
                  :col-label="c"
                  :selected="filterSets[c] || []"
                  :fetch-values="() => fetchDistinct(c)"
                  @apply="(vals) => applyFilterSet(c, vals)"
                  @close="openFilterKey = null"
                  @click.stop
                />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading"><td :colspan="columns.length + 1" class="row-empty">Memuat data...</td></tr>
            <tr v-else-if="loaded && displayRows.length === 0"><td :colspan="columns.length + 1" class="row-empty">Tidak ada data</td></tr>
            <tr v-for="(r, i) in displayRows" :key="i">
              <td class="nik-col">{{ r.NIK ?? r.Nik ?? r.nik ?? "-" }}</td>
              <td v-for="c in columns" :key="c" :class="{ 'num-cell': isFinite(Number(r[c])) }">
                {{ r[c] ?? "-" }}
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
  name: "RekapAbsensiView",
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
.nik-col {
  font-weight: 700;
  color: var(--ds-primary-dark, #243656);
}
.num-cell {
  text-align: right;
}
.row-empty {
  text-align: center;
  color: #8a94a3;
  padding: 24px !important;
}
</style>