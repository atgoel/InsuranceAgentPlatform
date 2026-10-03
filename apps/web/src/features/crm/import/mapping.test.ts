import { describe, it, expect } from 'vitest';
import { autoMap, mappingProblems, toImportRows, toProductLine } from './mapping';

describe('AC-M04-30 column mapping for lead import', () => {
  it('AC-M04-30 auto-maps common register headers exactly, and leaves look-alikes unmapped', () => {
    expect(autoMap(['S. No.', 'Client Name', 'CONTACT NO.', 'Company Name', 'Email ID', 'Type', 'Pin Code', 'Promo code', 'Language'])).toEqual({
      'Client Name': 'fullName', 'CONTACT NO.': 'mobile', 'Email ID': 'email', Type: 'productInterest', 'Pin Code': 'pincode',
    });
  });

  it('AC-M04-30 maps each field once (first matching column wins)', () => {
    expect(autoMap(['Name', 'Full Name', 'Phone'])).toEqual({ Name: 'fullName', Phone: 'mobile' });
  });

  it('AC-M04-30 requires a name and a contact column, each field once', () => {
    expect(mappingProblems({})).toEqual(['name_required', 'contact_required']);
    expect(mappingProblems({ A: 'fullName', B: 'email' })).toEqual([]);
    expect(mappingProblems({ A: 'fullName', B: 'mobile', C: 'mobile' })).toEqual(['duplicate_field']);
  });

  it('AC-M04-30 builds API rows with mapped fields only, omitting empty cells and normalising products', () => {
    const rows = toImportRows(['Name', 'Mobile', 'Type', 'City'], [['Asha', ' 9876500001 ', 'Health Floater', 'Delhi'], ['Ravi', '', 'Unknown thing', 'Pune']], { Name: 'fullName', Mobile: 'mobile', Type: 'productInterest' });
    expect(rows).toEqual([{ fullName: 'Asha', mobile: '9876500001', productInterest: 'HEALTH_FLOATER' }, { fullName: 'Ravi' }]);
  });

  it.each([['TERM_LIFE', 'TERM_LIFE'], ['term life', 'TERM_LIFE'], ['HEALTH', 'HEALTH'], ['Pension', 'RETIREMENT'], ['MOTOR', 'MOTOR'], ['ULIP', undefined]])(
    'AC-M04-30 product "%s" → %s', (input, expected) => {
      expect(toProductLine(input)).toBe(expected);
    },
  );
});
