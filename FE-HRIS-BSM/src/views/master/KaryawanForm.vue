<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import FText from "@/components/fields/FText.vue";
import FSelect from "@/components/fields/FSelect.vue";
import FDate from "@/components/fields/FDate.vue";
import FNumber from "@/components/fields/FNumber.vue";
import FTextarea from "@/components/fields/FTextarea.vue";
import MsIcon from "@/components/MsIcon.vue";
import { api, getErrorMessage } from "@/api/axios";
import { formatMasaKerja } from "@/utils/format";

const route = useRoute();
const toast = useToast();

const isEdit = computed(() => !!route.query.id);
const saving = ref(false);

const options = ref<{ jabatan: any[]; departemen: any[]; unit: any[] }>({
  jabatan: [],
  departemen: [],
  unit: [],
});

const form = reactive({
  kar_nik: "",
  kar_nik_ktp: "",
  kar_nama: "",
  kar_alamat: "",
  kar_telp: "",
  kar_email: "",
  kar_no_bpjs: "",
  kar_no_bpjstk: "",
  kar_no_rekening: "",
  kar_jnskelamin: "",
  kar_tempatlahir: "",
  kar_tgllahir: null as string | null,
  kar_tgl_masuk: null as string | null,
  kar_kd_dept: null as string | null,
  kar_kd_jabat: null as string | null,
  kar_kd_unit: null as string | null,
  kar_status_karyawan: "Kontrak",
  kar_sistem_gaji: "",
  kar_status_aktif: 1,
});

const riwayatPkwt = ref<any[]>([]);
const loadingRiwayat = ref(false);

const isValid = computed(() => !!form.kar_nik && !!form.kar_nama);

async function loadOptions() {
  try {
    const { data } = await api.get("/karyawan/form-options");
    options.value = data.data;
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat opsi"));
  }
}

async function load() {
  const id = route.query.id as string;
  if (!id) return;
  try {
    const { data } = await api.get(`/karyawan/${id}`);
    const d = data.data;
    Object.assign(form, {
      kar_nik: d.kar_nik || "",
      kar_nik_ktp: d.kar_nik_ktp || "",
      kar_nama: d.kar_nama || "",
      kar_alamat: d.kar_alamat || "",
      kar_telp: d.kar_telp || "",
      kar_email: d.kar_email || "",
      kar_no_bpjs: d.kar_no_bpjs || "",
      kar_no_bpjstk: d.kar_no_bpjstk || "",
      kar_no_rekening: d.kar_no_rekening || "",
      kar_jnskelamin: d.kar_jnskelamin || "",
      kar_tempatlahir: d.kar_tempatlahir || "",
      kar_tgllahir: d.kar_tgllahir ? String(d.kar_tgllahir).slice(0, 10) : null,
      kar_tgl_masuk: d.kar_tgl_masuk ? String(d.kar_tgl_masuk).slice(0, 10) : null,
      kar_kd_dept: d.kar_kd_dept ? String(d.kar_kd_dept) : null,
      kar_kd_jabat: d.kar_kd_jabat ? String(d.kar_kd_jabat) : null,
      kar_kd_unit: d.kar_kd_unit ? String(d.kar_kd_unit) : null,
      kar_status_karyawan: d.kar_status_karyawan || "Kontrak",
      kar_sistem_gaji: d.kar_sistem_gaji || "",
      kar_status_aktif: d.kar_status_aktif == null ? 1 : Number(d.kar_status_aktif),
    });
    await loadRiwayat(d.kar_nik);
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data"));
  }
}

async function loadRiwayat(nik: string) {
  loadingRiwayat.value = true;
  try {
    const { data } = await api.get(`/pkwt/riwayat/${nik}`);
    riwayatPkwt.value = data.data || [];
  } catch (e) {
    riwayatPkwt.value = [];
  } finally {
    loadingRiwayat.value = false;
  }
}

async function generateNik() {
  if (!form.kar_kd_unit || !form.kar_tgl_masuk) {
    toast.warning("Pilih Unit dan isi Tanggal Masuk dahulu");
    return;
  }
  try {
    const { data } = await api.post("/karyawan/generate-nik", {
      kar_kd_unit: form.kar_kd_unit,
      kar_tgl_masuk: form.kar_tgl_masuk,
    });
    form.kar_nik = data.data.kar_nik;
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal generate NIK"));
  }
}

function tenure() {
  return formatMasaKerja(form.kar_tgl_masuk);
}

async function save(): Promise<string> {
  if (!isValid.value) {
    throw new Error("NIK dan Nama Karyawan wajib diisi");
  }
  saving.value = true;
  try {
    const payload: Record<string, any> = {
      kar_nik: form.kar_nik,
      kar_nik_ktp: form.kar_nik_ktp || null,
      kar_nama: form.kar_nama,
      kar_alamat: form.kar_alamat || null,
      kar_telp: form.kar_telp || null,
      kar_email: form.kar_email || null,
      kar_no_bpjs: form.kar_no_bpjs || null,
      kar_no_bpjstk: form.kar_no_bpjstk || null,
      kar_no_rekening: form.kar_no_rekening || null,
      kar_jnskelamin: form.kar_jnskelamin || null,
      kar_tempatlahir: form.kar_tempatlahir || null,
      kar_tgllahir: form.kar_tgllahir || null,
      kar_tgl_masuk: form.kar_tgl_masuk || null,
      kar_kd_dept: form.kar_kd_dept || null,
      kar_kd_jabat: form.kar_kd_jabat || null,
      kar_kd_unit: form.kar_kd_unit || null,
      kar_status_karyawan: form.kar_status_karyawan,
      kar_sistem_gaji: form.kar_sistem_gaji || null,
      kar_status_aktif: Number(form.kar_status_aktif),
    };
    if (isEdit.value) {
      // NIK adalah primary key dan sudah ada di URL — jangan kirim di body
      // supaya tidak terjadi UPDATE PK ke nilai milik karyawan lain (duplikat).
      const { kar_nik: _omit, ...body } = payload;
      await api.put(`/karyawan/${route.query.id}`, body);
      return "Data karyawan berhasil diperbarui.";
    } else {
      await api.post("/karyawan", payload);
      return "Data karyawan berhasil disimpan.";
    }
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadOptions();
  load();
});
</script>

<template>
  <BaseForm
    :title="isEdit ? 'Edit Karyawan' : 'Tambah Karyawan'"
    subtitle="Data pribadi dan pekerjaan karyawan"
    icon="person_add"
    :crumbs="[
      { label: 'Master Karyawan', path: '/master/karyawan' },
      { label: isEdit ? 'Edit' : 'Tambah' },
    ]"
    :save-fn="save"
    return-path="/master/karyawan"
    hint="Isi semua kolom bertanda *"
  >
    <template #form-content>
      <div class="form-layout">
        <!-- KOLOM KIRI -->
        <div class="form-col">
          <div class="card">
            <div class="card-head">
              <span>Data Pribadi</span>
            </div>
            <div class="card-body">
              <div class="grid-2">
                <div class="field">
                  <label>NIK <span class="req">*</span></label>
                  <div class="nik-wrap">
                    <input
                      v-model="form.kar_nik"
                      type="text"
                      placeholder="NIK karyawan"
                      :disabled="isEdit"
                    />
                    <button type="button" class="gen-btn" :disabled="isEdit" @click="generateNik">
                      <MsIcon name="autorenew" :size="14" /> Generate
                    </button>
                  </div>
                </div>
                <FText v-model="form.kar_nik_ktp" label="NIK KTP" placeholder="Nomor induk kependudukan" />
                <FText v-model="form.kar_nama" label="Nama" required placeholder="Nama lengkap" />
                <FSelect
                  v-model="form.kar_jnskelamin"
                  label="Jenis Kelamin"
                  :options="[
                    { label: 'Pria', value: 'Pria' },
                    { label: 'Wanita', value: 'Wanita' },
                  ]"
                  placeholder="Pilih"
                />
                <FText v-model="form.kar_tempatlahir" label="Tempat Lahir" placeholder="Kota kelahiran" />
                <FDate v-model="form.kar_tgllahir" label="Tanggal Lahir" />
                <FText v-model="form.kar_telp" label="Telepon" placeholder="08xxx" />
                <FText v-model="form.kar_email" label="Email" placeholder="email@example.com" />
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><span>Informasi Lain</span></div>
            <div class="card-body">
              <div class="grid-2">
                <FText v-model="form.kar_no_bpjs" label="No BPJS Kesehatan" placeholder="Nomor BPJS" />
                <FText v-model="form.kar_no_bpjstk" label="No BPJS Ketenagakerjaan" placeholder="Nomor BPJS TK" />
                <FText
                  v-model="form.kar_no_rekening"
                  label="No Rekening"
                  placeholder="Nomor rekening bank"
                />
              </div>
              <div class="grid-1">
                <FTextarea v-model="form.kar_alamat" label="Alamat" placeholder="Alamat lengkap..." :rows="2" />
              </div>
            </div>
          </div>
        </div>

        <!-- KOLOM KANAN -->
        <div class="form-col">
          <div class="card">
            <div class="card-head"><span>Data Pekerjaan</span></div>
            <div class="card-body">
              <div class="grid-2">
                <FDate v-model="form.kar_tgl_masuk" label="Tanggal Masuk" required />
                <div class="field">
                  <label>Masa Kerja</label>
                  <div class="static-box">
                    <MsIcon name="timelapse" :size="14" />
                    <span>{{ tenure() || "-" }}</span>
                  </div>
                </div>
                <FSelect
                  v-model="form.kar_kd_unit"
                  label="Unit"
                  required
                  :options="options.unit.map((u) => ({ label: u.nama, value: u.kode }))"
                  placeholder="Pilih unit"
                />
                <FSelect
                  v-model="form.kar_kd_jabat"
                  label="Jabatan"
                  :options="options.jabatan.map((j) => ({ label: j.nama, value: j.kode }))"
                  placeholder="Pilih jabatan"
                />
                <FSelect
                  v-model="form.kar_kd_dept"
                  label="Departemen"
                  :options="options.departemen.map((d) => ({ label: d.nama, value: d.kode }))"
                  placeholder="Pilih departemen"
                />
                <FSelect
                  v-model="form.kar_status_karyawan"
                  label="Status Karyawan"
                  :options="[
                    { label: 'Tetap', value: 'Tetap' },
                    { label: 'Belum SK', value: 'Belum SK' },
                    { label: 'Kontrak', value: 'Kontrak' },
                  ]"
                  placeholder="Pilih"
                />
                <FSelect
                  v-model="form.kar_sistem_gaji"
                  label="Sistem Gaji"
                  :options="[
                    { label: 'Borongan', value: 'Borongan' },
                    { label: 'Bulanan', value: 'Bulanan' },
                    { label: 'Harian', value: 'Harian' },
                  ]"
                  placeholder="Pilih"
                  show-clear
                />
                <FSelect
                  v-model="form.kar_status_aktif"
                  label="Status Aktif"
                  :options="[
                    { label: 'Aktif', value: 1 },
                    { label: 'Tidak Aktif', value: 0 },
                  ]"
                  placeholder="Pilih"
                />
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><span>Riwayat PKWT</span></div>
            <div class="card-body pa-0">
              <div v-if="loadingRiwayat" class="empty-state">Memuat riwayat...</div>
              <div v-else-if="riwayatPkwt.length === 0" class="empty-state">Belum ada riwayat PKWT</div>
              <table v-else class="mini-table">
                <thead>
                  <tr>
                    <th>Nomor</th>
                    <th>Tgl PKWT</th>
                    <th>Status</th>
                    <th>Tgl Mulai</th>
                    <th>Tgl Akhir</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in riwayatPkwt" :key="r.pkwt_nomor">
                    <td>{{ r.pkwt_nomor }}</td>
                    <td>{{ String(r.pkwt_tanggal).slice(0, 10) }}</td>
                    <td>{{ r.pkwt_kar_status2 }}</td>
                    <td>{{ String(r.pkwt_tgl_mulai2 || r.pkwt_tgl_mulai1 || "").slice(0, 10) }}</td>
                    <td>{{ String(r.pkwt_tgl_akhir2 || r.pkwt_tgl_akhir1 || "").slice(0, 10) }}</td>
                  </tr>
                </tbody>
              </table>
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
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  align-items: start;
}
.form-col {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.card {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(180deg, #42587f 0%, #334a6e 100%);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}
.card-body {
  padding: 14px;
}
.pa-0 {
  padding: 0;
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.grid-1 {
  display: grid;
  gap: 12px;
  margin-top: 12px;
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
.req {
  color: #dc2626;
}
.field input,
.field select {
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
.field input:focus,
.field select:focus {
  border-color: var(--ds-primary, #3b5998);
}
.field input:disabled {
  background: var(--ds-surface-variant, #e6e9ef);
  color: #6b7a90;
}
.nik-wrap {
  display: flex;
  gap: 6px;
}
.nik-wrap input {
  flex: 1;
}
.gen-btn {
  height: 34px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  border: 1px solid var(--ds-primary, #3b5998);
  background: var(--ds-primary, #3b5998);
  color: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.gen-btn:hover:not(:disabled) {
  background: var(--ds-primary-darken-1, #2c4472);
}
.gen-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.static-box {
  height: 34px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 9px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface-variant, #e6e9ef);
  color: var(--ds-on-surface, #1b2d4a);
  font-size: 12px;
  font-weight: 600;
}
.empty-state {
  padding: 22px;
  text-align: center;
  color: #6b7a90;
  font-size: 12px;
}
.mini-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.mini-table th {
  background: var(--ds-primary-dark, #243656);
  color: #fff;
  padding: 5px 8px;
  text-align: left;
  border: 1px solid #1b2d4a;
}
.mini-table td {
  padding: 4px 8px;
  border: 1px solid #d7dde5;
  color: var(--ds-on-surface, #1b2d4a);
}
.mini-table tbody tr:nth-child(even) {
  background: #fff;
}
.mini-table tbody tr:nth-child(odd) {
  background: #eef1f6;
}
</style>