<script setup lang="ts">
import { ref } from "vue";
import MsIcon from "@/components/MsIcon.vue";
import { FOTO_EXTENSIONS, MAX_FOTO_BYTES } from "@/utils/foto";

withDefaults(
  defineProps<{
    /** URL/data-URL foto yang sedang ditampilkan (null = belum ada) */
    src?: string | null;
    /** Nama file, untuk tooltip */
    filename?: string | null;
    uploading?: boolean;
    /** true bila <img> gagal dimuat (nama file ada tapi berkasnya hilang) */
    broken?: boolean;
  }>(),
  { src: null, filename: null, uploading: false, broken: false }
);

const emit = defineEmits<{
  (e: "select", file: File): void;
  (e: "clear"): void;
  /** <img> gagal dimuat — berkasnya hilang di server bukti/ */
  (e: "error"): void;
}>();

const input = ref<HTMLInputElement | null>(null);

function pick() {
  input.value?.click();
}

function onChange(e: Event) {
  const el = e.target as HTMLInputElement;
  const file = el.files?.[0];
  // Kosongkan input agar memilih file yang sama lagi tetap memicu change.
  el.value = "";
  if (file) emit("select", file);
}

function clear() {
  if (input.value) input.value.value = "";
  emit("clear");
}

const accept = FOTO_EXTENSIONS.map((e) => `image/${e === "jpg" ? "jpeg" : e}`).join(",");
</script>

<template>
  <div class="field">
    <label>Foto Bukti</label>
    <div class="foto-upload">
      <input ref="input" type="file" :accept="accept" hidden @change="onChange" />

      <button type="button" class="foto-btn" :disabled="uploading" @click="pick">
        <MsIcon :name="uploading ? 'hourglass_top' : 'upload_file'" :size="15" />
        <span>{{ uploading ? "Mengunggah..." : src ? "Ganti Foto" : "Pilih Foto" }}</span>
      </button>

      <span v-if="src && !broken" class="foto-mini">
        <img :src="src" :alt="filename || 'Foto bukti'" @error="emit('error')" />
      </span>
      <span v-else-if="broken" class="foto-mini missing" title="Berkas tidak ditemukan di server">
        <MsIcon name="broken_image" :size="20" />
      </span>

      <div v-if="src || broken" class="foto-meta">
        <span class="foto-name" :title="filename || ''">
          {{ broken ? "Berkas tidak ditemukan" : filename || "Foto baru (belum diunggah)" }}
        </span>
        <button type="button" class="foto-clear" title="Hapus foto" @click="clear">
          <MsIcon name="close" :size="13" />
        </button>
      </div>
    </div>
    <div class="foto-hint">
      JPG/PNG, maks {{ Math.round(MAX_FOTO_BYTES / 1024 / 1024) }} MB. Disimpan ke server bukti.
    </div>
  </div>
</template>

<style scoped>
.foto-upload {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.foto-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--ds-border, #b0b8c4);
  border-radius: 3px;
  background: #fff;
  color: var(--ds-primary, #3b5998);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.foto-btn:hover:not(:disabled) {
  background: var(--ds-primary-lighten-1, #dbe4f3);
}
.foto-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.foto-mini {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border: 1px solid var(--ds-border, #b0b8c4);
  border-radius: 3px;
  background: #fff;
  overflow: hidden;
  flex-shrink: 0;
}
.foto-mini img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.foto-mini.missing {
  color: #94a3b8;
  background: #f1f4f8;
}
.foto-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 1 1 160px;
}
.foto-name {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--ds-on-surface, #1b2d4a);
  opacity: 0.75;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.foto-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: #dc2626;
  cursor: pointer;
}
.foto-clear:hover {
  background: rgba(220, 38, 38, 0.12);
}
.foto-hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--ds-on-surface, #1b2d4a);
  opacity: 0.6;
}
</style>
