import { describe, it, expect } from 'vitest';
import { parseBookCsv } from './csv';

describe('AC-M07-15 AC-CR001-06 book upload', () => {
  it('preserves quoted commas, newlines and positional duplicate Remarks headers', () => {
    expect(parseBookCsv('Client Name,Remarks,Remarks\r\n"Vats, N","policy\nremark","commission ""note"""')).toEqual({
      headers: ['Client Name', 'Remarks', 'Remarks#2'],
      rows: [{ 'Client Name': 'Vats, N', Remarks: 'policy\nremark', 'Remarks#2': 'commission "note"' }],
    });
  });
  it('rejects malformed row width and unterminated quotation', () => {
    expect(() => parseBookCsv('Name,Policy\nName')).toThrow();
    expect(() => parseBookCsv('Name\n"unfinished')).toThrow();
  });
});
