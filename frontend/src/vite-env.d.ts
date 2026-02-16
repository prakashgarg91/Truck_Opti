/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_AUTH_EMAIL_OTP_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
