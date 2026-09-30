<script setup lang="ts">
import BaseBrowse from "@/components/BaseBrowse.vue";
import { todaySql } from "@/utils/format";

const firstOfMonth = todaySql().slice(0, 8) + "01";
</script>

<template>
  <BaseBrowse
    module-title="Daftar Karyawan Keluar"
    module-subtitle="Data karyawan keluar"
    endpoint="/keluar"
    :columns="[
      { key: 'Nomor', label: 'Nomor' },
      { key: 'Tanggal', label: 'Tanggal', type: 'date' },
      { key: 'NIK', label: 'NIK' },
      { key: 'Nama', label: 'Nama' },
      { key: 'Jabatan', label: 'Jabatan' },
      { key: 'Departemen', label: 'Departemen' },
      { key: 'Unit', label: 'Unit' },
      { key: 'Alasan', label: 'Alasan' },
      { key: 'Keterangan', label: 'Keterangan' },
    ]"
    has-period
    :default-start="firstOfMonth"
    search-placeholder="Cari nomor, NIK, nama..."
    primary-key="Nomor"
    add-label="Tambah Keluar"
    add-form-path="/transaksi/karyawan-keluar/form"
    edit-form-path="/transaksi/karyawan-keluar/form"
  />
</template>