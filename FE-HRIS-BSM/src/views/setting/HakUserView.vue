<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import { api, getErrorMessage } from "@/api/axios";

const toast = useToast();

const users = ref<any[]>([]);
const menus = ref<any[]>([]);
const userKode = ref("");
const haks = reactive<Record<string, { insert: boolean; edit: boolean; delete: boolean }>>({});
const loading = ref(false);
const saving = ref(false);
const edited = ref(false);

const menuGroups = computed(() => {
  const groups = new Map<string, any[]>();
  menus.value.forEach((m) => {
    const g = m.parent_nama || "Tanpa Parent";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(m);
  });
  return Array.from(groups.entries()).map(([name, list]) => ({ name, list }));
});

function hakFor(id: any): { insert: boolean; edit: boolean; delete: boolean } {
  const key = String(id);
  if (!haks[key]) {
    haks[key] = { insert: false, edit: false, delete: false };
  }
  return haks[key];
}

function toggleMenuAll(m: any, field: "insert" | "edit" | "delete") {
  const all = true;
  const ids = collectMenuIds();
  ids.forEach((id) => {
    hakFor(id)[field] = all;
  });
  void m;
  void field;
  edited.value = true;
}

function collectMenuIds(): string[] {
  return menus.value.map((m) => String(m.MEN_ID));
}

function toggleAll(field: "insert" | "edit" | "delete") {
  const ids = collectMenuIds();
  const target = !getAllState(field);
  ids.forEach((id) => {
    hakFor(id)[field] = target;
  });
  edited.value = true;
}

function getAllState(field: "insert" | "edit" | "delete"): boolean {
  const ids = collectMenuIds();
  return ids.length > 0 && ids.every((id) => hakFor(id)[field]);
}

function toggleTree(field: "insert" | "edit" | "delete", name: string) {
  const list = menuGroups.value.find((g) => g.name === name)?.list || [];
  const target = !list.every((m) => hakFor(m.MEN_ID)[field]);
  list.forEach((m) => {
    hakFor(m.MEN_ID)[field] = target;
  });
  edited.value = true;
}

async function selectUser() {
  if (!userKode.value) return;
  Object.keys(haks).forEach((k) => delete haks[k]);
  try {
    const { data } = await api.get(`/hak-user/${userKode.value}`);
    const rows = data.data || [];
    rows.forEach((r: any) => {
      haks[String(r.HAK_MEN_ID)] = {
        insert: r.hak_men_insert === "Y",
        edit: r.hak_men_edit === "Y",
        delete: r.hak_men_delete === "Y",
      };
    });
    edited.value = false;
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat hak akses"));
  }
}

async function save() {
  if (!userKode.value) {
    toast.error("Pilih user terlebih dahulu");
    return;
  }
  const items = menus.value
    .filter((m) => {
      const h = hakFor(m.MEN_ID);
      return h.insert || h.edit || h.delete;
    })
    .map((m) => {
      const h = hakFor(m.MEN_ID);
      return {
        HAK_MEN_ID: m.MEN_ID,
        hak_men_insert: h.insert ? "Y" : "N",
        hak_men_edit: h.edit ? "Y" : "N",
        hak_men_delete: h.delete ? "Y" : "N",
      };
    });
  saving.value = true;
  try {
    await api.post("/hak-user", {
      HAK_USER_KODE: userKode.value,
      items,
    });
    toast.success("Hak akses berhasil disimpan");
    edited.value = false;
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menyimpan hak akses"));
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  loading.value = true;
  try {
    const { data } = await api.get("/hak-user/all");
    users.value = data.data?.users || [];
    menus.value = data.data?.menus || [];
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data"));
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h2 class="page-title">Hak Akses User</h2>
        <div class="page-sub">Atur hak insert / edit / delete tiap menu per user</div>
      </div>
      <div class="head-actions">
        <button class="btn primary" :disabled="!userKode || saving" @click="save">
          <MsIcon name="save" :size="15" /> {{ saving ? "Menyimpan..." : edited ? "Simpan Perubahan" : "Simpan" }}
        </button>
      </div>
    </div>

    <div class="filter-card">
      <div class="filter-row">
        <label>Pilih User <span class="req">*</span></label>
        <select v-model="userKode" @change="selectUser">
          <option value="">-- Pilih user --</option>
          <option v-for="u in users" :key="u.USER_KODE" :value="u.USER_KODE">
            {{ u.USER_KODE }} - {{ u.USER_NAMA }}
          </option>
        </select>
      </div>
      <span class="user-hint" v-if="userKode">Hak untuk user <b>{{ userKode }}</b></span>
    </div>

    <!-- TOOLBAR ALL -->
    <div class="ctl-bar">
      <span class="ctl-label">Semua Menu:</span>
      <button class="ctl" @click="toggleAll('insert')">
        Insert
        <span class="ctl-check" :class="{ on: getAllState('insert') }">
          <MsIcon v-if="getAllState('insert')" name="check" :size="12" />
        </span>
      </button>
      <button class="ctl" @click="toggleAll('edit')">
        Edit
        <span class="ctl-check" :class="{ on: getAllState('edit') }">
          <MsIcon v-if="getAllState('edit')" name="check" :size="12" />
        </span>
      </button>
      <button class="ctl" @click="toggleAll('delete')">
        Delete
        <span class="ctl-check" :class="{ on: getAllState('delete') }">
          <MsIcon v-if="getAllState('delete')" name="check" :size="12" />
        </span>
      </button>
    </div>

    <div class="hak-grid">
      <div v-for="g in menuGroups" :key="g.name" class="card">
        <div class="card-head">
          <span><MsIcon name="folder" :size="14" /> {{ g.name }}</span>
          <span class="group-tools">
            <button
              class="g-ctl"
              @click="toggleTree('insert', g.name)"
              :class="{ on: g.list.every((m) => hakFor(m.MEN_ID).insert) }"
              title="Toggle Insert grup"
            >
              I
            </button>
            <button
              class="g-ctl"
              @click="toggleTree('edit', g.name)"
              :class="{ on: g.list.every((m) => hakFor(m.MEN_ID).edit) }"
              title="Toggle Edit grup"
            >
              E
            </button>
            <button
              class="g-ctl"
              @click="toggleTree('delete', g.name)"
              :class="{ on: g.list.every((m) => hakFor(m.MEN_ID).delete) }"
              title="Toggle Delete grup"
            >
              D
            </button>
          </span>
        </div>
        <div class="menu-table">
          <div class="menu-row" v-for="m in g.list" :key="m.MEN_ID">
            <div class="m-info">
              <span class="m-name">{{ m.MEN_NAMA2 || m.MEN_NAMA }}</span>
              <span class="m-route" v-if="m.men_route">{{ m.men_route }}</span>
            </div>
            <div class="m-btns">
              <button
                class="btn-mini"
                :class="{ on: hakFor(m.MEN_ID).insert }"
                @click="hakFor(m.MEN_ID).insert = !hakFor(m.MEN_ID).insert; edited = true"
              >
                Insert
              </button>
              <button
                class="btn-mini"
                :class="{ on: hakFor(m.MEN_ID).edit }"
                @click="hakFor(m.MEN_ID).edit = !hakFor(m.MEN_ID).edit; edited = true"
              >
                Edit
              </button>
              <button
                class="btn-mini"
                :class="{ on: hakFor(m.MEN_ID).delete }"
                @click="hakFor(m.MEN_ID).delete = !hakFor(m.MEN_ID).delete; edited = true"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: "HakUserView",
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
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn:hover:not(:disabled) {
  filter: brightness(0.96);
}
.filter-card {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  margin-bottom: 10px;
}
.filter-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.filter-row label {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--ds-primary, #3b5998);
}
.filter-row select {
  min-width: 280px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--ds-border, #b0b8c4);
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  outline: none;
  background: #fff;
}
.user-hint {
  font-size: 11.5px;
  color: #55637a;
  padding-bottom: 8px;
}
.ctl-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--ds-accent, #e8871e);
  background: #fdf3e4;
  margin-bottom: 12px;
}
.ctl-label {
  font-size: 11.5px;
  font-weight: 800;
  color: #a0470e;
}
.ctl {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  font-size: 11px;
  font-weight: 700;
  font-family: "Plus Jakarta Sans", sans-serif;
  cursor: pointer;
}
.ctl-check {
  width: 15px;
  height: 15px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ds-accent, #e8871e);
}
.ctl-check.on {
  background: var(--ds-accent, #e8871e);
  border-color: var(--ds-accent, #e8871e);
  color: #fff;
}
.hak-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 14px;
}
.card {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  max-height: 380px;
  display: flex;
  flex-direction: column;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 7px 12px;
  background: linear-gradient(180deg, #42587f 0%, #334a6e 100%);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}
.group-tools {
  display: flex;
  gap: 4px;
}
.g-ctl {
  width: 22px;
  height: 20px;
  border: none;
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.75);
  font-size: 10.5px;
  font-weight: 800;
  cursor: pointer;
  border-radius: 3px;
}
.g-ctl.on {
  background: var(--ds-accent, #e8871e);
  color: #fff;
}
.menu-table {
  overflow: auto;
  flex: 1;
}
.menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid #e4e8ee;
}
.menu-row:last-child {
  border-bottom: none;
}
.m-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.m-name {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--ds-on-surface, #1b2d4a);
}
.m-route {
  font-size: 9.5px;
  color: #8a94a3;
  font-family: Consolas, monospace;
}
.m-btns {
  display: flex;
  gap: 4px;
}
.btn-mini {
  padding: 3px 8px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  color: #6b7a90;
  font-size: 10px;
  font-weight: 700;
  font-family: "Plus Jakarta Sans", sans-serif;
  cursor: pointer;
  border-radius: 3px;
}
.btn-mini.on {
  background: var(--ds-primary, #3b5998);
  border-color: var(--ds-primary-dark, #2c4472);
  color: #fff;
}
.req {
  color: #dc2626;
}
</style>