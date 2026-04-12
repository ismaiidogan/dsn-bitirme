/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_DSN_API_URL?: string;
  readonly VITE_DEFAULT_DSN_WEB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
