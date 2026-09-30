<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import FSelect from "@/components/fields/FSelect.vue";
import KaryawanLookup from "@/components/KaryawanLookup.vue";
import { api, getErrorMessage } from "@/api/axios";
import { todaySql } from "@/utils/format";

const route = useRoute();
const toast = useToast();

const isEdit = computed(() => !!route.query.id);

const form = reactive({
  kl_nomor: "",
  kl_tanggal: todaySql(),
  kl_nik: null as string | null,
  kar_nama: "",
  nm_dept: "",
  nm_jabat: "",
  kl_alasan: null as string | null,
  kl_ket: "",
});

const alasanOptions = [
  { label: "Lain lain", value: "Lain lain" },
  { label: "Pindah ke perusahaan lain", value: "Pindah ke perusahaan lain" },
  { label: "Melanjutkan study", value: "Melanjutkan study" },
  { label: "Pensiun", value: "Pensiun" },
  { label: "Pemberhentian sementara", value: "Pemberhentian sementara" },
  { label: "Tidak lolos training", value: "Tidak lolos training" },
  { label: "Kasus", value: "Kasus" },
  { label: "Masalah dengan Atasan", value: "Masalah dengan Atasan" },
  { label: "Bermasalah dengan rekan kerja", value: "Bermasalah dengan rekan kerja" },
];

const isValid = computed(() => form.kl_nik && form.kl_tanggal && form.kl_alasan);

async function fetchMaxKode(tanggal: string) {
  try {
    const { data } = await api.get("/keluar/max-kode", { params: { tanggal } });
    form.kl_nomor = data.data.kode;
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal generate nomor"));
  }
}

async function loadKaryawan(nik: string) {
  try {
    const { data } = await api.get(`/keluar/karyawan/${nik}`);
    const d = data.data;
    form.kar_nama = d.kar_nama || "";
    form.nm_dept = d.nm_dept || "";
    form.nm_jabat = d.nm_jabat || "";
  } catch (e: any) {
    const msg = getErrorMessage(e, "Gagal memuat detail karyawan");
    if (e?.response?.status === 404) {
      form.kar_nama = "";
      form.nm_dept = "";
      form.nm_jabat = "";
      toast.warning(msg);
    } else {
      toast.error(msg);
    }
  }
}

function onKaryawanSelect(row: { NIK: string; Nama: string }) {
  form.kl_nik = row.NIK;
  form.kar_nama = row.Nama;
  loadKaryawan(row.NIK);
}

function onTanggalChange(v: string) {
  form.kl_tanggal = v;
  fetchMaxKode(v);
}

async function loadEdit() {
  const id = route.query.id as string;
  if (!id) return;
  try {
    const { data } = await api.get(`/keluar/${id}`);
    const d = data.data;
    form.kl_nomor = d.kl_nomor || "";
    form.kl_tanggal = String(d.kl_tanggal).slice(0, 10);
    form.kl_nik = d.kl_nik || null;
    form.kl_alasan = d.kl_alasan || null;
    form.kl_ket = d.kl_ket || "";
    if (d.kl_nik) await loadKaryawan(d.kl_nik);
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data"));
  }
}

async function save(): Promise<string> {
  if (!isValid.value) {
    throw new Error("Lengkapi NIK, tanggal, dan alasan");
  }
  const payload = {
    kl_nomor: form.kl_nomor,
    kl_tanggal: form.kl_tanggal,
    kl_nik: form.kl_nik,
    kl_alasan: form.kl_alasan,
    kl_ket: form.kl_ket || "",
  };
  if (isEdit.value) {
    const { data } = await api.put(`/keluar/${route.query.id}`, payload);
    return data.message || "Data karyawan keluar berhasil diperbarui.";
  }
  const { data } = await api.post("/keluar", payload);
  return data.message || "Data karyawan keluar berhasil disimpan.";
}

onMounted(() => {
  fetchMaxKode(form.kl_tanggal);
  loadEdit();
});
</script>

<template>
  <BaseForm
    :title="isEdit ? 'Edit Karyawan Keluar' : 'Tambah Karyawan Keluar'"
    subtitle="Data karyawan keluar"
    icon="logout"
    :crumbs="[
      { label: 'Transaksi Keluar', path: '/transaksi/karyawan-keluar' },
      { label: isEdit ? 'Edit' : 'Tambah' },
    ]"
    :save-fn="save"
    return-path="/transaksi/karyawan-keluar"
    hint="Lengkapi NIK, tanggal, dan alasan"
  >
    <template #form-content>
      <div class="form-layout">
        <div class="card">
          <div class="card-head">
            <span>Data Keluar</span>
          </div>
          <div class="card-body">
            <div class="grid-2">
              <div class="field">
                <label>Nomor</label>
                <input v-model="form.kl_nomor" type="text" disabled />
              </div>
              <div class="field">
                <label>Tanggal <span class="req">*</span></label>
                <input
                  v-model="form.kl_tanggal"
                  type="date"
                  @change="onTanggalChange(($event.target as HTMLInputElement).value)"
                />
              </div>

              <div class="lookup-field">
                <label>NIK <span class="req">*</span></label>
                <KaryawanLookup
                  :model-value="form.kl_nik"
                  :display-name="form.kar_nama || (form.kl_nik || '')"
                  @update:display-name="form.kar_nama = $event"
                  @select="onKaryawanSelect"
                />
              </div>
              <div class="field">
                <label>Nama</label>
                <input v-model="form.kar_nama" type="text" disabled />
              </div>
              <div class="field">
                <label>Departemen</label>
                <input v-model="form.nm_dept" type="text" disabled />
              </div>
              <div class="field">
                <label>Jabatan</label>
                <input v-model="form.nm_jabat" type="text" disabled />
              </div>

              <FSelect
                v-model="form.kl_alasan"
                label="Alasan"
                required
                :options="alasanOptions"
                placeholder="Pilih alasan"
              />
              <div class="field">
                <label>Keterangan</label>
                <input v-model="form.kl_ket" type="text" placeholder="Keterangan" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </BaseForm>
</template>

<style scoped>
.form-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
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
  padding: 14px;
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.field,
.lookup-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field label,
.lookup-field label {
  font-size: 11px;
  font-weight: 700;
  color: var(--ds-primary, #3b5998);
}
.req {
  color: #dc2626;
}
.field input {
  width: 100%;
  height: 34px;
  padding: 0 9px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  color: var(--ds-on-surface, #1b2d4a);
  outline: none;
}
.field input:focus {
  border-color: var(--ds-primary, #3b5998);
}
.field input:disabled {
  background: var(--ds-surface-variant, #e6e9ef);
  color: #6b7a90;
}
</style>