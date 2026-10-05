/** Test stand-in for `virtual:pwa-register`: no service worker is registered under jsdom. */
export function registerSW(): (reload?: boolean) => Promise<void> {
  return () => Promise.resolve();
}
