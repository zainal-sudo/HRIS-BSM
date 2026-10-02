<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import { api, getErrorMessage } from "@/api/axios";

interface MenuItem {
  id: number;
  kode: string;
  nama: string;
  parent_id: number;
  parent_nama: string;
}

interface Perm {
  menu_id: number;
  view_: string;
  insert_: string;
  edit_: string;
  delete_: string;
}

const toast = useToast();
const route = useRoute();
const router = useRouter();

const isEdit = computed(() => !!route.params.kode);
const loading = ref(false);
const saving = ref(false);

const form = ref({ kode: "", password: "", kd_unit: "", kar_nik: "" });
const unitList = ref<{ kode: string; nama: string }[]>([]);
const allMenus = ref<MenuItem[]>([]);
const permissions = ref<Record<number, Perm>>({});

function initPermissions() {
  const p: Record<number, Perm> = {};
  for (const m of allMenus.value) {
    p[m.id] = { menu_id: m.id, view_: "N", insert_: "N", edit_: "N", delete_: "N" };
  }
  permissions.value = p;
}

const menuGroups = computed(() => {
  const map = new Map<string, (MenuItem & { perm: Perm })[]>();
  for (const m of allMenus.value) {
    const g = m.parent_nama || "Tanpa Parent";
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push({
      ...m,
      perm: permissions.value[m.id] || { menu_id: m.id, view_: "N", insert_: "N", edit_: "N", delete_: "N" },
    });
  }
  return Array.from(map.entries()).map(([title, menus]) => ({ title, menus }));
});

function togglePerm(menuId: number, field: keyof Omit<Perm, "menu_id">) {
  const p = permissions.value[menuId];
  if (!p) return;
  p[field] = p[field] === "Y" ? "N" : "Y";
}

function toggleGroupAll(group: { menus: (MenuItem & { perm: Perm })[] }, checked: boolean) {
  const val = checked ? "Y" : "N";
  for (const m of group.menus) {
    const p = permissions.value[m.id];
    if (p) {
      p.view_ = val;
      p.insert_ = val;
      p.edit_ = val;
      p.delete_ = val;
    }
  }
}

function isGroupAllChecked(group: { menus: (MenuItem & { perm: Perm })[] }) {
  return group.menus.every((m) => {
    const p = permissions.value[m.id];
    return p && p.view_ === "Y" && p.insert_ === "Y" && p.edit_ === "Y" && p.delete_ === "Y";
  });
}

function setPreset(preset: "full" | "viewOnly" | "none") {
  for (const p of Object.values(permissions.value)) {
    if (preset === "full") {
      p.view_ = "Y"; p.insert_ = "Y"; p.edit_ = "Y"; p.delete_ = "Y";
    } else if (preset === "viewOnly") {
      p.view_ = "Y"; p.insert_ = "N"; p.edit_ = "N"; p.delete_ = "N";
    } else {
      p.view_ = "N"; p.insert_ = "N"; p.edit_ = "N"; p.delete_ = "N";
    }
  }
}

const activeCount = computed(() => {
  let n = 0;
  for (const p of Object.values(permissions.value)) {
    if (p.view_ === "Y") n++;
    if (p.insert_ === "Y") n++;
    if (p.edit_ === "Y") n++;
    if (p.delete_ === "Y") n++;
  }
  return n;
});

const totalSlots = computed(() => Object.keys(permissions.value).length * 4);

onMounted(async () => {
  loading.value = true;
  try {
    const [u, m] = await Promise.all([
      api.get("/users/unit-list"),
      api.get("/users/menus"),
    ]);
    unitList.value = u.data.data || [];
    allMenus.value = m.data.data || [];
    initPermissions();

    if (isEdit.value) {
      const kode = decodeURIComponent(route.params.kode as string);
      const { data } = await api.get(`/users/detail/${encodeURIComponent(kode)}`);
      const d = data.data;
      form.value = { kode: d.kode, password: "", kd_unit: d.kd_unit || "", kar_nik: d.kar_nik || "" };
      for (const pm of d.menus || []) {
        if (permissions.value[pm.menu_id]) {
          permissions.value[pm.menu_id] = { ...pm };
        }
      }
    }
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data"));
    router.back();
  } finally {
    loading.value = false;
  }
});

async function simpan() {
  if (!form.value.kode.trim()) {
    toast.warning("Kode user wajib diisi");
    return;
  }
  if (!isEdit.value && !form.value.password.trim()) {
    toast.warning("Password wajib diisi untuk user baru");
    return;
  }
  saving.value = true;
  try {
    await api.post("/users/save", {
      kode: form.value.kode.trim(),
      password: form.value.password,
      kd_unit: form.value.kd_unit || null,
      kar_nik: form.value.kar_nik.trim() || null,
      menus: Object.values(permissions.value),
      isEdit: isEdit.value,
    });
    toast.success("User berhasil disimpan");
    router.push("/setting/user");
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menyimpan user"));
  } finally {
    saving.value = false;
  }
}

function batal() {
  router.push("/setting/user");
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h2 class="page-title">{{ isEdit ? "Edit User" : "Tambah User" }}</h2>
        <div class="page-sub">Data login (tuser) + hak akses menu (tmenu × thakuser)</div>
      </div>
      <div class="head-actions">
        <button class="btn" @click="batal">
          <MsIcon name="arrow_back" :size="15" /> Kembali
        </button>
        <button class="btn primary" :disabled="saving || loading" @click="simpan">
          <MsIcon name="save" :size="15" /> {{ saving ? "Menyimpan..." : "Simpan" }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading-box">Memuat data...</div>

    <div v-else class="form-grid">
      <!-- KIRI: info user -->
      <div class="card">
        <div class="card-head">Informasi User</div>
        <div class="card-body">
          <div class="field">
            <label>Kode User <span class="req">*</span></label>
            <input v-model="form.kode" type="text" placeholder="mis. admin" :readonly="isEdit" />
          </div>
          <div class="field">
            <label>Password {{ isEdit ? "(kosongkan jika tidak diganti)" : "*" }}</label>
            <input v-model="form.password" type="password" placeholder="Password" autocomplete="new-password" />
          </div>
          <div class="field">
            <label>Unit</label>
            <select v-model="form.kd_unit">
              <option value="">-- Tanpa unit --</option>
              <option v-for="u in unitList" :key="u.kode" :value="u.kode">
                {{ u.kode }} - {{ u.nama }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>NIK Karyawan</label>
            <input v-model="form.kar_nik" type="text" placeholder="NIK (opsional)" />
          </div>

          <div class="preset-wrap">
            <button class="preset-btn green" type="button" @click="setPreset('full')">Full</button>
            <button class="preset-btn blue" type="button" @click="setPreset('viewOnly')">View Only</button>
            <button class="preset-btn grey" type="button" @click="setPreset('none')">Reset</button>
          </div>
          <div class="perm-summary">
            <b>{{ activeCount }}</b> / {{ totalSlots }} hak aktif
          </div>
        </div>
      </div>

      <!-- KANAN: hak akses -->
      <div class="card">
        <div class="card-head">Hak Akses Menu</div>
        <div class="perm-scroll">
          <div v-for="group in menuGroups" :key="group.title" class="perm-group">
            <div class="group-header">
              <label class="group-check">
                <input
                  type="checkbox"
                  :checked="isGroupAllChecked(group)"
                  @change="toggleGroupAll(group, ($event.target as HTMLInputElement).checked)"
                />
                <span class="group-title">{{ group.title }}</span>
              </label>
              <div class="group-cols">
                <span>View</span><span>Insert</span><span>Edit</span><span>Delete</span>
              </div>
            </div>
            <div v-for="m in group.menus" :key="m.id" class="perm-row">
              <div class="perm-info">
                <span class="perm-id">{{ m.id }}</span>
                <span class="perm-nama">{{ m.kode }}{{ m.nama ? ` — ${m.nama}` : "" }}</span>
              </div>
              <div class="perm-checks">
                <input type="checkbox" :checked="permissions[m.id]?.view_ === 'Y'" @change="togglePerm(m.id, 'view_')" />
                <input type="checkbox" :checked="permissions[m.id]?.insert_ === 'Y'" @change="togglePerm(m.id, 'insert_')" />
                <input type="checkbox" :checked="permissions[m.id]?.edit_ === 'Y'" @change="togglePerm(m.id, 'edit_')" />
                <input type="checkbox" :checked="permissions[m.id]?.delete_ === 'Y'" @change="togglePerm(m.id, 'delete_')" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: "UserFormView",
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
}
.btn {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
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
.loading-box {
  padding: 30px;
  text-align: center;
  background: #fff;
  border: 1px solid var(--ds-border, #b0b8c4);
  color: #8a94a3;
}
.form-grid {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 12px;
  align-items: start;
}
.card {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
}
.card-head {
  padding: 8px 12px;
  background: linear-gradient(180deg, #42587f 0%, #334a6e 100%);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}
.card-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field label {
  font-size: 11px;
  font-weight: 700;
  color: var(--ds-primary, #3b5998);
}
.field input,
.field select {
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--ds-border, #b0b8c4);
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  outline: none;
  background: #fff;
}
.field input:read-only {
  background: #f1f3f7;
  color: #6b7280;
}
.req { color: #dc2626; }
.preset-wrap {
  display: flex;
  gap: 6px;
}
.preset-btn {
  flex: 1;
  height: 30px;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.preset-btn.green { background: var(--ds-primary, #3b5998); color: #fff; }
.preset-btn.blue { background: #1565c0; color: #fff; }
.preset-btn.grey { background: #e5e7eb; color: #374151; }
.perm-summary {
  font-size: 11px;
  color: #6b7280;
  text-align: center;
}
.perm-scroll {
  max-height: 62vh;
  overflow-y: auto;
  padding: 8px 12px 12px;
}
.perm-group {
  margin-bottom: 10px;
}
.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #243656;
  border-radius: 4px;
  padding: 6px 10px;
  margin-bottom: 2px;
}
.group-check {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.group-title {
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  text-transform: uppercase;
}
.group-cols {
  display: grid;
  grid-template-columns: repeat(4, 50px);
  text-align: center;
  font-size: 9px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
}
.perm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  border-bottom: 1px solid #eef1f5;
}
.perm-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.perm-id {
  font-size: 10px;
  font-weight: 700;
  background: #e4ebf7;
  color: #243656;
  border-radius: 3px;
  padding: 1px 5px;
  min-width: 24px;
  text-align: center;
}
.perm-nama {
  font-size: 11px;
  font-weight: 600;
}
.perm-checks {
  display: grid;
  grid-template-columns: repeat(4, 50px);
  justify-items: center;
}
.perm-checks input {
  width: 15px;
  height: 15px;
  accent-color: #3b5998;
  cursor: pointer;
}
</style>
