import type { ProductLine } from '../api';

/** Fields the server's lead-import row accepts (LeadImportSchema, strict): nothing else may be sent. */
export const IMPORT_FIELDS = ['fullName', 'mobile', 'email', 'productInterest', 'pincode'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ColumnMapping = Partial<Record<string, ImportField>>;
export type ImportRow = { fullName: string; mobile?: string; email?: string; productInterest?: ProductLine; pincode?: string };

export const MAX_IMPORT_ROWS = 5000;

const SYNONYMS: Record<ImportField, string[]> = {
  fullName: ['name', 'full name', 'fullname', 'client name', 'customer name', 'lead name'],
  mobile: ['mobile', 'mobile no', 'mobile number', 'phone', 'phone number', 'contact no', 'contact number'],
  email: ['email', 'email id', 'e-mail', 'email address'],
  productInterest: ['product', 'product interest', 'interest', 'plan type', 'type'],
  pincode: ['pincode', 'pin code', 'pin', 'postal code', 'zip'],
};
const normalise = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Exact (normalised) header synonyms only, each field at most once — a guess the user confirms, never a fuzzy match. */
export function autoMap(headers: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<ImportField>();
  for (const header of headers) {
    const field = IMPORT_FIELDS.find((f) => !taken.has(f) && SYNONYMS[f].includes(normalise(header)));
    if (field) {
      mapping[header] = field;
      taken.add(field);
    }
  }
  return mapping;
}

/** Ready to validate: a name column and at least one contact column, each field mapped once. */
export function mappingProblems(mapping: ColumnMapping): Array<'name_required' | 'contact_required' | 'duplicate_field'> {
  const fields = Object.values(mapping).filter((f): f is ImportField => f !== undefined);
  const problems: Array<'name_required' | 'contact_required' | 'duplicate_field'> = [];
  if (!fields.includes('fullName')) problems.push('name_required');
  if (!fields.includes('mobile') && !fields.includes('email')) problems.push('contact_required');
  if (new Set(fields).size !== fields.length) problems.push('duplicate_field');
  return problems;
}

const PRODUCTS: Record<string, ProductLine> = {
  'term life': 'TERM_LIFE', term: 'TERM_LIFE', 'savings life': 'SAVINGS_LIFE', savings: 'SAVINGS_LIFE', health: 'HEALTH', 'health floater': 'HEALTH_FLOATER',
  'family health': 'HEALTH_FLOATER', floater: 'HEALTH_FLOATER', child: 'CHILD', 'child plan': 'CHILD', retirement: 'RETIREMENT', pension: 'RETIREMENT', motor: 'MOTOR', other: 'OTHER',
};

/** Accepts the enum (TERM_LIFE) or common words (Term life, Floater); anything else is left out rather than sent. */
export function toProductLine(value: string): ProductLine | undefined {
  const key = normalise(value);
  return PRODUCTS[key] ?? PRODUCTS[key.replace(/_/g, ' ')] ?? (Object.values(PRODUCTS).find((p) => p === value.trim().toUpperCase()));
}

/** File rows → API rows: only mapped fields, empty cells omitted, product words normalised. */
export function toImportRows(headers: readonly string[], rows: readonly string[][], mapping: ColumnMapping): ImportRow[] {
  const columns = headers.map((h) => mapping[h]);
  return rows.map((cells) => {
    const row: ImportRow = { fullName: '' };
    columns.forEach((field, i) => {
      const value = (cells[i] ?? '').trim();
      if (!field || value === '') return;
      if (field === 'productInterest') {
        const product = toProductLine(value);
        if (product) row.productInterest = product;
      } else {
        row[field] = value;
      }
    });
    return row;
  });
}
