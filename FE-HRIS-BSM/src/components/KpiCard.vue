<script setup lang="ts">
import MsIcon from "@/components/MsIcon.vue";

withDefaults(
  defineProps<{
    label: string;
    value: number | string;
    icon: string;
    color?: string;
  }>(),
  { color: "#3b5998" }
);
</script>

<template>
  <div class="kpi-card">
    <div class="kpi-icon" :style="{ background: color }">
      <MsIcon :name="icon" :size="22" />
    </div>
    <div class="kpi-body">
      <div class="kpi-value">{{ value }}</div>
      <div class="kpi-label">{{ label }}</div>
    </div>
  </div>
</template>

<style scoped>
.kpi-card {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface, #f0f3f8);
  padding: 14px;
}
.kpi-icon {
  width: 46px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex: 0 0 46px;
}
.kpi-body {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.kpi-value {
  font-size: 24px;
  font-weight: 800;
  color: var(--ds-on-surface, #1b2d4a);
  font-variant-numeric: tabular-nums;
}
.kpi-label {
  font-size: 11px;
  font-weight: 600;
  color: #6b7a90;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
</style>