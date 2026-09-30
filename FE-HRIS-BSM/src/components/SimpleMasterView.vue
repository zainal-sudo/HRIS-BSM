<script setup lang="ts">
import BaseBrowse from "@/components/BaseBrowse.vue";

withDefaults(
  defineProps<{
    endpoint: string;
    title: string;
    subtitle?: string;
    addLabel: string;
    formPath: string;
    searchPlaceholder?: string;
  }>(),
  { subtitle: "" }
);
</script>

<template>
  <BaseBrowse
    :module-title="title"
    :module-subtitle="subtitle"
    :endpoint="endpoint"
    :columns="[
      { key: 'Kode', label: 'Kode', width: '120px' },
      { key: 'Nama', label: 'Nama' },
    ]"
    :search-placeholder="searchPlaceholder"
    :primary-key="'Kode'"
    :add-label="addLabel"
    :add-form-path="formPath"
    :edit-form-path="formPath"
  />
</template>