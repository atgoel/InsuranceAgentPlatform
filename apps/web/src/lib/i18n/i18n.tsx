import { createContext, useContext, useState, ReactNode } from 'react';
import { messagesEn } from './messages.en';
import { messagesHi } from './messages.hi';

export type Lang = 'en' | 'hi';

interface I18nContextType {
  t(key: string, params?: Record<string, string | number>): string;
  lang: Lang;
  setLang(lang: Lang): void;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const messages: Record<Lang, Record<string, string>> = {
  en: messagesEn,
  hi: messagesHi,
};

/**
 * Parse ICU-lite plural format: {count, plural, one {singular} other {plural}}
 */
function parsePlural(template: string, count: number): string {
  const match = template.match(/\{count,\s*plural,\s*one\s*\{([^}]+)\}\s*other\s*\{([^}]+)\}\}/);
  if (!match) return template;

  const [, singular, plural] = match;
  const text = count === 1 ? singular : plural;
  return text.replace('#', String(count));
}

/**
 * Interpolate message with parameters
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;

  // Check for plurals first
  if ('count' in params && template.includes('{count, plural')) {
    const count = params.count as number;
    const pluralized = parsePlural(template, count);
    return interpolate(pluralized, params);
  }

  // Simple parameter substitution
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return String(params[key] ?? `{${key}}`);
  });
}

export interface I18nProviderProps {
  initialLang?: Lang;
  children: ReactNode;
}

export function I18nProvider({ initialLang = 'en', children }: I18nProviderProps) {
  const [lang, setLangState] = useState<Lang>(() => {
    // Load language from localStorage on init
    try {
      const stored = localStorage.getItem('ui-lang');
      if (stored === 'en' || stored === 'hi') {
        return stored;
      }
    } catch {
      // localStorage not available
    }
    return initialLang;
  });

  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    try {
      localStorage.setItem('ui-lang', newLang);
    } catch {
      // localStorage not available
    }
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    const msg = messages[lang][key] ?? messages.en[key];
    if (!msg) return key;
    return interpolate(msg, params);
  };

  return (
    <I18nContext.Provider value={{ t, lang, setLang }}>{children}</I18nContext.Provider>
  );
}

export function useT(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useT must be used inside I18nProvider');
  }
  return ctx;
}
