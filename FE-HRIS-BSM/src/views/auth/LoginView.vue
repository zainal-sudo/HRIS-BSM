<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import { useAuthStore } from "@/stores/authStore";
import { usePermissionStore } from "@/stores/permissionStore";
import { pickError } from "@/api";

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const permissionStore = usePermissionStore();

const username = ref("");
const password = ref("");
const loading = ref(false);
const errorMsg = ref("");
const showPass = ref(false);

async function doLogin() {
  if (!username.value || !password.value) {
    errorMsg.value = "Username dan password wajib diisi";
    return;
  }
  loading.value = true;
  errorMsg.value = "";
  try {
    await authStore.login(username.value, password.value);
    permissionStore.reset();
    await permissionStore.fetchAll();
    router.push("/dashboard");
  } catch (e: any) {
    errorMsg.value = pickError(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand">
        <span class="brand-badge">
          <MsIcon name="zap" :size="34" filled :weight="300" />
        </span>
        <div class="brand-text">
          <strong>BSM &mdash; HRIS</strong>
          <small>HUMAN RESOURCE INFORMATION SYSTEM</small>
        </div>
      </div>

      <div class="login-body">
        <div class="login-title">
          <MsIcon name="lock" :size="18" />
          <span>Silakan Masuk</span>
        </div>

        <div class="field">
          <label>Username</label>
          <input
            v-model="username"
            type="text"
            autocomplete="username"
            placeholder="Masukkan username"
            @keyup.enter="doLogin"
          />
        </div>

        <div class="field">
          <label>Password</label>
          <div class="pass-wrap">
            <input
              v-model="password"
              :type="showPass ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="Masukkan password"
              @keyup.enter="doLogin"
            />
            <button class="pass-toggle" type="button" @click="showPass = !showPass">
              <MsIcon :name="showPass ? 'visibility_off' : 'visibility'" :size="18" />
            </button>
          </div>
        </div>

        <div v-if="errorMsg" class="login-error">
          <MsIcon name="error" :size="15" />
          <span>{{ errorMsg }}</span>
        </div>

        <button class="login-btn" :disabled="loading" @click="doLogin">
          <MsIcon v-if="loading" name="progress_activity" :size="17" />
          <span>{{ loading ? "Memproses..." : "MASUK" }}</span>
        </button>
      </div>

      <div class="login-foot">
        <span>&copy; 2026 BSM. Desktop HRIS Application.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  width: 100%;
}
.login-card {
  width: 400px;
  max-width: 100%;
  background: var(--ds-surface, #f0f3f8);
  border: 1px solid var(--ds-border, #b0b8c4);
  box-shadow: 0 12px 40px rgba(15, 26, 46, 0.28);
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 22px 22px 18px;
  background: linear-gradient(180deg, #1b2d4a 0%, #243656 100%);
  border-bottom: 3px solid #3b5998;
}
.brand-badge {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #5b79b8, #3b5998);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  color: #fff;
}
.brand-text strong {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.brand-text small {
  font-size: 9.5px;
  letter-spacing: 0.16em;
  color: rgba(255, 255, 255, 0.55);
  font-weight: 600;
}
.login-body {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.login-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ds-primary, #3b5998);
  font-weight: 700;
  font-size: 14px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field label {
  font-size: 11px;
  font-weight: 700;
  color: #55637a;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.field input {
  height: 38px;
  padding: 0 10px;
  border: 1px solid #b0b8c4;
  background: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 13px;
  color: #1b2d4a;
  outline: none;
}
.field input:focus {
  border-color: var(--ds-primary, #3b5998);
  box-shadow: 0 0 0 2px rgba(59, 89, 152, 0.15);
}
.pass-wrap {
  position: relative;
}
.pass-wrap input {
  width: 100%;
  padding-right: 38px;
}
.pass-toggle {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: #6b7a90;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pass-toggle:hover {
  color: var(--ds-primary, #3b5998);
}
.login-error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid #f5b5b5;
  background: #fdeaea;
  color: #b91c1c;
  font-size: 12px;
}
.login-btn {
  height: 42px;
  border: none;
  background: linear-gradient(180deg, #4a6cab 0%, #3b5998 100%);
  color: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.login-btn:hover:not(:disabled) {
  background: linear-gradient(180deg, #3b5998 0%, #2c4472 100%);
}
.login-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.login-foot {
  padding: 10px 22px;
  border-top: 1px solid var(--ds-border, #c3cad4);
  text-align: center;
  font-size: 10.5px;
  color: #6b7a90;
}
</style>