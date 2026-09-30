<script setup lang="ts">
import { ref } from "vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import FotoPreviewDialog from "@/components/FotoPreviewDialog.vue";
import { todaySql } from "@/utils/format";

const firstOfMonth = todaySql().slice(0, 8) + "01";

const previewOpen = ref(false);
const previewFoto = ref<string | null>(null);

// Baris yang diklik pada thumbnail kolom "foto" (backend alias `foto`).
function openPreview(row: Record<string, any>) {
  previewFoto.value = row.foto || null;
  previewOpen.value = true;
}
</script>

<template>
  <BaseBrowse
    module-title="Daftar Lembur"
    module-subtitle="Data lembur karyawan"
    endpoint="/lembur"
    :columns="[
      // Diletakkan paling depan: kolom bukti jadi terlihat tanpa perlu scroll
      // horizontal, dan baris tetap pendek (thumb kecil). Nilai kolom = nama
      // file (tlembur.lem_foto); tidak di-sort/di-filter.
      { key: 'foto', label: 'Foto', type: 'image', sortable: false, filterable: false },
      { key: 'Nomor', label: 'Nomor' },
      { key: 'Tanggal', label: 'Tanggal', type: 'date' },
      { key: 'NIK', label: 'NIK' },
      { key: 'Nama', label: 'Nama' },
      { key: 'Jabatan', label: 'Jabatan' },
      { key: 'Departmen', label: 'Departemen' },
      { key: 'Unit', label: 'Unit' },
      { key: 'JamMulai', label: 'Jam Mulai' },
      { key: 'JamAkhir', label: 'Jam Akhir' },
      { key: 'Durasi', label: 'Durasi' },
      { key: 'Poin', label: 'Poin' },
    ]"
    has-period
    :default-start="firstOfMonth"
    :per-page="15"
    search-placeholder="Cari nomor, NIK, nama..."
    primary-key="Nomor"
    add-label="Tambah Lembur"
    add-form-path="/transaksi/lembur/form"
    edit-form-path="/transaksi/lembur/form"
    @preview-image="openPreview"
  />

  <FotoPreviewDialog
    v-model="previewOpen"
    :filename="previewFoto"
    title="Preview Foto Lembur"
  />
</template>