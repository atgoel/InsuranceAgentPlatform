/// <reference types="vite-plugin-pwa/client" />
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { registerSW } from 'virtual:pwa-register';

export interface PwaState {
  needRefresh: boolean;
  update(): void;
  canInstall: boolean;
  install(): Promise<void>;
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

const IDLE: PwaState = {
  needRefresh: false,
  update: () => undefined,
  canInstall: false,
  install: () => Promise.resolve(),
};

const PwaContext = createContext<PwaState>(IDLE);

function useServiceWorker() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updater = useRef<(reload?: boolean) => Promise<void>>(() => Promise.resolve());
  useEffect(() => {
    updater.current = registerSW({ onNeedRefresh: () => setNeedRefresh(true) });
  }, []);
  const update = useCallback(() => {
    void updater.current(true);
  }, []);
  return { needRefresh, update };
}

function useInstallPrompt() {
  const saved = useRef<InstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      saved.current = event as InstallPromptEvent;
      setCanInstall(true);
    };
    const onInstalled = () => {
      saved.current = null;
      setCanInstall(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  const install = useCallback(async () => {
    const event = saved.current;
    if (!event) return;
    saved.current = null;
    setCanInstall(false);
    await event.prompt();
  }, []);
  return { canInstall, install };
}

/** Registers the service worker and keeps the browser install prompt (ADR-008, M00 §13.8). */
export function PwaProvider({ children }: { children: ReactNode }) {
  const { needRefresh, update } = useServiceWorker();
  const { canInstall, install } = useInstallPrompt();
  const value = useMemo(() => ({ needRefresh, update, canInstall, install }), [needRefresh, update, canInstall, install]);
  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa(): PwaState {
  return useContext(PwaContext);
}
