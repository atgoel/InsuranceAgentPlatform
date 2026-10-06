import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRuntimeConfig } from './index';

describe('AC-M00-37 runtime config', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_OIDC_AUTHORITY', 'http://build/realms/iap');
    vi.stubEnv('VITE_OIDC_CLIENT_ID', 'build-client');
    vi.stubEnv('VITE_DEMO_LOGIN', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.__IAP_CONFIG__;
  });

  it('AC-M00-37 uses window.__IAP_CONFIG__ over the VITE values', () => {
    window.__IAP_CONFIG__ = { oidcAuthority: 'https://run/realms/iap', oidcClientId: 'run-client', demoLogin: true };
    expect(getRuntimeConfig()).toEqual({ oidcAuthority: 'https://run/realms/iap', oidcClientId: 'run-client', demoLogin: true });
  });

  it('AC-M00-37 without the global the VITE values apply', () => {
    vi.stubEnv('VITE_DEMO_LOGIN', '1');
    expect(getRuntimeConfig()).toEqual({ oidcAuthority: 'http://build/realms/iap', oidcClientId: 'build-client', demoLogin: true });
  });

  it('AC-M00-37 falls back per field and treats an explicit demoLogin false as false', () => {
    vi.stubEnv('VITE_DEMO_LOGIN', '1');
    window.__IAP_CONFIG__ = { oidcAuthority: 'https://run/realms/iap', demoLogin: false };
    expect(getRuntimeConfig()).toEqual({ oidcAuthority: 'https://run/realms/iap', oidcClientId: 'build-client', demoLogin: false });
  });

  it('AC-M00-37 leaves fields out when neither source has them', () => {
    vi.stubEnv('VITE_OIDC_AUTHORITY', '');
    vi.stubEnv('VITE_OIDC_CLIENT_ID', '');
    window.__IAP_CONFIG__ = {};
    expect(getRuntimeConfig()).toEqual({ demoLogin: false });
  });
});
