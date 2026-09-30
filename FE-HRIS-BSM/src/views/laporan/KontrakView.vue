<script setup lang="ts">
import { ref, computed, reactive, onMounted } from "vue";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import { api, getErrorMessage } from "@/api/axios";
import { sortByKey, filterByValueSets, distinctValues, nextSort, sortIconName } from "@/utils/table";
import ColumnFilterPopup from "@/components/ColumnFilterPopup.vue";

const toast = useToast();

const loading = ref(false);
const rows = ref<any[]>([]);
const selected = ref<Record<string, boolean>>({});
const batchStatus = ref<string>("");

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

function clearColFilters() {
  for (const k of Object.keys(filterSets)) delete filterSets[k];
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

const displayRows = computed(() => {
  const keys = columns.value.map((c) => c.key);
  let list = filterByValueSets(rows.value, filterSets, keys, (r, k) => r[k]);
  if (sortBy.value && sortDir.value) {
    list = sortByKey(list, sortBy.value, sortDir.value, (r, k) => r[k]);
  }
  return list;
});

const columns = computed(() => [
  { key: "NIK", label: "NIK", width: 100 },
  { key: "Nama", label: "Nama", width: 190 },
  { key: "Jabatan", label: "Jabatan", width: 140 },
  { key: "Departmen", label: "Departemen", width: 130 },
  { key: "Unit", label: "Unit", width: 130 },
  { key: "TanggalMasuk", label: "Tgl Masuk", width: 95 },
  { key: "BerakhirKontrak", label: "Berakhir Kontrak", width: 115 },
  { key: "BulanKontrak", label: "Bulan", width: 80 },
  { key: "SisaHari", label: "Sisa Hari", width: 75 },
  { key: "PKWT", label: "PKWT Ke", width: 70 },
  { key: "StatusPKWT", label: "Status PKWT", width: 100 },
  { key: "MasaKerja", label: "Masa Kerja", width: 120 },
  { key: "MasaKerja3Tahun", label: ">3 Thn", width: 60 },
]);

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get("/report/kontrak-berakhir");
    rows.value = data.data || [];
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat laporan kontrak"));
  } finally {
    loading.value = false;
  }
}

function toggleAll() {
  const all = displayRows.value.every((r) => selected.value[r.NIK]);
  displayRows.value.forEach((r) => {
    selected.value[r.NIK] = !all;
  });
}

function hasSelection() {
  return Object.values(selected.value).some(Boolean);
}

async function updateStatus() {
  const niks = Object.keys(selected.value).filter((k) => selected.value[k]);
  if (niks.length === 0 || !batchStatus.value) {
    toast.error("Pilih karyawan dan status tujuan");
    return;
  }
  try {
    await api.put("/kontrak/update-status", {
      niks,
      status: batchStatus.value,
    });
    toast.success(`Status ${niks.length} karyawan diupdate ke ${batchStatus.value}`);
    selected.value = {};
    await load();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal update status"));
  }
}

function exportCsv() {
  const list = displayRows.value;
  if (list.length === 0) return;
  const header = columns.value.map((c) => c.label).join(",");
  const lines = list.map((r) =>
    columns.value.map((c) => `"${(r[c.key] ?? "").toString().replace(/"/g, '""')}"`).join(",")
  );
  const blob = new Blob(["\ufeff" + [header, ...lines].join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "laporan-kontrak-berakhir.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

onMounted(load);
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h2 class="page-title">Kontrak Berakhir</h2>
        <div class="page-sub">Karyawan kontrak yang berakhir dalam 60 hari ke depan</div>
      </div>
      <div class="head-actions">
        <button v-if="hasColFilters" class="btn" title="Bersihkan filter kolom" @click="clearColFilters">
          <MsIcon name="filter_list_off" :size="15" />
        </button>
        <button class="btn primary" :disabled="loading" @click="load">
          <MsIcon name="refresh" :size="15" /> {{ loading ? "Memuat..." : "Muat Ulang" }}
        </button>
        <button class="btn" :disabled="displayRows.length === 0" @click="exportCsv">
          <MsIcon name="download" :size="15" /> Export CSV
        </button>
      </div>
    </div>

    <div class="batch-bar" v-if="hasSelection()">
      <span class="batch-count">{{ Object.values(selected).filter(Boolean).length }} karyawan terpilih</span>
      <select v-model="batchStatus">
        <option value="">Pilih status baru...</option>
        <option value="Tetap">Tetap</option>
        <option value="PKWT">PKWT</option>
        <option value="">Hapus Status</option>
      </select>
      <button class="btn small primary" @click="updateStatus">
        <MsIcon name="check" :size="14" /> Update Status
      </button>
    </div>

    <div class="table-card">
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th class="sel-col">
                <input
                  type="checkbox"
                  :checked="displayRows.length > 0 && displayRows.every((r) => selected[r.NIK])"
                  @change="toggleAll"
                />
              </th>
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
            <tr v-if="loading"><td :colspan="columns.length + 1" class="row-empty">Memuat data...</td></tr>
            <tr v-else-if="displayRows.length === 0"><td :colspan="columns.length + 1" class="row-empty">Tidak ada data</td></tr>
            <tr v-for="r in displayRows" :key="r.NIK" :class="{ selected: selected[r.NIK] }">
              <td class="sel-col">
                <input type="checkbox" v-model="selected[r.NIK]" />
              </td>
              <td v-for="c in columns" :key="c.key" :class="{ 'sisa-danger': c.key === 'SisaHari' && Number(r[c.key]) <= 14, 'sisa-warn': c.key === 'SisaHari' && Number(r[c.key]) > 14 }">
                <span v-if="c.key === 'BerakhirKontrak'" class="date-warn">
                  <MsIcon name="error_outline" :size="12" /> {{ r[c.key] ?? "-" }}
                </span>
                <span v-else>{{ r[c.key] ?? "-" }}</span>
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
  name: "KontrakView",
};
</script>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
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
.btn.small {
  height: 28px;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn:hover:not(:disabled) {
  filter: brightness(0.96);
}
.batch-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid #8db0e8;
  background: #eaf1fb;
  margin-bottom: 12px;
}
.batch-count {
  font-size: 12px;
  font-weight: 800;
  color: var(--ds-primary-dark, #243656);
}
.batch-bar select {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
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
.data-table tbody tr.selected {
  background: #dce6f5;
}
.sel-col {
  width: 30px;
  text-align: center;
}
.date-warn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #a0470e;
  font-weight: 700;
}
.sisa-danger {
  color: #c02828;
  font-weight: 800;
}
.sisa-warn {
  color: #b96a10;
  font-weight: 700;
}
.row-empty {
  text-align: center;
  color: #8a94a3;
  padding: 24px !important;
}
</style>