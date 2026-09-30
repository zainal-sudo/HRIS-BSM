<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import FSelect from "@/components/fields/FSelect.vue";
import KaryawanLookup from "@/components/KaryawanLookup.vue";
import MsIcon from "@/components/MsIcon.vue";
import { api, getErrorMessage } from "@/api/axios";
import { todaySql } from "@/utils/format";

const route = useRoute();
const toast = useToast();

const isEdit = computed(() => !!route.query.id);

const statusOptions = [
  { label: "Tetap", value: "Tetap" },
  { label: "PKWT", value: "PKWT" },
];

const status1Options = [
  { label: "Tetap", value: "Tetap" },
  { label: "Kontrak", value: "Kontrak" },
];

const masaOptions = [
  { label: "6 Bulan", value: 6 },
  { label: "12 Bulan", value: 12 },
  { label: "18 Bulan", value: 18 },
  { label: "24 Bulan", value: 24 },
  { label: "30 Bulan", value: 30 },
];

const form = reactive({
  pkwt_nomor: "",
  pkwt_kar_nik: null as string | null,
  kar_nama: "",
  nm_dept: "",
  nm_jabat: "",
  pkwt_tanggal: todaySql(),
  // PKWT lama (info)
  pkwt_kar_status1: "",
  pkwt_tgl_mulai1: "",
  pkwt_tgl_akhir1: "",
  // PKWT baru
  pkwt_kar_status2: "" as string,
  pkwt_ke: null as number | null,
  masa_kontrak: null as number | null,
  pkwt_tgl_mulai2: "",
  pkwt_tgl_akhir2: "",
});

const hasOld = computed(() => !!(form.pkwt_kar_status1 || form.pkwt_tgl_mulai1 || form.pkwt_tgl_akhir1));

const isValid = computed(
  () =>
    form.pkwt_kar_nik &&
    form.pkwt_tanggal &&
    form.pkwt_kar_status2 &&
    form.pkwt_tgl_mulai2 &&
    form.pkwt_tgl_akhir2
);

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

async function fetchMaxKode() {
  try {
    const { data } = await api.get("/pkwt/max-kode");
    form.pkwt_nomor = data.data.kode;
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal generate nomor"));
  }
}

async function loadKaryawan(nik: string) {
  try {
    const { data } = await api.get(`/pkwt/karyawan/${nik}`);
    const d = data.data;
    form.kar_nama = d.kar_nama || "";
    form.nm_dept = d.nm_dept || "";
    form.nm_jabat = d.nm_jabat || "";
    form.pkwt_kar_status1 = d.pkwt_kar_status1 || "";
    form.pkwt_tgl_mulai1 = d.pkwt_tgl_mulai1 ? String(d.pkwt_tgl_mulai1).slice(0, 10) : "";
    form.pkwt_tgl_akhir1 = d.pkwt_tgl_akhir1 ? String(d.pkwt_tgl_akhir1).slice(0, 10) : "";
  } catch (e: any) {
    const msg = getErrorMessage(e, "Gagal memuat detail karyawan");
    if (e?.response?.status === 404) {
      form.kar_nama = "";
      form.nm_dept = "";
      form.nm_jabat = "";
      form.pkwt_kar_status1 = "";
      form.pkwt_tgl_mulai1 = "";
      form.pkwt_tgl_akhir1 = "";
      toast.warning(msg);
    } else {
      toast.error(msg);
    }
  }
}

function onKaryawanSelect(row: { NIK: string; Nama: string }) {
  form.pkwt_kar_nik = row.NIK;
  form.kar_nama = row.Nama;
  form.pkwt_kar_status2 = "";
  form.pkwt_ke = null;
  form.masa_kontrak = null;
  form.pkwt_tgl_mulai2 = "";
  form.pkwt_tgl_akhir2 = "";
  loadKaryawan(row.NIK);
}

function onMasaChange() {
  if (!form.masa_kontrak) return;
  const acuan = form.pkwt_tgl_akhir1 ? new Date(form.pkwt_tgl_akhir1) : new Date();
  const mulai = new Date(acuan);
  mulai.setDate(mulai.getDate() + 1);
  form.pkwt_tgl_mulai2 = fmt(mulai);
  const akhir = new Date(mulai);
  akhir.setMonth(akhir.getMonth() + form.masa_kontrak);
  akhir.setDate(akhir.getDate() - 1);
  form.pkwt_tgl_akhir2 = fmt(akhir);
}

function onStatus2Change(v: string) {
  form.pkwt_kar_status2 = v;
  if (v !== "PKWT") form.pkwt_ke = null;
}

async function loadEdit() {
  const id = route.query.id as string;
  if (!id) return;
  try {
    const { data } = await api.get(`/pkwt/${id}`);
    const d = data.data;
    form.pkwt_nomor = d.pkwt_nomor || "";
    form.pkwt_tanggal = String(d.pkwt_tanggal).slice(0, 10);
    form.pkwt_kar_nik = d.pkwt_kar_nik || null;
    form.pkwt_kar_status1 = d.pkwt_kar_status1 || "";
    form.pkwt_tgl_mulai1 = d.pkwt_tgl_mulai1 ? String(d.pkwt_tgl_mulai1).slice(0, 10) : "";
    form.pkwt_tgl_akhir1 = d.pkwt_tgl_akhir1 ? String(d.pkwt_tgl_akhir1).slice(0, 10) : "";
    form.pkwt_kar_status2 = d.pkwt_kar_status2 || "";
    form.pkwt_ke = d.pkwt_ke ?? null;
    form.pkwt_tgl_mulai2 = d.pkwt_tgl_mulai2 ? String(d.pkwt_tgl_mulai2).slice(0, 10) : "";
    form.pkwt_tgl_akhir2 = d.pkwt_tgl_akhir2 ? String(d.pkwt_tgl_akhir2).slice(0, 10) : "";
    if (d.pkwt_kar_nik) await loadKaryawan(d.pkwt_kar_nik);
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data"));
  }
}

async function save(): Promise<string> {
  if (!isValid.value) {
    throw new Error("Lengkapi NIK, tanggal, status baru, tanggal mulai dan akhir");
  }
  const payload = {
    pkwt_nomor: form.pkwt_nomor,
    pkwt_kar_nik: form.pkwt_kar_nik,
    pkwt_tanggal: form.pkwt_tanggal,
    pkwt_kar_status1: form.pkwt_kar_status1 || null,
    pkwt_tgl_mulai1: form.pkwt_tgl_mulai1 || null,
    pkwt_tgl_akhir1: form.pkwt_tgl_akhir1 || null,
    pkwt_kar_status2: form.pkwt_kar_status2,
    pkwt_ke: form.pkwt_kar_status2 === "PKWT" ? form.pkwt_ke : null,
    pkwt_tgl_mulai2: form.pkwt_tgl_mulai2,
    pkwt_tgl_akhir2: form.pkwt_tgl_akhir2,
  };
  if (isEdit.value) {
    const { data } = await api.put(`/pkwt/${route.query.id}`, payload);
    return data.message || "Data PKWT berhasil diperbarui.";
  }
  const { data } = await api.post("/pkwt", payload);
  return data.message || "Data PKWT berhasil disimpan.";
}

onMounted(() => {
  fetchMaxKode();
  loadEdit();
});
</script>

<template>
  <BaseForm
    :title="isEdit ? 'Edit PKWT' : 'Tambah PKWT'"
    subtitle="Perpanjangan kontrak & status karyawan"
    icon="badge_account_outline"
    :crumbs="[
      { label: 'Transaksi PKWT', path: '/transaksi/pkwt' },
      { label: isEdit ? 'Edit' : 'Tambah' },
    ]"
    :save-fn="save"
    return-path="/transaksi/pkwt"
    hint="Lengkapi NIK, tanggal, dan data kontrak baru"
  >
    <template #form-content>
      <div class="form-layout">
        <div class="card">
          <div class="card-head">
            <span>Data Karyawan</span>
          </div>
          <div class="card-body">
            <div class="grid-2">
              <div class="field">
                <label>Nomor PKWT</label>
                <input v-model="form.pkwt_nomor" type="text" disabled />
              </div>
              <div class="field">
                <label>Tanggal <span class="req">*</span></label>
                <input v-model="form.pkwt_tanggal" type="date" />
              </div>
              <div class="lookup-field">
                <label>NIK <span class="req">*</span></label>
                <KaryawanLookup
                  :model-value="form.pkwt_kar_nik"
                  :display-name="form.kar_nama || (form.pkwt_kar_nik || '')"
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
            </div>
          </div>
        </div>

        <!-- PKWT LAMA -->
        <div class="card old-card">
          <div class="card-head">
            <span><MsIcon name="history" :size="15" /> PKWT Lama (Saat Ini)</span>
          </div>
          <div class="card-body">
            <div v-if="hasOld" class="grid-2">
              <FSelect
                v-model="form.pkwt_kar_status1"
                label="Status Sekarang"
                :options="status1Options"
                placeholder="Status"
                disabled
              />
              <div class="field">
                <label>Tanggal Mulai</label>
                <input v-model="form.pkwt_tgl_mulai1" type="date" disabled />
              </div>
              <div class="field">
                <label>Tanggal Akhir</label>
                <input v-model="form.pkwt_tgl_akhir1" type="date" disabled />
              </div>
            </div>
            <div v-else class="empty-info">
              Tidak ada kontrak sebelumnya — ini kontrak awal / perekrutan baru.
            </div>
          </div>
        </div>

        <!-- PKWT BARU -->
        <div class="card new-card">
          <div class="card-head">
            <span><MsIcon name="add_circle_outline" :size="15" /> PKWT Baru</span>
          </div>
          <div class="card-body">
            <div class="grid-2">
              <FSelect
                v-model="form.pkwt_kar_status2"
                label="Status Baru <span class='req'>*</span>"
                required
                :options="statusOptions"
                placeholder="Pilih status baru"
                @update:model-value="onStatus2Change"
              />
              <div v-if="form.pkwt_kar_status2 === 'PKWT'" class="field">
                <label>PKWT Ke <span class="req">*</span></label>
                <input
                  v-model.number="form.pkwt_ke"
                  type="number"
                  min="1"
                  placeholder="1"
                />
              </div>
              <FSelect
                v-if="form.pkwt_kar_status2"
                v-model="form.masa_kontrak"
                label="Masa Kontrak"
                :options="masaOptions"
                placeholder="Pilih masa kontrak"
                @update:model-value="onMasaChange"
              />
              <div class="field">
                <label>Tanggal Mulai <span class="req">*</span></label>
                <input v-model="form.pkwt_tgl_mulai2" type="date" />
              </div>
              <div class="field">
                <label>Tanggal Akhir <span class="req">*</span></label>
                <input v-model="form.pkwt_tgl_akhir2" type="date" />
              </div>
            </div>
            <div v-if="form.pkwt_tgl_mulai2" class="hint-line">
              <MsIcon name="info_outline" :size="14" />
              Mulai otomatis dihitung dari masa kontrak (akhir PKWT lama + 1 hari).
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
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: linear-gradient(180deg, #42587f 0%, #334a6e 100%);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}
.card-body {
  padding: 14px;
}
.old-card .card-head {
  background: linear-gradient(180deg, #7a8698 0%, #667187 100%);
}
.new-card .card-head {
  background: linear-gradient(180deg, #42587f 0%, #334a6e 100%);
  color: #ffd479;
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
.empty-info {
  padding: 10px;
  background: var(--ds-surface-variant, #eef1f6);
  color: #55637a;
  font-size: 11.5px;
}
.hint-line {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  font-size: 11px;
  color: #92400e;
  background: #fef7e8;
  border: 1px solid #f0d29b;
  padding: 7px 10px;
}
</style>