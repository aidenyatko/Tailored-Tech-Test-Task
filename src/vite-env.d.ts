/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_MODE?: "api" | "mock";
  readonly VITE_DEFAULT_LOGIN_EMAIL?: string;
  readonly VITE_DEFAULT_LOGIN_PASSWORD?: string;
  readonly VITE_DEMO_ACCOUNTS_TEXT?: string;
}
