import { parseCSV } from '../crm/import/csv';

/** Header identity includes occurrence, so two Remarks columns never overwrite each other. */
export function parseBookCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '"') continue;
    if (quoted && text[i + 1] === '"') i += 1;
    else quoted = !quoted;
  }
  if (quoted) throw new Error('book.invalid_csv');
  const [original, ...data] = parseCSV(text);
  if (!original?.length || data.length === 0 || data.length > 5000) throw new Error('book.invalid_csv');
  const seen = new Map<string, number>();
  const headers = original.map((header) => {
    const count = (seen.get(header.trim().toLowerCase()) ?? 0) + 1;
    seen.set(header.trim().toLowerCase(), count);
    return count === 1 ? header : `${header}#${count}`;
  });
  if (new Set(headers).size !== headers.length || headers.some((h) => !h)) throw new Error('book.invalid_csv');
  const rows = data.map((row) => {
    if (row.length !== headers.length) throw new Error('book.invalid_csv');
    return Object.fromEntries(headers.map((header, i) => [header, row[i]]));
  });
  return { headers, rows };
}
