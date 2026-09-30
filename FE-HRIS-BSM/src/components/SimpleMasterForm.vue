<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import FText from "@/components/fields/FText.vue";
import { api, getErrorMessage } from "@/api/axios";
import { todaySql } from "@/utils/format";

const props = defineProps<{
  endpoint: string;
  title: string;
  subtitle?: string;
  icon?: string;
  moduleCrumb: { label: string; path: string };
  returnPath: string;
}>();

const route = useRoute();
const toast = useToast();

const isEdit = computed(() => !!route.query.id);
const nama = ref("");
const saving = ref(false);

async function load() {
  const id = route.query.id as string;
  if (!id) return;
  try {
    const { data } = await api.get(`${props.endpoint}/${id}`);
    const d = data.data;
    nama.value = d.Nama ?? d.nm_jabat ?? d.nm_dept ?? d.nm_unit ?? "";
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data"));
  }
}

async function save(): Promise<string> {
  if (!nama.value.trim()) {
    throw new Error("Nama wajib diisi");
  }
  saving.value = true;
  try {
    if (isEdit.value) {
      await api.put(`${props.endpoint}/${route.query.id}`, { Nama: nama.value.trim() });
      return "Data berhasil diperbarui.";
    } else {
      await api.post(props.endpoint, { Nama: nama.value.trim() });
      return "Data berhasil disimpan.";
    }
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <BaseForm
    :title="title"
    :subtitle="isEdit ? 'Ubah data' : subtitle"
    :icon="icon"
    :crumbs="[
      { label: moduleCrumb.label, path: moduleCrumb.path },
      { label: isEdit ? 'Edit' : 'Tambah' },
    ]"
    :save-fn="save"
    :return-path="returnPath"
  >
    <template #form-content>
      <div class="card">
        <div class="card-head">
          <span>{{ isEdit ? 'Edit' : 'Tambah' }} {{ title }}</span>
        </div>
        <div class="card-body">
          <div class="form-grid cols-1">
            <div v-if="isEdit" class="field">
              <label>Kode</label>
              <div class="kode-box">{{ route.query.id }}</div>
            </div>
            <FText v-model="nama" :label="`Nama ${title}`" required placeholder="Masukkan nama" />
          </div>
        </div>
      </div>
    </template>
  </BaseForm>
</template>

<style scoped>
.card {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
}
.card-head {
  padding: 8px 12px;
  background: var(--ds-surface-variant, #e0e4ea);
  border-bottom: 1px solid var(--ds-border, #c0c8d4);
  font-size: 12px;
  font-weight: 800;
  color: var(--ds-on-surface, #1b2d4a);
}
.card-body {
  padding: 14px;
}
.form-grid {
  display: grid;
  gap: 12px;
}
.form-grid.cols-1 {
  grid-template-columns: 1fr;
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
.kode-box {
  height: 34px;
  display: flex;
  align-items: center;
  padding: 0 9px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface-variant, #e6e9ef);
  font-size: 12px;
  color: #6b7a90;
}
</style>