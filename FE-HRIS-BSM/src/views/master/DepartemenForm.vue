<script setup lang="ts">
import SimpleMasterForm from "@/components/SimpleMasterForm.vue";
</script>

<template>
  <SimpleMasterForm
    endpoint="/departemen"
    title="Departemen"
    subtitle="Data departemen"
    icon="business"
    :module-crumb="{ label: 'Master Departemen', path: '/master/departemen' }"
    returnPath="/master/departemen"
  />
</template>