/** Character-level state for the RFC 4180 reader (see parseCSV). */
export class CsvReader {
  readonly rows: string[][] = [];
  private row: string[] = [];
  private field = '';
  private quoted = false;
  private inQuotes = false;

  /** Consumes src[i]; returns how many extra characters were consumed (escaped quote or CRLF). */
  read(src: string, i: number): number {
    const c = src[i];
    const next = src[i + 1];
    if (this.inQuotes) return this.readQuoted(c, next);
    if (c === '"' && this.field.trim() === '') {
      this.inQuotes = true;
      this.quoted = true;
      this.field = '';
    } else if (c === ',') this.endField();
    else if (c === '\n' || c === '\r') {
      this.endRow();
      return c === '\r' && next === '\n' ? 1 : 0;
    } else this.field += c;
    return 0;
  }

  finish(): string[][] {
    if (this.field !== '' || this.row.length > 0 || this.quoted) this.endRow();
    return this.rows;
  }

  private readQuoted(c: string | undefined, next: string | undefined): number {
    if (c === '"' && next === '"') {
      this.field += '"';
      return 1;
    }
    if (c === '"') this.inQuotes = false;
    else this.field += c;
    return 0;
  }

  private endField(): void {
    this.row.push(this.quoted ? this.field : this.field.trim());
    this.field = '';
    this.quoted = false;
  }

  private endRow(): void {
    this.endField();
    if (this.row.some((f) => f !== '')) this.rows.push(this.row);
    this.row = [];
  }
}
