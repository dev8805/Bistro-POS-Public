/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pwa/info" />

interface ImportMetaEnv {
  readonly VITE_EANDB_TOKENS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// buildId horneado en el bundle en tiempo de compilación (Req 1.2)
declare const __BUILD_ID__: string;
