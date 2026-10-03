import type { CalculatorId } from './api';
import { rupeesToPaise } from './money';

export type FieldKind = 'money' | 'number' | 'select' | 'bool' | 'ages' | 'members';

export interface FieldDef {
  name: string;
  kind: FieldKind;
  options?: string[];
}

const TIER = ['1', '2', '3'];

export const CALCULATORS: Record<CalculatorId, FieldDef[]> = {
  'protection-gap': [
    { name: 'annualIncomePaise', kind: 'money' },
    { name: 'annualExpensesPaise', kind: 'money' },
    { name: 'yearsToRetire', kind: 'number' },
    { name: 'liabilitiesPaise', kind: 'money' },
    { name: 'existingCoverPaise', kind: 'money' },
    { name: 'liquidAssetsPaise', kind: 'money' },
  ],
  retirement: [
    { name: 'currentAge', kind: 'number' },
    { name: 'retireAge', kind: 'number' },
    { name: 'monthlyExpensePaise', kind: 'money' },
    { name: 'existingCorpusPaise', kind: 'money' },
    { name: 'monthlySipPaise', kind: 'money' },
  ],
  'child-goal': [
    { name: 'goal', kind: 'select', options: ['EDUCATION', 'MARRIAGE'] },
    { name: 'currentCostPaise', kind: 'money' },
    { name: 'yearsToGoal', kind: 'number' },
    { name: 'savedPaise', kind: 'money' },
  ],
  'health-sum-insured': [
    { name: 'cityTier', kind: 'select', options: TIER },
    { name: 'ages', kind: 'ages' },
    { name: 'existingCoverPaise', kind: 'money' },
    { name: 'preExisting', kind: 'bool' },
  ],
  floater: [
    { name: 'members', kind: 'members' },
    { name: 'cityTier', kind: 'select', options: TIER },
  ],
};

export const CALCULATOR_IDS = Object.keys(CALCULATORS) as CalculatorId[];

export type FormValues = Record<string, string | boolean>;

function parseAges(text: string): number[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map(Number);
}

const CONVERTERS: Record<FieldKind, (text: string, raw: string | boolean | undefined, field: FieldDef) => unknown> = {
  money: (text) => rupeesToPaise(text),
  number: (text) => (text.trim() === '' ? undefined : Number(text)),
  select: (text, _raw, field) => (field.name === 'cityTier' ? Number(text || TIER[0]) : text || field.options?.[0]),
  bool: (_text, raw) => raw === true,
  ages: (text) => parseAges(text),
  members: (text) => parseAges(text).map((age) => ({ age })),
};

function convert(field: FieldDef, raw: string | boolean | undefined): unknown {
  return CONVERTERS[field.kind](typeof raw === 'string' ? raw : '', raw, field);
}

/** Form values (rupees as typed) to the calculator's request input (integer paise). */
export function buildInput(calculator: CalculatorId, values: FormValues): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const field of CALCULATORS[calculator]) {
    const value = convert(field, values[field.name]);
    if (value !== undefined) input[field.name] = value;
  }
  return input;
}

/** Does a server error path (e.g. `input.annualIncomePaise` or `ages.0`) belong to this field? */
export function pathMatches(path: string, name: string): boolean {
  const local = path.replace(/^input\./, '');
  return local === name || local.startsWith(`${name}.`) || local.startsWith(`${name}[`);
}
