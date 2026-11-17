/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** SafeRoute API address, e.g. http://localhost:8000/api/v1 (the WebSocket uses the same host). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Where CesiumJS finds its workers and assets (set in vite.config.ts). */
declare const CESIUM_BASE_URL: string;
