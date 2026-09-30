<script setup lang="ts">
import BaseBrowse from "@/components/BaseBrowse.vue";
</script>

<template>
  <BaseBrowse
    module-title="Data Karyawan"
    module-subtitle="Master data karyawan"
    endpoint="/karyawan"
    :columns="[
      { key: 'NIK', label: 'NIK' },
      { key: 'Nama', label: 'Nama' },
      { key: 'Email', label: 'Email' },
      { key: 'Jabatan', label: 'Jabatan' },
      { key: 'Departmen', label: 'Departemen' },
      { key: 'Unit', label: 'Unit' },
      { key: 'Masuk', label: 'Tgl Masuk', type: 'date' },
      { key: 'MasaKerja', label: 'Masa Kerja', sortable: false, filterable: false },
      { key: 'TglAkhirKontrak', label: 'Tgl Akhir Kontrak', type: 'date' },
      { key: 'StatusKaryawan', label: 'Status Karyawan' },
      { key: 'Status', label: 'Status Aktif' },
    ]"
    :per-page="15"
    search-placeholder="Cari nama, NIK, jabatan, departemen..."
    primary-key="NIK"
    add-label="Tambah Karyawan"
    add-form-path="/master/karyawan/form"
    edit-form-path="/master/karyawan/form"
  />
</template>