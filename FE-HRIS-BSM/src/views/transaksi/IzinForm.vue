<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import FSelect from "@/components/fields/FSelect.vue";
import FTextarea from "@/components/fields/FTextarea.vue";
import FotoUploadField from "@/components/fields/FotoUploadField.vue";
import KaryawanLookup from "@/components/KaryawanLookup.vue";
import MsIcon from "@/components/MsIcon.vue";
import { api, getErrorMessage } from "@/api/axios";
import { todaySql } from "@/utils/format";
import { fotoUrl, uploadFotoBukti, validateFotoFile } from "@/utils/foto";

const route = useRoute();
const toast = useToast();

const isEdit = computed(() => !!route.query.id);
const inputMode = ref<"single" | "batch">("single");

const form = reactive({
  ij_nomor: "",
  tanggal: todaySql(),
  kar_nik: null as string | null,
  kar_nama: "",
  nm_dept: "",
  nm_jabat: "",
  alasan: null as string | null,
  keterangan: "",
  ij_foto: null as string | null,
});

const karyawanInfo = ref<{ sisa_cuti: number; absensi: any }>({ sisa_cuti: 0, absensi: {} });
const alasanOptions = ref<{ label: string; value: string }[]>([]);

// Batch mode
const batchTanggal = ref("");
const tanggalList = ref<string[]>([]);

const isValid = computed(() => {
  if (inputMode.value === "single") {
    return form.kar_nik && form.tanggal && form.alasan;
  }
  return form.kar_nik && form.alasan && tanggalList.value.length > 0;
});

async function loadAlasan() {
  try {
    const { data } = await api.get("/izin/alasan-options");
    alasanOptions.value = (data.data || []).map((a: any) => ({
      label: a.Alasan,
      value: a.Alasan,
    }));
  } catch (e) {
    /* abaikan */
  }
}

async function fetchMaxKode(tanggal: string) {
  if (inputMode.value === "batch") return;
  try {
    const { data } = await api.get("/izin/max-kode", { params: { tanggal } });
    form.ij_nomor = data.data.kode;
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal generate nomor"));
  }
}

async function loadKaryawan(nik: string) {
  try {
    const { data } = await api.get(`/izin/karyawan/${nik}`, {
      params: { tanggal: form.tanggal },
    });
    const d = data.data;
    form.kar_nama = d.kar_nama || "";
    form.nm_dept = d.nm_dept || "";
    form.nm_jabat = d.nm_jabat || "";
    karyawanInfo.value = {
      sisa_cuti: d.sisa_cuti ?? 0,
      absensi: d.absensi || {},
    };
  } catch (e: any) {
    const msg = getErrorMessage(e, "Gagal memuat detail karyawan");
    if (e?.response?.status === 404) {
      form.kar_nama = "";
      form.nm_dept = "";
      form.nm_jabat = "";
      karyawanInfo.value = { sisa_cuti: 0, absensi: {} };
      toast.warning(msg);
    } else {
      toast.error(msg);
    }
  }
}

function onKaryawanSelect(row: { NIK: string; Nama: string }) {
  loadKaryawan(row.NIK);
}

function onTanggalChange(v: string) {
  form.tanggal = v;
  if (form.kar_nik) loadKaryawan(form.kar_nik);
  fetchMaxKode(v);
}

function addTanggal() {
  if (batchTanggal.value && !tanggalList.value.includes(batchTanggal.value)) {
    tanggalList.value.push(batchTanggal.value);
    tanggalList.value.sort();
  }
  batchTanggal.value = "";
}

function quickLastNDays(days: number) {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`
    );
  }
  tanggalList.value = Array.from(new Set([...tanggalList.value, ...out])).sort();
}

function removeTanggal(v: string) {
  tanggalList.value = tanggalList.value.filter((t) => t !== v);
}

// ── Foto bukti ──
// Kolom `ij_foto` hanya menyimpan NAMA FILE. Berkasnya diunggah ke server
// legacy lewat POST /izin/upload (proxy ke upload.php) dan disajikan dari
// direktori `bukti/`. Foto lama (dari DB) dimuat via fotoUrl(), foto baru
// yang belum diunggah ditampilkan sebagai data-URL lokal.
const selectedFile = ref<File | null>(null);
const localPreview = ref<string | null>(null);
const remotePreview = ref<string | null>(null);
const uploading = ref(false);
const fotoBroken = ref(false);

const previewSrc = computed(() => localPreview.value || remotePreview.value || "");

// Nama file di DB berubah (mis. setelah simpan) -> reset penanda berkas hilang.
watch(
  () => form.ij_foto,
  () => {
    fotoBroken.value = false;
  }
);

function onFotoPicked(file: File) {
  const err = validateFotoFile(file);
  if (err) {
    toast.error(err);
    return;
  }
  selectedFile.value = file;
  fotoBroken.value = false;
  const reader = new FileReader();
  reader.onload = (ev) => {
    localPreview.value = String(ev.target?.result || "");
  };
  reader.onerror = () => {
    toast.error("Gagal membaca file");
    clearFoto();
  };
  reader.readAsDataURL(file);
}

/** Buang foto baru yang dipilih, atau foto tersimpan saat mode edit. */
function clearFoto() {
  selectedFile.value = null;
  localPreview.value = null;
  remotePreview.value = null;
  form.ij_foto = null;
  fotoBroken.value = false;
}

/**
 * Unggah foto ke server bukti (proxy ke upload.php) bila ada file baru,
 * dan kembalikan NAMA FILE untuk disimpan ke DB.
 * Melempar error bila gagal — BaseForm sudah menampilkannya sebagai satu toast.
 */
async function uploadFoto(): Promise<string> {
  if (!selectedFile.value) return form.ij_foto || "";
  uploading.value = true;
  try {
    form.ij_foto = await uploadFotoBukti(selectedFile.value, {
      endpoint: "/izin/upload",
      prefix: "IZ",
    });
    return form.ij_foto;
  } finally {
    uploading.value = false;
  }
}

async function loadEdit() {
  const id = route.query.id as string;
  if (!id) return;
  try {
    const { data } = await api.get(`/izin/${id}`);
    const d = data.data;
    form.ij_nomor = d.ij_nomor || "";
    form.kar_nik = d.kar_nik || null;
    form.tanggal = String(d.tanggal).slice(0, 10);
    form.alasan = d.alasan || null;
    form.keterangan = d.keterangan || "";
    form.ij_foto = d.ij_foto || null;
    remotePreview.value = d.ij_foto ? fotoUrl(d.ij_foto) : null;
    if (d.kar_nik) {
      await loadKaryawan(d.kar_nik);
    }
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data"));
  }
}

async function save(): Promise<string> {
  if (!isValid.value) {
    throw new Error("Lengkapi NIK, tanggal, dan alasan");
  }
  // Upload foto dulu (kalau ada file baru) — nama file hasil upload yang
  // disimpan ke DB. Gagal upload melempar error, sehingga data izin tidak
  // tersimpan tanpa bukti.
  const fotoFilename = await uploadFoto();

  if (inputMode.value === "batch") {
    const { data } = await api.post("/izin/batch", {
      kar_nik: form.kar_nik,
      alasan: form.alasan,
      keterangan: form.keterangan,
      tanggal_list: tanggalList.value,
      // Endpoint batch memakai nama key "foto" (bukan ij_foto).
      foto: fotoFilename || null,
    });
    return data.message || `Berhasil menyimpan ${tanggalList.value.length} data izin.`;
  }
  const payload = {
    ij_nomor: form.ij_nomor,
    kar_nik: form.kar_nik,
    tanggal: form.tanggal,
    alasan: form.alasan,
    keterangan: form.keterangan || null,
    ij_foto: fotoFilename || null,
  };
  if (isEdit.value) {
    const { data } = await api.put(`/izin/${route.query.id}`, payload);
    return data.message || "Data izin berhasil diperbarui.";
  }
  const { data } = await api.post("/izin", payload);
  return data.message || "Data izin berhasil disimpan.";
}

onMounted(() => {
  loadAlasan();
  loadEdit();
});
</script>

<template>
  <BaseForm
    :title="isEdit ? 'Edit Izin' : 'Input Izin'"
    subtitle="Izin / cuti karyawan"
    icon="event_available"
    :crumbs="[
      { label: 'Transaksi Izin', path: '/transaksi/izin' },
      { label: isEdit ? 'Edit' : 'Tambah' },
    ]"
    :save-fn="save"
    return-path="/transaksi/izin"
    hint="Lengkapi NIK, tanggal, dan alasan"
  >
    <template #form-content>
      <div class="form-layout">
        <div class="form-col">
          <div class="card">
            <div class="card-head">
              <span>Data Izin</span>
              <div class="mode-toggle" v-if="!isEdit">
                <button :class="{ on: inputMode === 'single' }" @click="inputMode = 'single'">Tunggal</button>
                <button :class="{ on: inputMode === 'batch' }" @click="inputMode = 'batch'">Banyak</button>
              </div>
            </div>
            <div class="card-body">
              <!-- MODE TUNGGAL -->
              <template v-if="inputMode === 'single'">
                <div class="grid-2">
                  <div class="field">
                    <label>Nomor</label>
                    <input v-model="form.ij_nomor" type="text" disabled />
                  </div>
                  <div class="field">
                    <label>Tanggal Izin <span class="req">*</span></label>
                    <input
                      v-model="form.tanggal"
                      type="date"
                      @change="onTanggalChange(($event.target as HTMLInputElement).value)"
                    />
                  </div>
                  <div class="lookup-field">
                    <label>NIK <span class="req">*</span></label>
                    <KaryawanLookup
                      :model-value="form.kar_nik"
                      :display-name="form.kar_nama || (form.kar_nik || '')"
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
                    v-model="form.alasan"
                    label="Alasan"
                    required
                    :options="alasanOptions"
                    placeholder="Pilih alasan"
                  />
                  <div class="field">
                    <label>Keterangan</label>
                    <input v-model="form.keterangan" type="text" placeholder="Keterangan" />
                  </div>
                  <FotoUploadField
                    :src="previewSrc"
                    :filename="form.ij_foto"
                    :uploading="uploading"
                    :broken="fotoBroken"
                    @select="onFotoPicked"
                    @clear="clearFoto"
                    @error="fotoBroken = true"
                  />
                </div>
              </template>

              <!-- MODE BANYAK -->
              <template v-else>
                <div class="batch-info">
                  Pilih <strong>satu karyawan</strong> dan <strong>beberapa tanggal</strong> izin
                  sekaligus.
                </div>
                <div class="grid-2">
                  <div class="lookup-field">
                    <label>NIK <span class="req">*</span></label>
                    <KaryawanLookup
                      :model-value="form.kar_nik"
                      :display-name="form.kar_nama || (form.kar_nik || '')"
                      @update:display-name="form.kar_nama = $event"
                      @select="onKaryawanSelect"
                    />
                  </div>
                  <div class="field">
                    <label>Nama</label>
                    <input v-model="form.kar_nama" type="text" disabled />
                  </div>
                  <FSelect
                    v-model="form.alasan"
                    label="Alasan"
                    required
                    :options="alasanOptions"
                    placeholder="Pilih alasan"
                  />
                  <div class="field">
                    <label>Keterangan</label>
                    <input v-model="form.keterangan" type="text" placeholder="Keterangan" />
                  </div>
                  <FotoUploadField
                    :src="previewSrc"
                    :filename="form.ij_foto"
                    :uploading="uploading"
                    :broken="fotoBroken"
                    @select="onFotoPicked"
                    @clear="clearFoto"
                    @error="fotoBroken = true"
                  />
                </div>

                <div class="batch-section">
                  <div class="batch-row">
                    <label class="batch-title">Daftar Tanggal</label>
                    <div class="batch-add">
                      <input v-model="batchTanggal" type="date" />
                      <button class="btn-small primary" @click="addTanggal">
                        <MsIcon name="add" :size="14" /> Tambah Tanggal
                      </button>
                      <button class="btn-small" @click="quickLastNDays(1)">
                        <MsIcon name="today" :size="13" /> Hari Ini
                      </button>
                      <button class="btn-small" @click="quickLastNDays(7)">
                        <MsIcon name="date_range" :size="13" /> 7 Hari
                      </button>
                      <button class="btn-small" @click="quickLastNDays(30)">
                        <MsIcon name="calendar_month" :size="13" /> 30 Hari
                      </button>
                    </div>
                  </div>
                  <div v-if="tanggalList.length > 0" class="chips">
                    <span v-for="t in tanggalList" :key="t" class="chip">
                      {{ t }}
                      <button @click="removeTanggal(t)"><MsIcon name="close" :size="12" /></button>
                    </span>
                  </div>
                  <div v-else class="empty-state">Belum ada tanggal dipilih</div>
                </div>
              </template>

              <!-- INFO KARYAWAN -->
              <div v-if="form.kar_nik" class="karyawan-info">
                <span class="info-chip">Sisa Cuti: <strong>{{ karyawanInfo.sisa_cuti }}</strong></span>
                <span class="info-chip">Jam In: <strong>{{ karyawanInfo.absensi?.Jam_in || '-' }}</strong></span>
                <span class="info-chip">Jam Out: <strong>{{ karyawanInfo.absensi?.Jam_out || '-' }}</strong></span>
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(180deg, #42587f 0%, #334a6e 100%);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}
.mode-toggle {
  display: flex;
  border: 1px solid rgba(255, 255, 255, 0.3);
}
.mode-toggle button {
  padding: 4px 12px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  font-weight: 700;
  font-family: "Plus Jakarta Sans", sans-serif;
  cursor: pointer;
}
.mode-toggle button.on {
  background: var(--ds-primary, #3b5998);
  color: #fff;
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
.batch-info {
  padding: 8px 10px;
  border: 1px solid #f0d29b;
  background: #fef7e8;
  color: #92400e;
  font-size: 11.5px;
  margin-bottom: 12px;
}
.batch-section {
  margin-top: 14px;
  border-top: 1px dashed var(--ds-border, #b0b8c4);
  padding-top: 12px;
}
.batch-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.batch-title {
  font-size: 11px;
  font-weight: 800;
  color: var(--ds-primary, #3b5998);
  text-transform: uppercase;
}
.batch-add {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.batch-add input {
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--ds-border, #b0b8c4);
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
}
.btn-small {
  height: 30px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #f5f7fa;
  color: var(--ds-on-surface, #1b2d4a);
  font-size: 11px;
  font-weight: 700;
  font-family: "Plus Jakarta Sans", sans-serif;
  cursor: pointer;
}
.btn-small.primary {
  background: var(--ds-primary, #3b5998);
  border-color: var(--ds-primary-dark, #2c4472);
  color: #fff;
}
.btn-small:hover {
  filter: brightness(0.96);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border: 1px solid var(--ds-primary-lighten-1, #5b79b8);
  background: #e8edf5;
  color: var(--ds-primary-dark, #2c4472);
  font-size: 11px;
  font-weight: 600;
}
.chip button {
  border: none;
  background: transparent;
  color: #b91c1c;
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 0;
}
.empty-state {
  padding: 16px;
  text-align: center;
  color: #6b7a90;
  font-size: 12px;
}
.karyawan-info {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  border-top: 1px dashed var(--ds-border, #b0b8c4);
  padding-top: 12px;
  flex-wrap: wrap;
}
.info-chip {
  padding: 5px 10px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface-variant, #eef1f6);
  font-size: 11px;
  color: #55637a;
}
.info-chip strong {
  color: var(--ds-on-surface, #1b2d4a);
}
</style>