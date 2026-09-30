<script setup lang="ts">
import SimpleMasterView from "@/components/SimpleMasterView.vue";
</script>

<template>
  <SimpleMasterView
    endpoint="/unit"
    title="Unit"
    subtitle="Master data unit"
    addLabel="Tambah Unit"
    formPath="/master/unit/form"
    searchPlaceholder="Cari nama unit..."
  />
</template>