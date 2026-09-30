<script setup lang="ts">
import SimpleMasterForm from "@/components/SimpleMasterForm.vue";
</script>

<template>
  <SimpleMasterForm
    endpoint="/unit"
    title="Unit"
    subtitle="Data unit"
    icon="apartment"
    :module-crumb="{ label: 'Master Unit', path: '/master/unit' }"
    returnPath="/master/unit"
  />
</template>