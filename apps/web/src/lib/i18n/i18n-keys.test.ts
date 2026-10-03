import { describe, expect, it } from 'vitest';
import { messagesEn } from './messages.en';
import { messagesHi } from './messages.hi';

// Every literal key passed to t('…') in production source must have an English message;
// otherwise the UI shows the raw key. Hindi falls back to English at runtime.
const sources = import.meta.glob(['../../**/*.{ts,tsx}', '!../../**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const [file, text] of Object.entries(sources)) {
    for (const m of text.matchAll(/\bt\(\s*'([a-zA-Z][\w]*(?:\.[\w]+)+)'/g)) keys.set(m[1], file);
  }
  return keys;
}

describe('AC-M00 i18n message catalogue', () => {
  it('has an English message for every key used in source', () => {
    const missing = [...usedKeys()].filter(([key]) => !(key in messagesEn)).map(([key, file]) => `${key} (${file})`);
    expect(missing).toEqual([]);
  });

  it('has no Hindi keys that English lacks', () => {
    expect(Object.keys(messagesHi).filter((k) => !(k in messagesEn))).toEqual([]);
  });
});
