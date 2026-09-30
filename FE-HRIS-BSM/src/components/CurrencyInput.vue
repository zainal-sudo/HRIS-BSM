<script setup lang="ts">
import { ref } from "vue";
import { formatNumber } from "@/utils/format";

/**
 * Input angka dengan pemisah ribuan ala Indonesia (2.588.646).
 * - Saat tidak fokus: tampil dengan separator ribuan.
 * - Saat fokus: tampil angka mentah + terseleksi semua, tinggal ketik.
 * - v-model selalu number (kosong = 0), siap disimpan ke backend.
 */
const props = withDefaults(defineProps<{ modelValue?: number | null }>(), {
  modelValue: 0,
});
const emit = defineEmits<{ (e: "update:modelValue", v: number): void }>();

const focused = ref(false);
const draft = ref("");

const num = (v: unknown): number => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

function onFocus(e: FocusEvent) {
  focused.value = true;
  const n = Math.trunc(num(props.modelValue));
  draft.value = n === 0 ? "" : String(n);
  const el = e.target as HTMLInputElement;
  requestAnimationFrame(() => el.select());
}

function onInput(e: Event) {
  const el = e.target as HTMLInputElement;
  // Hanya digit; buang nol di depan agar "0" + ketikan tidak menempel
  const digits = el.value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
  draft.value = digits;
  // Tulis balik agar posisi kursor tetap (tidak ada format ulang saat mengetik)
  if (el.value !== digits) el.value = digits;
  emit("update:modelValue", digits === "" ? 0 : Number(digits));
}

function onBlur() {
  focused.value = false;
}
</script>

<template>
  <input
    :value="focused ? draft : formatNumber(num(modelValue))"
    type="text"
    inputmode="numeric"
    autocomplete="off"
    spellcheck="false"
    @focus="onFocus"
    @input="onInput"
    @blur="onBlur"
  />
</template>
