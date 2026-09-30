<script setup lang="ts">
import SimpleMasterView from "@/components/SimpleMasterView.vue";
</script>

<template>
  <SimpleMasterView
    endpoint="/jabatan"
    title="Jabatan"
    subtitle="Master data jabatan"
    addLabel="Tambah Jabatan"
    formPath="/master/jabatan/form"
    searchPlaceholder="Cari nama jabatan..."
  />
</template>