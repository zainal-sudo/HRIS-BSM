<script setup lang="ts">
import MsIcon from "@/components/MsIcon.vue";
</script>

<template>
  <div class="error-card">
    <span class="error-badge"><MsIcon name="no_accounts" :size="44" /></span>
    <h1>403</h1>
    <p>Anda tidak memiliki akses untuk halaman ini.</p>
    <router-link to="/dashboard" class="error-btn">
      <MsIcon name="home" :size="15" /> Kembali ke Dashboard
    </router-link>
  </div>
</template>

<style scoped>
.error-card {
  width: 420px;
  max-width: 100%;
  text-align: center;
  padding: 36px 28px;
  background: var(--ds-surface, #f0f3f8);
  border: 1px solid var(--ds-border, #b0b8c4);
  box-shadow: 0 10px 34px rgba(15, 26, 46, 0.24);
}
.error-badge {
  color: #dc2626;
}
.error-card h1 {
  font-size: 48px;
  font-weight: 800;
  color: var(--ds-primary, #3b5998);
  margin: 6px 0;
}
.error-card p {
  color: #55637a;
  font-size: 13px;
  margin-bottom: 18px;
}
.error-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 16px;
  background: var(--ds-primary, #3b5998);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}
.error-btn:hover {
  background: var(--ds-primary-darken-1, #2c4472);
}
</style>