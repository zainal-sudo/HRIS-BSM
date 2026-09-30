<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
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
  lem_nomor: "",
  tanggal: todaySql(),
  kar_nik: null as string | null,
  kar_nama: "",
  nm_dept: "",
  nm_jabat: "",
  jamMulai: "",
  jamAkhir: "",
  keterangan: "",
  lem_durasi: "00:00",
  lem_poin: "",
  lem_foto: null as string | null,
});

const karyawanInfo = ref<{ absensi: any }>({ absensi: {} });

// BATCH
interface BatchRow {
  nik: string;
  nama: string;
  jamMulai: string;
  jamAkhir: string;
  durasi: string;
  poin: number;
}
const batchRows = ref<BatchRow[]>([]);

const isValid = computed(() => {
  if (inputMode.value === "single") {
    return form.kar_nik && form.tanggal && form.jamMulai && form.jamAkhir;
  }
  return (
    form.tanggal &&
    batchRows.value.length > 0 &&
    batchRows.value.every((r) => r.nik && r.jamMulai && r.jamAkhir)
  );
});

function hitungDurasi(mulai: string, akhir: string): string {
  if (!mulai || !akhir) return "00:00";
  const [sh, smn] = mulai.split(":").map(Number);
  const [eh, emn] = akhir.split(":").map(Number);
  const diffMs = (eh * 3600 + emn * 60 - (sh * 3600 + smn * 60)) * 1000;
  if (diffMs <= 0) return "00:00";
  const diffMin = Math.floor(diffMs / 60000);
  return `${String(Math.floor(diffMin / 60)).padStart(2, "0")}:${String(diffMin % 60).padStart(2, "0")}`;
}

function hitungPoin(mulai: string, akhir: string): number {
  if (!mulai || !akhir) return 0;
  const [sh, smn] = mulai.split(":").map(Number);
  const [eh, emn] = akhir.split(":").map(Number);
  const durasiJam = (eh * 3600 + emn * 60 - (sh * 3600 + smn * 60)) / 3600;
  if (durasiJam <= 0) return 0;
  if (durasiJam <= 1) return Math.round(durasiJam * 1.5 * 10000) / 10000;
  return Math.round((1.5 + (durasiJam - 1) * 2) * 10000) / 10000;
}

function onJamChange() {
  form.lem_durasi = hitungDurasi(form.jamMulai, form.jamAkhir);
  form.lem_poin = hitungPoin(form.jamMulai, form.jamAkhir).toString();
}

async function fetchMaxKode() {
  if (inputMode.value === "batch") return;
  try {
    const { data } = await api.get("/lembur/max-kode");
    form.lem_nomor = data.data.kode;
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal generate nomor"));
  }
}

async function loadKaryawan(nik: string) {
  try {
    const { data } = await api.get(`/lembur/karyawan/${nik}`, {
      params: { tanggal: form.tanggal },
    });
    const d = data.data;
    form.kar_nama = d.kar_nama || "";
    form.nm_dept = d.nm_dept || "";
    form.nm_jabat = d.nm_jabat || "";
    karyawanInfo.value = { absensi: d.absensi || {} };
  } catch (e: any) {
    const msg = getErrorMessage(e, "Gagal memuat detail karyawan");
    if (e?.response?.status === 404) {
      form.kar_nama = "";
      form.nm_dept = "";
      form.nm_jabat = "";
      karyawanInfo.value = { absensi: {} };
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
  fetchMaxKode();
}

function addBatchRow() {
  batchRows.value.push({
    nik: "",
    nama: "",
    jamMulai: "",
    jamAkhir: "",
    durasi: "00:00",
    poin: 0,
  });
}

function onBatchPick(row: BatchRow, sel: { NIK: string; Nama: string }) {
  row.nik = sel.NIK;
  row.nama = sel.Nama;
}

function onBatchJam(row: BatchRow) {
  row.durasi = hitungDurasi(row.jamMulai, row.jamAkhir);
  row.poin = hitungPoin(row.jamMulai, row.jamAkhir);
}

function removeBatchRow(idx: number) {
  batchRows.value.splice(idx, 1);
}

// ── Foto bukti ──
// Kolom `lem_foto` hanya menyimpan NAMA FILE. Berkasnya diunggah ke server
// legacy lewat POST /lembur/upload (prefix "LM") dan disajikan dari direktori
// `bukti/`. Foto lama (dari DB) dimuat via fotoUrl(), foto baru yang belum
// diunggah ditampilkan sebagai data-URL lokal.
const selectedFile = ref<File | null>(null);
const localPreview = ref<string | null>(null);
const remotePreview = ref<string | null>(null);
const uploading = ref(false);
const fotoBroken = ref(false);

const previewSrc = computed(() => localPreview.value || remotePreview.value || "");

// Nama file di DB berubah (mis. setelah simpan) -> reset penanda berkas hilang.
watch(
  () => form.lem_foto,
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
  form.lem_foto = null;
}

/**
 * Unggah foto ke server bukti (proxy ke upload.php) bila ada file baru,
 * dan kembalikan NAMA FILE untuk disimpan ke DB.
 * Melempar error bila gagal — BaseForm sudah menampilkannya sebagai satu toast.
 */
async function uploadFoto(): Promise<string> {
  if (!selectedFile.value) return form.lem_foto || "";
  uploading.value = true;
  try {
    form.lem_foto = await uploadFotoBukti(selectedFile.value, {
      endpoint: "/lembur/upload",
      prefix: "LM",
    });
    return form.lem_foto;
  } finally {
    uploading.value = false;
  }
}

async function loadEdit() {
  const id = route.query.id as string;
  if (!id) return;
  try {
    const { data } = await api.get(`/lembur/${id}`);
    const d = data.data;
    form.lem_nomor = d.lem_nomor || "";
    form.kar_nik = d.lem_kar_nik || null;
    form.tanggal = String(d.lem_tanggal).slice(0, 10);
    form.jamMulai = d.lem_jammulai ? String(d.lem_jammulai).slice(0, 5) : "";
    form.jamAkhir = d.lem_jamakhir ? String(d.lem_jamakhir).slice(0, 5) : "";
    form.keterangan = d.lem_keterangan || "";
    form.lem_durasi = d.lem_durasi || hitungDurasi(form.jamMulai, form.jamAkhir);
    form.lem_poin = d.lem_poin ?? hitungPoin(form.jamMulai, form.jamAkhir).toString();
    form.lem_foto = d.lem_foto || null;
    remotePreview.value = d.lem_foto ? fotoUrl(d.lem_foto) : null;
    if (d.lem_kar_nik) await loadKaryawan(d.lem_kar_nik);
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data"));
  }
}

async function save(): Promise<string> {
  if (!isValid.value) {
    throw new Error("Lengkapi NIK, tanggal, dan jam mulai/akhir");
  }
  // Upload foto dulu (kalau ada file baru) — nama file hasil upload yang
  // disimpan ke DB. Gagal upload melempar error, sehingga data lembur tidak
  // tersimpan tanpa bukti.
  const fotoFilename = await uploadFoto();

  if (inputMode.value === "batch") {
    const { data } = await api.post("/lembur/batch", {
      lem_tanggal: form.tanggal,
      lem_keterangan: form.keterangan,
      // Satu foto berlaku untuk seluruh baris batch.
      lem_foto: fotoFilename || null,
      rows: batchRows.value.map((r) => ({
        nik: r.nik,
        jamMulai: r.jamMulai,
        jamAkhir: r.jamAkhir,
        keterangan: r.nama,
        poin: r.poin,
        durasi: r.durasi,
      })),
    });
    return data.message || `Berhasil menyimpan ${batchRows.value.length} data lembur.`;
  }
  const payload = {
    lem_nomor: form.lem_nomor,
    lem_kar_nik: form.kar_nik,
    lem_tanggal: form.tanggal,
    lem_jammulai: form.jamMulai,
    lem_jamakhir: form.jamAkhir,
    lem_keterangan: form.keterangan || null,
    lem_poin: Number(form.lem_poin) || 0,
    lem_durasi: form.lem_durasi || null,
    lem_foto: fotoFilename || null,
  };
  if (isEdit.value) {
    const { data } = await api.put(`/lembur/${route.query.id}`, payload);
    return data.message || "Data lembur berhasil diperbarui.";
  }
  const { data } = await api.post("/lembur", payload);
  return data.message || "Data lembur berhasil disimpan.";
}

onMounted(() => {
  fetchMaxKode();
  loadEdit();
});
</script>

<template>
  <BaseForm
    :title="isEdit ? 'Edit Lembur' : 'Input Lembur'"
    subtitle="Lembur karyawan"
    icon="schedule"
    :crumbs="[
      { label: 'Transaksi Lembur', path: '/transaksi/lembur' },
      { label: isEdit ? 'Edit' : 'Tambah' },
    ]"
    :save-fn="save"
    return-path="/transaksi/lembur"
    hint="Lengkapi NIK, tanggal, jam mulai dan jam akhir"
  >
    <template #form-content>
      <div class="form-layout">
        <div class="card">
          <div class="card-head">
            <span>Data Lembur</span>
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
                  <input v-model="form.lem_nomor" type="text" disabled />
                </div>
                <div class="field">
                  <label>Tanggal <span class="req">*</span></label>
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
                <div class="field">
                  <label>Jam Mulai <span class="req">*</span></label>
                  <input v-model="form.jamMulai" type="time" @change="onJamChange" />
                </div>
                <div class="field">
                  <label>Jam Akhir <span class="req">*</span></label>
                  <input v-model="form.jamAkhir" type="time" @change="onJamChange" />
                </div>
                <div class="field">
                  <label>Durasi</label>
                  <input v-model="form.lem_durasi" type="text" disabled />
                </div>
                <div class="field">
                  <label>Poin</label>
                  <input v-model="form.lem_poin" type="text" disabled />
                </div>
                <FTextarea
                  v-model="form.keterangan"
                  label="Keterangan"
                  placeholder="Keterangan lembur..."
                  :rows="2"
                />
                <FotoUploadField
                  :src="previewSrc"
                  :filename="form.lem_foto"
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
                Input lembur <strong>beberapa karyawan</strong> pada tanggal yang sama sekaligus.
              </div>
              <div class="grid-2">
                <div class="field">
                  <label>Tanggal <span class="req">*</span></label>
                  <input v-model="form.tanggal" type="date" />
                </div>
                <div class="field">
                  <label>Keterangan</label>
                  <input v-model="form.keterangan" type="text" placeholder="Keterangan" />
                </div>
                <FotoUploadField
                  :src="previewSrc"
                  :filename="form.lem_foto"
                  :uploading="uploading"
                  :broken="fotoBroken"
                  @select="onFotoPicked"
                  @clear="clearFoto"
                  @error="fotoBroken = true"
                />
              </div>

              <div class="batch-section">
                <div class="batch-head">
                  <label class="batch-title">Daftar Karyawan</label>
                  <button class="btn-small primary" @click="addBatchRow">
                    <MsIcon name="add" :size="14" /> Tambah Baris
                  </button>
                </div>

                <table v-if="batchRows.length > 0" class="batch-table">
                  <thead>
                    <tr>
                      <th style="width: 30px">#</th>
                      <th>NIK</th>
                      <th>Nama</th>
                      <th>Jam Mulai</th>
                      <th>Jam Akhir</th>
                      <th>Durasi</th>
                      <th>Poin</th>
                      <th style="width: 36px"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, i) in batchRows" :key="i">
                      <td>{{ i + 1 }}</td>
                      <td>
                        <KaryawanLookup
                          :model-value="row.nik"
                          :display-name="row.nama || row.nik || ''"
                          :label="`Baris ${i + 1}`"
                          :placeholder="'Pilih karyawan'"
                          @update:display-name="row.nama = $event"
                          @select="onBatchPick(row, $event)"
                        />
                      </td>
                      <td class="nama-cell">{{ row.nama }}</td>
                      <td>
                        <input
                          v-model="row.jamMulai"
                          type="time"
                          class="time-input"
                          @change="onBatchJam(row)"
                        />
                      </td>
                      <td>
                        <input
                          v-model="row.jamAkhir"
                          type="time"
                          class="time-input"
                          @change="onBatchJam(row)"
                        />
                      </td>
                      <td>{{ row.durasi }}</td>
                      <td>{{ row.poin }}</td>
                      <td>
                        <button class="row-del" @click="removeBatchRow(i)">
                          <MsIcon name="close" :size="13" />
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div v-else class="empty-state">Belum ada karyawan ditambahkan</div>
              </div>
            </template>

            <!-- INFO -->
            <div v-if="form.kar_nik" class="karyawan-info">
              <span class="info-chip">Jam In: <strong>{{ karyawanInfo.absensi?.Jam_in || '-' }}</strong></span>
              <span class="info-chip">Jam Out: <strong>{{ karyawanInfo.absensi?.Jam_out || '-' }}</strong></span>
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
.batch-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.batch-title {
  font-size: 11px;
  font-weight: 800;
  color: var(--ds-primary, #3b5998);
  text-transform: uppercase;
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
.batch-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.batch-table th {
  background: var(--ds-primary-dark, #243656);
  color: #fff;
  padding: 5px 8px;
  text-align: left;
  border: 1px solid #1b2d4a;
}
.batch-table td {
  padding: 4px 6px;
  border: 1px solid #d7dde5;
  color: var(--ds-on-surface, #1b2d4a);
  background: #fff;
}
.time-input {
  height: 28px;
  padding: 0 6px;
  border: 1px solid var(--ds-border, #b0b8c4);
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11px;
}
.nama-cell {
  font-weight: 600;
  color: var(--ds-on-surface, #1b2d4a);
}
.row-del {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: #b91c1c;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.row-del:hover {
  background: #fdeaea;
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