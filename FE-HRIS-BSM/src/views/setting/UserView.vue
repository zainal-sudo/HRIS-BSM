<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import { api, getErrorMessage } from "@/api/axios";

interface UserRow {
  Kode: string;
  KdUnit: string;
  Unit: string;
  Nik: string;
}

const toast = useToast();
const router = useRouter();

const rows = ref<UserRow[]>([]);
const loading = ref(false);
const kataKunci = ref("");

const filteredRows = computed(() => {
  const k = kataKunci.value.trim().toLowerCase();
  if (!k) return rows.value;
  return rows.value.filter((r) =>
    [r.Kode, r.Unit, r.KdUnit, r.Nik].some((v) =>
      String(v || "").toLowerCase().includes(k)
    )
  );
});

async function loadData() {
  loading.value = true;
  try {
    const { data } = await api.get("/users");
    rows.value = data.data || [];
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data user"));
  } finally {
    loading.value = false;
  }
}

function onAdd() {
  router.push("/setting/user/form");
}

function onEdit(kode: string) {
  router.push(`/setting/user/form/${encodeURIComponent(kode)}`);
}

async function onDelete(row: UserRow) {
  if (row.Kode.toLowerCase() === "pusat") {
    toast.warning("User pusat tidak boleh dihapus");
    return;
  }
  if (!confirm(`Hapus user "${row.Kode}"? Hak aksesnya ikut terhapus.`)) return;
  try {
    await api.delete(`/users/${encodeURIComponent(row.Kode)}`);
    toast.success("User berhasil dihapus");
    await loadData();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menghapus user"));
  }
}

onMounted(loadData);
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h2 class="page-title">Master User</h2>
        <div class="page-sub">Kelola user login (tuser) + hak akses menu (thakuser) — merujuk Web Entri</div>
      </div>
      <div class="head-actions">
        <div class="search-box">
          <MsIcon name="search" :size="14" />
          <input v-model="kataKunci" type="text" placeholder="Cari kode / unit / nik..." />
        </div>
        <button class="btn" :disabled="loading" @click="loadData">
          <MsIcon name="refresh" :size="15" /> Refresh
        </button>
        <button class="btn primary" @click="onAdd">
          <MsIcon name="add" :size="15" /> Tambah User
        </button>
      </div>
    </div>

    <div class="table-card">
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th class="c" style="width: 40px">No</th>
              <th>Kode</th>
              <th>Unit</th>
              <th>NIK Karyawan</th>
              <th class="c" style="width: 140px">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="5" class="row-empty">Memuat data...</td>
            </tr>
            <tr v-else-if="filteredRows.length === 0">
              <td colspan="5" class="row-empty">Belum ada data user.</td>
            </tr>
            <tr v-for="(r, i) in filteredRows" :key="r.Kode">
              <td class="c">{{ i + 1 }}</td>
              <td class="strong">{{ r.Kode }}</td>
              <td>{{ r.Unit ? `${r.KdUnit} - ${r.Unit}` : r.KdUnit || "-" }}</td>
              <td>{{ r.Nik || "-" }}</td>
              <td class="c">
                <button class="row-btn" title="Edit + hak akses" @click="onEdit(r.Kode)">
                  <MsIcon name="edit" :size="14" />
                </button>
                <button class="row-btn danger" title="Hapus" @click="onDelete(r)">
                  <MsIcon name="delete" :size="14" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="table-note">
        <MsIcon name="info" :size="13" />
        Klik Edit untuk ubah password / unit / hak akses menu (View / Insert / Edit / Delete).
        Baris di thakuser = boleh View; kolom insert/edit/delete diatur Y/N terpisah.
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: "UserView",
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
.search-box {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
}
.search-box input {
  border: none;
  outline: none;
  font-size: 12px;
  font-family: "Plus Jakarta Sans", sans-serif;
  width: 200px;
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
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  font-size: 11.5px;
}
.data-table th {
  position: sticky;
  top: 0;
  background: var(--ds-primary-dark, #243656);
  color: #fff;
  padding: 7px 8px;
  text-align: left;
  font-weight: 700;
  white-space: nowrap;
  z-index: 2;
}
.data-table td {
  padding: 6px 8px;
  border: 1px solid #d7dde5;
  white-space: nowrap;
}
.data-table tbody tr:nth-child(even) {
  background: #f4f6fa;
}
.c { text-align: center; }
.strong { font-weight: 800; }
.row-empty {
  text-align: center;
  color: #8a94a3;
  padding: 24px !important;
}
.row-btn {
  width: 26px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  color: var(--ds-primary, #3b5998);
  cursor: pointer;
  margin: 0 2px;
}
.row-btn.danger {
  color: #c02828;
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
</style>
