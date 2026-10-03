import { CsvReader } from './csv-parse';

/**
 * RFC 4180 CSV for the lead import wizard (parsed in the browser; no dependency).
 * Quoted fields keep their content exactly (commas, quotes as "", CR/LF); unquoted fields are trimmed; a leading
 * UTF-8 BOM (Excel) is removed; blank lines are skipped.
 */
export function parseCSV(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const reader = new CsvReader();
  for (let i = 0; i < src.length; i += 1) i += reader.read(src, i);
  return reader.finish();
}

/** SHA-256 of the file text (hex): the server skips rows already imported from the same file. */
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * One CSV cell for download. Cells starting with = + - @ (or tab/CR) are prefixed with ' so spreadsheet apps show
 * them as text instead of running them as formulas (CSV injection); quoting per RFC 4180.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function rowsToCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function rowsToCSVBlob(headers: string[], rows: string[][]): Blob {
  return new Blob([rowsToCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
}
