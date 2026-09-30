import { ref, watch } from "vue";
import { useTheme } from "vuetify";

const T_KEY = "bsm_hris_dark";
const dark = ref(false);

let initialized = false;

function readStored(): boolean {
  try {
    return localStorage.getItem(T_KEY) === "1";
  } catch {
    return false;
  }
}

export function useThemeToggle() {
  // WAJIB: useTheme() hanya boleh dipanggil di dalam setup().
  // File ini sebelumnya memanggilnya di level module (saat import),
  // sehingga error: "[Vuetify] useTheme must be called from inside a setup function"
  // dan halaman jadi blank putih.
  const theme = useTheme();

  function apply() {
    theme.global.name.value = dark.value ? "bsmDarkTheme" : "bsmTheme";
    if (dark.value) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  if (!initialized) {
    initialized = true;
    dark.value = readStored();
    apply();

    watch(dark, () => {
      try {
        localStorage.setItem(T_KEY, dark.value ? "1" : "0");
      } catch {
        /* abaikan */
      }
      apply();
    });
  } else {
    // Pastikan theme Vuetify sinkron saat composable dipakai di komponen lain
    // (mis. setelah navigasi / keep-alive).
    apply();
  }

  return {
    dark,
    toggle() {
      dark.value = !dark.value;
    },
  };
}