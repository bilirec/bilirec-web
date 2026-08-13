/// <reference types="vite/client" />
declare const GITHUB_RUNTIME_PERMANENT_NAME: string
declare const BASE_KV_SERVICE_URL: string

interface ImportMetaEnv {
  readonly UMAMI_URL: string
  readonly UMAMI_WEBSITE_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}