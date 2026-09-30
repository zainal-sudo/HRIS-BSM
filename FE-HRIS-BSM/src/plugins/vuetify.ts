import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";

// ─── Tema BSM — Steel Blue Classic Desktop ──────────────────────────
const bsmTheme = {
  dark: false,
  colors: {
    primary: "#3B5998",
    "primary-darken-1": "#2C4472",
    "primary-lighten-1": "#5B79B8",

    secondary: "#1B2D4A",
    "secondary-darken-1": "#0F1A2E",

    success: "#059669",
    info: "#3B5998",
    warning: "#D97706",
    error: "#DC2626",

    background: "#E8ECF1",
    surface: "#F0F3F8",
    "surface-variant": "#E0E4EA",
    "on-surface": "#1B2D4A",
    "on-primary": "#ffffff",
  },
};

const bsmDarkTheme = {
  dark: true,
  colors: {
    primary: "#5B79B8",
    "primary-darken-1": "#3B5998",
    secondary: "#8494A7",
    success: "#34D399",
    info: "#60A5FA",
    warning: "#FBBF24",
    error: "#F87171",
    background: "#0F1A2E",
    surface: "#1B2D4A",
    "surface-variant": "#243656",
    "on-surface": "#E2E8F0",
    "on-primary": "#1B2D4A",
  },
};

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: "bsmTheme",
    themes: {
      bsmTheme,
      bsmDarkTheme,
    },
  },
  defaults: {
    VBtn: {
      style: "font-size: 11px; letter-spacing: 0.02em; font-weight: 600; border-radius: 0;",
    },
    VTextField: {
      density: "compact",
      variant: "outlined",
      hideDetails: "auto",
      style: "font-size: 11px; border-radius: 0;",
    },
    VSelect: {
      density: "compact",
      variant: "outlined",
      hideDetails: "auto",
      style: "font-size: 11px; border-radius: 0;",
    },
    VAutocomplete: {
      density: "compact",
      variant: "outlined",
      hideDetails: "auto",
      style: "font-size: 11px; border-radius: 0;",
    },
    VTextarea: {
      density: "compact",
      variant: "outlined",
      hideDetails: "auto",
      style: "font-size: 11px; border-radius: 0;",
    },
    VCheckbox: {
      density: "compact",
      hideDetails: "auto",
    },
    VCard: {
      rounded: false,
      elevation: 0,
    },
    VDataTable: {
      density: "compact",
    },
  },
});