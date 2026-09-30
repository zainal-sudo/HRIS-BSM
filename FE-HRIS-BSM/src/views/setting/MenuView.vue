<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import { normalizeIcon } from "@/utils/icon";
import { api, getErrorMessage } from "@/api/axios";

const toast = useToast();

const parents = ref<any[]>([]);
const items = ref<any[]>([]);
const activeParentId = ref<number>(0);
const loading = ref(false);

// Dialog Parent
const showParentDialog = ref(false);
const parentForm = reactive({ mp_id: 0, mp_nama: "", mp_icon: "folder", mp_order: 0 });

// Dialog Item
const showItemDialog = ref(false);
const itemForm = reactive({
  MEN_ID: 0,
  MEN_NAMA: "",
  MEN_NAMA2: "",
  MEN_KETERANGAN: "",
  men_icon: "pi pi-circle",
  men_route: "",
  men_parent_id: 0,
  men_order: 0,
});

async function loadMenus() {
  loading.value = true;
  try {
    const [p, i] = await Promise.all([
      api.get("/menu-parent"),
      api.get("/menu-items"),
    ]);
    parents.value = p.data.data || [];
    // item yang belum punya parent juga tampil (men_parent_id = 0 di grouping "Tanpa Parent")
    items.value = i.data.data || [];
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat menu"));
  } finally {
    loading.value = false;
  }
}

const parentsWithCount = (id: number) => {
  const pid = id === 0 ? 0 : id;
  return items.value.filter((it) => Number(it.men_parent_id) === pid).length;
};

const unassignedItems = () => items.value.filter((it) => !it.men_parent_id || Number(it.men_parent_id) === 0);

function openParent(p: any = null) {
  parentForm.mp_id = p?.mp_id || 0;
  parentForm.mp_nama = p?.mp_nama || "";
  parentForm.mp_icon = p?.mp_icon || "folder";
  parentForm.mp_order = p?.mp_order || 0;
  showParentDialog.value = true;
}

async function saveParent() {
  if (!parentForm.mp_nama.trim()) {
    toast.error("Nama parent wajib diisi");
    return;
  }
  try {
    const payload = {
      mp_nama: parentForm.mp_nama.trim(),
      mp_icon: parentForm.mp_icon || "folder",
      mp_order: Number(parentForm.mp_order) || 0,
    };
    if (parentForm.mp_id) {
      await api.put(`/menu-parent/${parentForm.mp_id}`, payload);
      toast.success("Parent berhasil diupdate");
    } else {
      await api.post("/menu-parent", payload);
      toast.success("Parent berhasil ditambahkan");
    }
    showParentDialog.value = false;
    await loadMenus();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menyimpan parent"));
  }
}

async function deleteParent(p: any) {
  if (!confirm(`Hapus parent "${p.mp_nama}"?`)) return;
  try {
    await api.delete(`/menu-parent/${p.mp_id}`);
    toast.success("Parent berhasil dihapus");
    if (activeParentId.value === p.mp_id) activeParentId.value = 0;
    await loadMenus();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menghapus parent"));
  }
}

function openItem(p: any = null, parentId: number = activeParentId.value) {
  itemForm.MEN_ID = p?.MEN_ID || 0;
  itemForm.MEN_NAMA = p?.MEN_NAMA || "";
  itemForm.MEN_NAMA2 = p?.MEN_NAMA2 || p?.MEN_NAMA || "";
  itemForm.MEN_KETERANGAN = p?.MEN_KETERANGAN || "";
  itemForm.men_icon = p?.men_icon || "pi pi-circle";
  itemForm.men_route = p?.men_route || "";
  itemForm.men_parent_id = p ? p.men_parent_id : parentId;
  itemForm.men_order = p?.men_order || 0;
  showItemDialog.value = true;
}

async function saveItem() {
  if (!itemForm.MEN_NAMA.trim()) {
    toast.error("Nama item wajib diisi");
    return;
  }
  if (!itemForm.men_route.trim()) {
    toast.error("Route item wajib diisi");
    return;
  }
  try {
    const payload = {
      MEN_NAMA: itemForm.MEN_NAMA.trim(),
      MEN_NAMA2: itemForm.MEN_NAMA2.trim() || itemForm.MEN_NAMA.trim(),
      MEN_KETERANGAN: itemForm.MEN_KETERANGAN.trim(),
      men_icon: itemForm.men_icon || "pi pi-circle",
      men_route: itemForm.men_route.trim(),
      men_parent_id: itemForm.men_parent_id || 0,
      men_order: Number(itemForm.men_order) || 0,
    };
    if (itemForm.MEN_ID) {
      await api.put(`/menu-items/${itemForm.MEN_ID}`, payload);
      toast.success("Item berhasil diupdate");
    } else {
      await api.post("/menu-items", payload);
      toast.success("Item berhasil ditambahkan");
    }
    showItemDialog.value = false;
    await loadMenus();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menyimpan item"));
  }
}

async function deleteItem(it: any) {
  if (!confirm(`Hapus item "${it.MEN_NAMA2}"?`)) return;
  try {
    await api.delete(`/menu-items/${it.MEN_ID}`);
    toast.success("Item berhasil dihapus");
    await loadMenus();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menghapus item"));
  }
}

onMounted(loadMenus);
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h2 class="page-title">Manajemen Menu</h2>
        <div class="page-sub">Kelola menu parent dan item sidebar</div>
      </div>
      <div class="head-actions">
        <button class="btn primary" @click="openParent()">
          <MsIcon name="add" :size="15" /> Tambah Menu
        </button>
      </div>
    </div>

    <div class="menu-grid">
      <!-- PARENT LIST -->
      <div class="card">
        <div class="card-head">Menu Utama (Parent)</div>
        <div class="parent-list">
          <button
            class="parent-item"
            :class="{ active: activeParentId === p.mp_id }"
            v-for="p in parents"
            :key="p.mp_id"
            @click="activeParentId = p.mp_id"
          >
            <span class="p-icon"><MsIcon :name="normalizeIcon(p.mp_icon) || 'folder'" :size="15" /></span>
            <span class="p-name">{{ p.mp_nama }}</span>
            <span class="p-count">{{ parentsWithCount(p.mp_id) }}</span>
            <span class="p-actions" @click.stop>
              <button title="Edit" @click="openParent(p)"><MsIcon name="edit" :size="13" /></button>
              <button title="Hapus" @click="deleteParent(p)"><MsIcon name="delete" :size="13" /></button>
            </span>
          </button>
          <button
            class="parent-item"
            :class="{ active: activeParentId === 0 }"
            @click="activeParentId = 0"
          >
            <span class="p-icon"><MsIcon name="help_outline" :size="15" /></span>
            <span class="p-name">Tanpa Parent</span>
            <span class="p-count">{{ unassignedItems().length }}</span>
            <span class="p-actions" @click.stop></span>
          </button>
          <div v-if="parents.length === 0" class="empty">Belum ada menu</div>
        </div>
      </div>

      <!-- ITEMS -->
      <div class="card">
        <div class="card-head">
          <span>Sub Menu</span>
          <button class="head-add" @click="openItem()">
            <MsIcon name="add" :size="14" /> Tambah Item
          </button>
        </div>
        <div class="item-list">
          <button
            class="item-row"
            v-for="it in items.filter((x) => Number(x.men_parent_id) === activeParentId)"
            :key="it.MEN_ID"
          >
            <span class="i-icon"><MsIcon :name="normalizeIcon(it.men_icon) || 'circle'" :size="15" /></span>
            <span class="i-main">
              <span class="i-name">{{ it.MEN_NAMA2 }}</span>
              <span class="i-route">{{ it.men_route }}</span>
            </span>
            <span class="i-actions" @click.stop>
              <button title="Edit" @click="openItem(it)"><MsIcon name="edit" :size="13" /></button>
              <button title="Hapus" @click="deleteItem(it)"><MsIcon name="delete" :size="13" /></button>
            </span>
          </button>
          <div class="empty" v-if="items.filter((x) => Number(x.men_parent_id) === activeParentId).length === 0">
            Tidak ada item pada grup ini
          </div>
        </div>
      </div>
    </div>

    <!-- DIALOG PARENT -->
    <div v-if="showParentDialog" class="modal-mask" @click.self="showParentDialog = false">
      <div class="modal">
        <div class="modal-head">
          <span>{{ parentForm.mp_id ? "Edit Menu Utama" : "Tambah Menu Utama" }}</span>
          <button class="x" @click="showParentDialog = false"><MsIcon name="close" :size="16" /></button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Nama Menu <span class="req">*</span></label>
            <input v-model="parentForm.mp_nama" type="text" placeholder="mis. Transaksi" />
          </div>
          <div class="field">
            <label>Ikon</label>
            <div class="icon-inline">
              <input v-model="parentForm.mp_icon" type="text" placeholder="material symbol icon" />
              <span class="icon-preview"><MsIcon :name="normalizeIcon(parentForm.mp_icon) || 'folder'" :size="18" /></span>
            </div>
          </div>
          <div class="field">
            <label>Urutan</label>
            <input v-model.number="parentForm.mp_order" type="number" />
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn" @click="showParentDialog = false">Batal</button>
          <button class="btn primary" @click="saveParent">Simpan</button>
        </div>
      </div>
    </div>

    <!-- DIALOG ITEM -->
    <div v-if="showItemDialog" class="modal-mask" @click.self="showItemDialog = false">
      <div class="modal">
        <div class="modal-head">
          <span>{{ itemForm.MEN_ID ? "Edit Sub Menu" : "Tambah Sub Menu" }}</span>
          <button class="x" @click="showItemDialog = false"><MsIcon name="close" :size="16" /></button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Nama Internal (MEN_NAMA) <span class="req">*</span></label>
            <input v-model="itemForm.MEN_NAMA" type="text" placeholder="mis. Izin" />
          </div>
          <div class="field">
            <label>Nama Tampilan (Label)</label>
            <input v-model="itemForm.MEN_NAMA2" type="text" placeholder="mis. Izin" />
          </div>
          <div class="field">
            <label>Route <span class="req">*</span></label>
            <input v-model="itemForm.men_route" type="text" placeholder="mis. /transaksi/izin" />
          </div>
          <div class="grid-2">
            <div class="field">
              <label>Ikon</label>
              <div class="icon-inline">
                <input v-model="itemForm.men_icon" type="text" placeholder="icon / material" />
                <span class="icon-preview"><MsIcon :name="normalizeIcon(itemForm.men_icon) || 'circle'" :size="18" /></span>
              </div>
            </div>
            <div class="field">
              <label>Urutan</label>
              <input v-model.number="itemForm.men_order" type="number" />
            </div>
          </div>
          <div class="field">
            <label>Induk Menu</label>
            <select v-model.number="itemForm.men_parent_id">
              <option :value="0">Tanpa Parent</option>
              <option v-for="p in parents" :key="p.mp_id" :value="p.mp_id">{{ p.mp_nama }}</option>
            </select>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn" @click="showItemDialog = false">Batal</button>
          <button class="btn primary" @click="saveItem">Simpan</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: "MenuView",
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
.btn:hover:not(:disabled) {
  filter: brightness(0.96);
}
.menu-grid {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 14px;
  align-items: start;
}
.card {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: linear-gradient(180deg, #42587f 0%, #334a6e 100%);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}
.head-add {
  display: flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  font-family: "Plus Jakarta Sans", sans-serif;
  padding: 4px 8px;
  cursor: pointer;
}
.parent-list,
.item-list {
  padding: 6px;
  max-height: 60vh;
  overflow: auto;
}
.parent-item,
.item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: 1px solid transparent;
  background: transparent;
  font-family: "Plus Jakarta Sans", sans-serif;
  text-align: left;
  cursor: pointer;
  border-radius: 3px;
}
.parent-item:hover,
.item-row:hover {
  background: var(--ds-surface-variant, #eef1f6);
}
.parent-item.active {
  background: #e4ebf7;
  border-color: var(--ds-primary-lighten-1, #5b79b8);
}
.p-icon,
.i-icon {
  display: flex;
  align-items: center;
  color: var(--ds-primary, #3b5998);
}
.p-name,
.i-name {
  flex: 1;
  font-size: 12px;
  font-weight: 700;
  color: var(--ds-on-surface, #1b2d4a);
}
.p-count {
  font-size: 10.5px;
  font-weight: 700;
  background: var(--ds-accent, #e8871e);
  color: #fff;
  border-radius: 8px;
  padding: 1px 7px;
  min-width: 18px;
  text-align: center;
}
.p-actions,
.i-actions {
  display: none;
  gap: 2px;
}
.parent-item:hover .p-actions,
.item-row:hover .i-actions {
  display: flex;
}
.p-actions button,
.i-actions button {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 3px;
}
.p-actions button:hover,
.i-actions button:hover {
  background: #fff;
  color: var(--ds-primary-dark, #2c4472);
}
.i-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.i-route {
  font-size: 10px;
  color: #8a94a3;
  font-family: Consolas, monospace;
}
.empty {
  padding: 22px;
  text-align: center;
  color: #8a94a3;
  font-size: 11.5px;
}
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  width: 420px;
  background: #fff;
  border-radius: 5px;
  border: 1px solid var(--ds-border, #b0b8c4);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  background: linear-gradient(180deg, #42587f 0%, #334a6e 100%);
  color: #fff;
  font-size: 12.5px;
  font-weight: 800;
  border-radius: 5px 5px 0 0;
}
.modal-head .x {
  border: none;
  background: transparent;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
}
.modal-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--ds-border, #b0b8c4);
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
  height: 34px;
  padding: 0 9px;
  border: 1px solid var(--ds-border, #b0b8c4);
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  outline: none;
  background: #fff;
}
.field input:focus,
.field select:focus {
  border-color: var(--ds-primary, #3b5998);
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.icon-inline {
  display: flex;
  gap: 6px;
  align-items: center;
}
.icon-inline input {
  flex: 1;
}
.icon-preview {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface-variant, #eef1f6);
  color: var(--ds-primary, #3b5998);
}
.req {
  color: #dc2626;
}
</style>