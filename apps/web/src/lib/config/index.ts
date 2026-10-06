export interface RuntimeConfig {
  oidcAuthority?: string;
  oidcClientId?: string;
  demoLogin: boolean;
}

declare global {
  interface Window {
    __IAP_CONFIG__?: { oidcAuthority?: string; oidcClientId?: string; demoLogin?: boolean };
  }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Runtime values from `/config.js` (window.__IAP_CONFIG__), falling back per field to the Vite build-time variables. */
export function getRuntimeConfig(): RuntimeConfig {
  const injected = typeof window === 'undefined' ? undefined : window.__IAP_CONFIG__;
  const demoLogin = typeof injected?.demoLogin === 'boolean' ? injected.demoLogin : import.meta.env.VITE_DEMO_LOGIN === '1';
  const config: RuntimeConfig = { demoLogin };
  const oidcAuthority = text(injected?.oidcAuthority) ?? text(import.meta.env.VITE_OIDC_AUTHORITY);
  const oidcClientId = text(injected?.oidcClientId) ?? text(import.meta.env.VITE_OIDC_CLIENT_ID);
  if (oidcAuthority) config.oidcAuthority = oidcAuthority;
  if (oidcClientId) config.oidcClientId = oidcClientId;
  return config;
}
