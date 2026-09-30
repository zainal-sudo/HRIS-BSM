<script setup lang="ts">
import SimpleMasterForm from "@/components/SimpleMasterForm.vue";
</script>

<template>
  <SimpleMasterForm
    endpoint="/jabatan"
    title="Jabatan"
    subtitle="Data jabatan"
    icon="work"
    :module-crumb="{ label: 'Master Jabatan', path: '/master/jabatan' }"
    returnPath="/master/jabatan"
  />
</template>