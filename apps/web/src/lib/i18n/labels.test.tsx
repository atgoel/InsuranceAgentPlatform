import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, useT } from './i18n';
import { useLabel, type LabelKind } from './labels';
import { messagesEn } from './messages.en';
import { messagesHi } from './messages.hi';

const specs = import.meta.glob('../../../../../docs/spec/modules/M0*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function spec(module: string): string {
  const entry = Object.entries(specs).find(([path]) => path.includes(module));
  if (!entry) throw new Error(`Missing LLD ${module}`);
  return entry[1];
}

function codes(text: string): string[] {
  return [...text.matchAll(/'([A-Z][A-Z_]*)'/g)].map((match) => match[1]);
}

function typeCodes(module: string, type: string): string[] {
  const declaration = spec(module).match(new RegExp(`export type ${type} = ([^;]+);`));
  if (!declaration) throw new Error(`Missing LLD type ${type}`);
  return codes(declaration[1]);
}

function contractCodes(): Record<LabelKind, string[]> {
  const category = spec('M05-catalogue').match(/category: ([^}]+) }/);
  const servicing = spec('M07-book-retention').match(/kind: ('ADDRESS_CHANGE'[^,]+)/);
  if (!category || !servicing) throw new Error('Missing inline LLD enum');
  return {
    productCategory: codes(category[1]),
    line: [...new Set([...typeCodes('M05-catalogue', 'LineOfBusiness'), ...typeCodes('M04-crm', 'ProductLine')])],
    leadSource: typeCodes('M04-crm', 'LeadSource'),
    leadStage: typeCodes('M04-crm', 'LeadStage'),
    opportunityStage: typeCodes('M04-crm', 'OpportunityStage'),
    policyStatus: typeCodes('M07-book-retention', 'PolicyStatus'),
    role: [...spec('M02-distribution').matchAll(/^\| `([A-Z_]+)` \| (?:TENANT|OWN|UNIT_SUBTREE) \|/gm)]
      .map((match) => match[1]),
    recordScope: typeCodes('M02-distribution', 'RecordScopeKind'),
    servicingType: codes(servicing[1]),
  };
}

function Label({ kind = 'productCategory', code = 'CHILD' }: { kind?: LabelKind; code?: string }) {
  const label = useLabel(kind, code);
  const { setLang } = useT();
  return (
    <>
      <output aria-label="Code label">{label}</output>
      <button onClick={() => setLang('hi')}>Hindi</button>
    </>
  );
}

describe('WP-A3 BUG-09 code labels', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('covers exactly the LLD enums in both languages', () => {
    const expected = Object.entries(contractCodes()).flatMap(([kind, values]) => values.map((code) => `labels.${kind}.${code}`));
    expect(expected.length).toBeGreaterThan(60);
    for (const messages of [messagesEn, messagesHi]) {
      const actual = Object.keys(messages).filter((key) => key.startsWith('labels.'));
      expect(actual.sort()).toEqual([...expected].sort());
      for (const key of actual) {
        const code = key.split('.').at(-1);
        expect(messages[key as keyof typeof messages]).toBeTruthy();
        expect(messages[key as keyof typeof messages]).not.toBe(key);
        expect(code).toBeTruthy();
      }
    }
  });

  it('translates codes and re-renders when the language switches', async () => {
    render(<I18nProvider><Label /></I18nProvider>);
    expect(screen.getByLabelText('Code label')).toHaveTextContent('Child plan');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Hindi' }));
    expect(screen.getByLabelText('Code label')).toHaveTextContent('बाल योजना');
  });

  it('translates a code in the selected kind', () => {
    render(<I18nProvider><Label kind="leadSource" code="IMPORT" /></I18nProvider>);
    expect(screen.getByLabelText('Code label')).toHaveTextContent('Import');
  });

  it.each(['UNRECOGNISED', 'toString', ''])('returns unknown code %s and emits a development warning', (code) => {
    vi.stubEnv('DEV', true);
    const warning = vi.fn();
    window.addEventListener('i18n.label.unknown', warning);
    try {
      render(<I18nProvider><Label code={code} /></I18nProvider>);
      expect(screen.getByLabelText('Code label').textContent).toBe(code);
      expect(warning).toHaveBeenCalledTimes(1);
      expect(warning.mock.calls[0][0].detail).toEqual({ kind: 'productCategory', code });
    } finally {
      window.removeEventListener('i18n.label.unknown', warning);
    }
  });

  it('suppresses warnings in production and for known codes', () => {
    vi.stubEnv('DEV', false);
    const warning = vi.fn();
    window.addEventListener('i18n.label.unknown', warning);
    try {
      const view = render(<I18nProvider><Label code="UNRECOGNISED" /></I18nProvider>);
      expect(screen.getByLabelText('Code label')).toHaveTextContent('UNRECOGNISED');
      vi.stubEnv('DEV', true);
      view.rerender(<I18nProvider><Label code="CHILD" /></I18nProvider>);
      expect(screen.getByLabelText('Code label')).toHaveTextContent('Child plan');
      expect(warning).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('i18n.label.unknown', warning);
    }
  });
});


