<script setup lang="ts">
import SimpleMasterView from "@/components/SimpleMasterView.vue";
</script>

<template>
  <SimpleMasterView
    endpoint="/departemen"
    title="Departemen"
    subtitle="Master data departemen"
    addLabel="Tambah Departemen"
    formPath="/master/departemen/form"
    searchPlaceholder="Cari nama departemen..."
  />
</template>