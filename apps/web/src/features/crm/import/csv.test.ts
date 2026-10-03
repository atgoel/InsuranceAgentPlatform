import { describe, it, expect } from 'vitest';
import { csvCell, parseCSV, rowsToCsv, sha256 } from './csv';

describe('AC-M04-30 CSV parsing for lead import', () => {
  it('AC-M04-30 parses headers and rows, trimming unquoted fields', () => {
    expect(parseCSV('Name, Mobile ,Product\nAsha Verma, 9876500001 ,TERM_LIFE\n')).toEqual([
      ['Name', 'Mobile', 'Product'], ['Asha Verma', '9876500001', 'TERM_LIFE'],
    ]);
  });

  it('AC-M04-30 keeps quoted content exactly: commas, escaped quotes, spaces and line breaks', () => {
    expect(parseCSV('name,note\r\n"Verma, Asha","She said ""call me""  "\r\n"Ravi","line 1\r\nline 2"\r\n')).toEqual([
      ['name', 'note'], ['Verma, Asha', 'She said "call me"  '], ['Ravi', 'line 1\r\nline 2'],
    ]);
  });

  it('AC-M04-30 strips the Excel BOM so the first header still maps', () => {
    expect(parseCSV('﻿Name,Mobile\nA,1')[0]).toEqual(['Name', 'Mobile']);
  });

  it('AC-M04-30 skips blank lines, keeps empty fields, and handles a missing final newline and bare CR', () => {
    expect(parseCSV('a,b,c\n\n1,,3\r\n,,\n4,5,')).toEqual([['a', 'b', 'c'], ['1', '', '3'], ['4', '5', '']]);
    expect(parseCSV('a,b\r1,2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCSV('')).toEqual([]);
  });

  it('AC-M04-30 a quoted empty field is still a field', () => {
    expect(parseCSV('a,""\n')).toEqual([['a', '']]);
  });
});

describe('AC-M04-30 rejected-rows download', () => {
  it('AC-M04-30 neutralises spreadsheet formulas (CSV injection) and quotes per RFC 4180', () => {
    expect(['=HYPERLINK("x")', '+91 98765', '-1', '@SUM(A1)', 'plain', 'a,b', 'say "hi"'].map(csvCell)).toEqual([
      `"'=HYPERLINK(""x"")"`, "'+91 98765", "'-1", "'@SUM(A1)", 'plain', '"a,b"', '"say ""hi"""',
    ]);
  });

  it('AC-M04-30 round-trips through the parser (apart from the formula guard)', () => {
    const rows = [['Verma, Asha', 'line 1\nline 2', 'invalid_mobile']];
    expect(parseCSV(rowsToCsv(['name', 'note', 'reason'], rows))).toEqual([['name', 'note', 'reason'], ...rows]);
  });

  it('AC-M04-30 the file checksum is SHA-256 hex', async () => {
    expect(await sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
