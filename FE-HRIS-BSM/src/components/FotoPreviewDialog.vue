<script setup lang="ts">
import { ref, computed, watch } from "vue";
import MsIcon from "@/components/MsIcon.vue";
import { fotoUrl } from "@/utils/foto";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    /** Nama file (atau URL absolut) dari kolom DB */
    filename?: string | null;
    title?: string;
  }>(),
  { filename: null, title: "Preview Foto" }
);

const emit = defineEmits<{ (e: "update:modelValue", value: boolean): void }>();

const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);
const rotation = ref(0);
const panning = ref(false);
const failed = ref(false);
let startX = 0;
let startY = 0;

const src = computed(() => fotoUrl(props.filename));
const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit("update:modelValue", v),
});
const canPan = computed(() => zoom.value > 1);
const canZoomIn = computed(() => zoom.value < 4);
const canZoomOut = computed(() => zoom.value > 1);

// Putaran kelipatan 90° menukar sumbu lebar/tinggi gambar, jadi batas
// maks-nya ikut ditukar (lihat .foto-img.rotated di <style>).
const isQuarterTurn = computed(() => Math.abs(rotation.value % 180) === 90);

const imageStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value}) rotate(${rotation.value}deg)`,
}));

function reset() {
  zoom.value = 1;
  panX.value = 0;
  panY.value = 0;
  rotation.value = 0;
}

// Reset zoom/pan/rotasi + status error setiap kali dialog dibuka atau filename berubah.
watch([() => props.modelValue, src], () => reset());

function zoomBy(delta: number) {
  zoom.value = Math.min(4, Math.max(1, Number((zoom.value + delta).toFixed(2))));
  if (zoom.value <= 1) {
    panX.value = 0;
    panY.value = 0;
  }
}

/** Putar 90° ke kiri/kanan. Zoom tetap, pan dinolkan agar gambar kembali terpusat. */
function rotateBy(deg: number) {
  rotation.value = ((((rotation.value + deg) % 360) + 360) % 360);
  panX.value = 0;
  panY.value = 0;
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  zoomBy(e.deltaY < 0 ? 0.2 : -0.2);
}

function startPan(e: MouseEvent) {
  if (!canPan.value) return;
  panning.value = true;
  startX = e.clientX - panX.value;
  startY = e.clientY - panY.value;
}

function onPan(e: MouseEvent) {
  if (!panning.value) return;
  panX.value = e.clientX - startX;
  panY.value = e.clientY - startY;
}

function endPan() {
  panning.value = false;
}
</script>

<template>
  <v-dialog v-model="visible" max-width="920" scrollable>
    <v-card rounded="false" class="foto-dialog">
      <v-card-item class="foto-dialog-head py-3">
        <div class="d-flex align-center">
          <MsIcon name="image" :size="18" className="foto-dialog-icon" />
          <v-card-title class="text-body-1 font-weight-bold pa-0 ml-2">
            {{ title }}
          </v-card-title>
        </div>
        <v-card-subtitle v-if="filename" class="text-caption pa-0 mt-1 ml-8">
          {{ filename }}
        </v-card-subtitle>
        <template #append>
          <v-btn icon="close" size="small" variant="text" @click="visible = false" />
        </template>
      </v-card-item>

      <v-divider />

      <v-card-text class="pa-0">
        <div class="foto-stage" @wheel="onWheel">
          <img
            v-if="src && !failed"
            :src="src"
            :alt="filename || 'Foto'"
            class="foto-img"
            :class="{ grab: canPan, grabbing: panning, rotated: isQuarterTurn }"
            :style="imageStyle"
            draggable="false"
            @mousedown="startPan"
            @mousemove="onPan"
            @mouseup="endPan"
            @mouseleave="endPan"
            @error="failed = true"
          />
          <div v-else class="foto-empty">
            <MsIcon name="broken_image" :size="34" />
            <span>{{ src ? "Foto tidak dapat dimuat" : "Tidak ada foto" }}</span>
            <a v-if="src && failed" :href="src" target="_blank" rel="noopener" class="foto-fallback-link">
              Coba buka langsung
            </a>
          </div>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="foto-dialog-foot">
        <div class="foto-zoom">
          <button class="foto-zoom-btn" :disabled="!canZoomOut" title="Perkecil" @click="zoomBy(-0.25)">
            <MsIcon name="remove" :size="16" />
          </button>
          <span class="foto-zoom-level">{{ Math.round(zoom * 100) }}%</span>
          <button class="foto-zoom-btn" :disabled="!canZoomIn" title="Perbesar" @click="zoomBy(0.25)">
            <MsIcon name="add" :size="16" />
          </button>
          <button class="foto-zoom-btn" title="Reset tampilan" @click="reset">
            <MsIcon name="restart_alt" :size="16" />
          </button>
          <span class="foto-zoom-sep"></span>
          <button class="foto-zoom-btn" title="Putar ke kiri" @click="rotateBy(-90)">
            <MsIcon name="rotate_left" :size="16" />
          </button>
          <span class="foto-zoom-level">{{ rotation }}&deg;</span>
          <button class="foto-zoom-btn" title="Putar ke kanan" @click="rotateBy(90)">
            <MsIcon name="rotate_right" :size="16" />
          </button>
        </div>
        <v-spacer />
        <a v-if="src" :href="src" target="_blank" rel="noopener" class="foto-open-link">
          <MsIcon name="open_in_new" :size="14" /> Buka di tab baru
        </a>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.foto-dialog-head {
  border-bottom: 1px solid var(--ds-border, #d7dde5);
}
.foto-dialog-icon {
  color: var(--ds-primary, #3b5998);
}
.foto-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 68vh;
  max-height: 620px;
  overflow: hidden;
  background: #1e2634;
  /* Menyediakan cqw/cqh untuk pembatas ukuran gambar di bawah. */
  container-type: size;
}
.foto-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
  transform-origin: center center;
  transition: transform 0.08s linear;
}
/* Diputar 90°/270° -> sumbu lebar & tinggi tertukar, jadi batas-fitting
   juga ikut tertukar. Tanpa ini gambar terpotong oleh .foto-stage.
   Dibatasi cqw/cqh (bukan %) karena transform tidak memengaruhi layout. */
@supports (width: 1cqw) {
  .foto-img {
    max-width: 100cqw;
    max-height: 100cqh;
  }
  .foto-img.rotated {
    max-width: 100cqh;
    max-height: 100cqw;
  }
}
.foto-img.grab {
  cursor: grab;
}
.foto-img.grabbing {
  cursor: grabbing;
  transition: none;
}
.foto-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #c3cbd8;
  font-size: 13px;
}
.foto-fallback-link {
  color: #8fb0ff;
  font-size: 12px;
  text-decoration: underline;
}
.foto-dialog-foot {
  gap: 8px;
}
.foto-zoom {
  display: flex;
  align-items: center;
  gap: 4px;
}
.foto-zoom-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ds-border, #b0b8c4);
  border-radius: 3px;
  background: #fff;
  color: var(--ds-on-surface, #1b2d4a);
  cursor: pointer;
}
.foto-zoom-btn:hover:not(:disabled) {
  background: var(--ds-primary-lighten-1, #dbe4f3);
}
.foto-zoom-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.foto-zoom-level {
  min-width: 48px;
  text-align: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--ds-on-surface, #1b2d4a);
}
.foto-zoom-sep {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--ds-border, #b0b8c4);
}
.foto-open-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--ds-primary, #3b5998);
  text-decoration: none;
}
.foto-open-link:hover {
  text-decoration: underline;
}
</style>
