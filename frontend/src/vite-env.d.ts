/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Socket.IO server URL. Unset means the app runs against the in-browser mock. */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
