export const appConfig = {
  demoMode: import.meta.env.VITE_DEMO_MODE === "mock" ? "mock" : "api",
  defaultLoginEmail: import.meta.env.VITE_DEFAULT_LOGIN_EMAIL ?? "owner@acme.test",
  defaultLoginPassword: import.meta.env.VITE_DEFAULT_LOGIN_PASSWORD ?? "owner123",
  demoAccountsText: import.meta.env.VITE_DEMO_ACCOUNTS_TEXT ?? "Demo accounts: owner@acme.test / owner123, editor@acme.test / editor123, viewer@acme.test / viewer123."
} as const;
