<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import { api, getErrorMessage } from "@/api/axios";

const props = withDefaults(
  defineProps<{
    modelValue: string | null | undefined;
    displayName?: string;
    label?: string;
    placeholder?: string;
  }>(),
  { displayName: "", label: "NIK", placeholder: "Cari & pilih karyawan..." }
);

const emit = defineEmits<{
  (e: "update:modelValue", v: string): void;
  (e: "update:displayName", v: string): void;
  (e: "select", row: { NIK: string; Nama: string }): void;
}>();

const toast = useToast();

const dialog = ref(false);
const loading = ref(false);
const search = ref("");
const rows = ref<{ NIK: string; Nama: string }[]>([]);

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return rows.value;
  return rows.value.filter(
    (r) => r.NIK.toLowerCase().includes(q) || r.Nama.toLowerCase().includes(q)
  );
});

async function open() {
  dialog.value = true;
  search.value = "";
  if (rows.value.length === 0) {
    loading.value = true;
    try {
      const { data } = await api.get("/lookup/karyawan-aktif");
      rows.value = data.data || [];
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      loading.value = false;
    }
  }
}

function pick(row: { NIK: string; Nama: string }) {
  emit("update:modelValue", row.NIK);
  emit("update:displayName", row.Nama);
  emit("select", row);
  dialog.value = false;
}

function clear() {
  emit("update:modelValue", "");
  emit("update:displayName", "");
}
</script>

<template>
  <div class="lookup-wrap">
    <div class="lookup-field" @click="open">
      <span class="lookup-icon">
        <MsIcon name="person_search" :size="16" />
      </span>
      <span class="lookup-value" :class="{ empty: !displayName }">
        {{ displayName || placeholder }}
      </span>
    </div>
    <button v-if="modelValue" class="lookup-clear" title="Kosongkan" @click="clear">
      <MsIcon name="close" :size="14" />
    </button>

    <v-dialog v-model="dialog" max-width="520" persistent>
      <v-card rounded="false">
        <v-card-title class="bg-primary text-white pa-3 d-flex align-center">
          <MsIcon name="person_search" :size="18" />
          <span class="ml-2">Cari Karyawan &mdash; {{
          props.label }}</span>
        </v-card-title>
        <div class="lookup-search">
          <MsIcon name="search" :size="15" />
          <input
            v-model="search"
            type="text"
            placeholder="Cari berdasarkan NIK atau Nama..."
            autofocus
          />
        </div>
        <v-card-text class="pa-0">
          <div v-if="loading" class="lookup-state">Memuat data...</div>
          <div v-else-if="filtered.length === 0" class="lookup-state">Tidak ada karyawan</div>
          <div v-else class="lookup-list">
            <button
              v-for="r in filtered.slice(0, 200)"
              :key="r.NIK"
              class="lookup-row"
              @dblclick="pick(r)"
              @click="pick(r)"
            >
              <span class="lk-nik">{{ r.NIK }}</span>
              <span class="lk-nama">{{ r.Nama }}</span>
            </button>
          </div>
        </v-card-text>
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" color="grey-darken-2" @click="dialog = false">Tutup</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.lookup-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.lookup-field {
  flex: 1;
  height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 9px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  cursor: pointer;
}
.lookup-field:hover {
  border-color: var(--ds-primary, #3b5998);
}
.lookup-icon {
  color: var(--ds-primary, #3b5998);
  display: flex;
}
.lookup-value {
  flex: 1;
  font-size: 12px;
  color: var(--ds-on-surface, #1b2d4a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lookup-value.empty {
  color: #9aa6b6;
}
.lookup-clear {
  width: 30px;
  height: 30px;
  border: 1px solid var(--ds-border, #b0b8c4);
  border-left: none;
  background: #fff;
  color: #6b7a90;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lookup-clear:hover {
  color: #dc2626;
  background: #fdeaea;
}
.lookup-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px;
  padding: 0 10px;
  border: 1px solid var(--ds-border, #b0b8c4);
  height: 34px;
}
.lookup-search input {
  border: none;
  outline: none;
  flex: 1;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
}
.lookup-state {
  padding: 26px;
  text-align: center;
  color: #6b7a90;
  font-size: 12px;
}
.lookup-list {
  max-height: 320px;
  overflow: auto;
}
.lookup-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 14px;
  border: none;
  border-bottom: 1px solid #e3e7ee;
  background: #fff;
  cursor: pointer;
  font-family: "Plus Jakarta Sans", sans-serif;
  text-align: left;
}
.lookup-row:hover {
  background: var(--ds-primary-lighten-1, #dbe4f3);
}
.lk-nik {
  font-size: 11px;
  font-weight: 700;
  color: var(--ds-primary, #3b5998);
  background: #e8edf5;
  padding: 2px 8px;
}
.lk-nama {
  font-size: 12px;
  color: var(--ds-on-surface, #1b2d4a);
}
</style>