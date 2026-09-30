/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** Base URL direktori bukti/foto. Default: http://103.103.22.7/cutikaryawan/bukti */
  readonly VITE_FOTO_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}