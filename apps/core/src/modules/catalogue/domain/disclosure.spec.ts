import { describe, it, expect } from '@jest/globals';
import { disclosureFor, type ScopeInput } from './scope-engine';

/**
 * AC-M05-04: Disclosure texts match the wireframe exactly per persona, with
 * alphabetically sorted insurer names.
 */
describe('AC-M05-04 disclosureFor', () => {
  const today = '2026-10-03';

  describe('IMF disclosure (TIED_INSURERS)', () => {
    it('returns exact IMF disclosure text with single insurer name', () => {
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, ['ABC Insurance']);

      expect(text).toBe('Showing plans from your tied insurers only: ABC Insurance. This disclosure appears on shared comparisons.');
    });

    it('returns exact IMF disclosure text with multiple insurers (alphabetically sorted)', () => {
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_1', 'ins_2'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, ['Zulu Insurance', 'Alpha Insurers', 'Beta Corp']);

      expect(text).toBe('Showing plans from your tied insurers only: Alpha Insurers, Beta Corp, Zulu Insurance. This disclosure appears on shared comparisons.');
    });

    it('handles unsorted insurer names by sorting them alphabetically', () => {
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, ['Zebra Inc', 'Apple Ltd', 'Mango Corp']);

      expect(text).toBe('Showing plans from your tied insurers only: Apple Ltd, Mango Corp, Zebra Inc. This disclosure appears on shared comparisons.');
    });
  });

  describe('CORPORATE_AGENT disclosure (TIED_INSURERS)', () => {
    it('returns exact CORPORATE_AGENT disclosure text with single insurer', () => {
      const input: ScopeInput = {
        entityType: 'CORPORATE_AGENT',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, ['Corporate Insurance']);

      expect(text).toBe('Showing plans from your tied insurers only: Corporate Insurance. This disclosure appears on shared comparisons.');
    });

    it('returns exact CORPORATE_AGENT disclosure text with multiple insurers (alphabetically sorted)', () => {
      const input: ScopeInput = {
        entityType: 'CORPORATE_AGENT',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_1', 'ins_2', 'ins_3'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, ['Zulu Corp', 'Alpha Ltd', 'Beta Inc']);

      expect(text).toBe('Showing plans from your tied insurers only: Alpha Ltd, Beta Inc, Zulu Corp. This disclosure appears on shared comparisons.');
    });
  });

  describe('BROKER disclosure (MARKET_WIDE)', () => {
    it('returns exact BROKER disclosure text with single insurer', () => {
      const input: ScopeInput = {
        entityType: 'BROKER',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: [] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, ['Broker Network Inc']);

      expect(text).toBe('Broker view: comparing across all configured insurers (Broker Network Inc). Advice is documented in the advice record.');
    });

    it('returns exact BROKER disclosure text with multiple insurers (alphabetically sorted)', () => {
      const input: ScopeInput = {
        entityType: 'BROKER',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: [] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, ['Zebra Insurance', 'Alpha Insurers', 'Beta Corp']);

      expect(text).toBe('Broker view: comparing across all configured insurers (Alpha Insurers, Beta Corp, Zebra Insurance). Advice is documented in the advice record.');
    });

    it('insurer names sorted alphabetically in BROKER disclosure', () => {
      const input: ScopeInput = {
        entityType: 'BROKER',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: [] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, ['XYZ Ltd', 'ABC Corp', 'MNO Inc']);

      expect(text).toBe('Broker view: comparing across all configured insurers (ABC Corp, MNO Inc, XYZ Ltd). Advice is documented in the advice record.');
    });
  });

  describe('POSP disclosure (any entity type)', () => {
    it('returns exact POSP disclosure text (POSP takes precedence over entity type)', () => {
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'POSP', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, ['Any Insurance']);

      expect(text).toBe('POSP view: only POSP-eligible products are shown. Other plans need an ISP or employee salesperson.');
    });

    it('returns exact POSP disclosure text regardless of insurer names', () => {
      const input: ScopeInput = {
        entityType: 'BROKER',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: [] },
        salesperson: { type: 'POSP', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, ['Insurer A', 'Insurer B', 'Insurer C']);

      expect(text).toBe('POSP view: only POSP-eligible products are shown. Other plans need an ISP or employee salesperson.');
    });

    it('POSP salesperson of CORPORATE_AGENT entity returns POSP disclosure', () => {
      const input: ScopeInput = {
        entityType: 'CORPORATE_AGENT',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'POSP', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, ['Corporate Insurance']);

      expect(text).toBe('POSP view: only POSP-eligible products are shown. Other plans need an ISP or employee salesperson.');
    });
  });

  describe('INDIVIDUAL_AGENT disclosure', () => {
    it('returns exact INDIVIDUAL_AGENT disclosure text', () => {
      const input: ScopeInput = {
        entityType: 'INDIVIDUAL_AGENT',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, ['Agent Insurer']);

      expect(text).toBe('Agent view: only your appointing insurer for this line is shown (one insurer per line today; limits are configurable).');
    });

    it('returns exact INDIVIDUAL_AGENT disclosure text regardless of insurer names', () => {
      const input: ScopeInput = {
        entityType: 'INDIVIDUAL_AGENT',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, ['Insurer A', 'Insurer B']);

      expect(text).toBe('Agent view: only your appointing insurer for this line is shown (one insurer per line today; limits are configurable).');
    });

    it('ignores insurer names for INDIVIDUAL_AGENT disclosure', () => {
      const input: ScopeInput = {
        entityType: 'INDIVIDUAL_AGENT',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const text1 = disclosureFor(input, ['Alpha']);
      const text2 = disclosureFor(input, ['Beta', 'Gamma']);

      expect(text1).toBe(text2);
    });
  });

  describe('insurer name joining', () => {
    it('joins multiple names with comma and space', () => {
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, ['Name One', 'Name Two', 'Name Three']);

      expect(text).toContain('Name One, Name Three, Name Two');
    });

    it('handles single insurer without trailing comma', () => {
      const input: ScopeInput = {
        entityType: 'BROKER',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: [] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, ['Single Insurer']);

      expect(text).toBe('Broker view: comparing across all configured insurers (Single Insurer). Advice is documented in the advice record.');
    });

    it('handles two insurers with single comma', () => {
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_1', 'ins_2'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, ['Insurer A', 'Insurer B']);

      expect(text).toBe('Showing plans from your tied insurers only: Insurer A, Insurer B. This disclosure appears on shared comparisons.');
    });
  });

  describe('empty and edge case insurer names', () => {
    it('handles empty insurer names array (edge case)', () => {
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, []);

      // No tied insurer yet: say so explicitly rather than rendering an empty list
      expect(text).toBe('Showing plans from your tied insurers only: none configured. This disclosure appears on shared comparisons.');
    });

    it('handles names with special characters', () => {
      const input: ScopeInput = {
        entityType: 'BROKER',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: [] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, ['Company & Co.', 'L&T Insurance']);

      expect(text).toContain('Company & Co.');
      expect(text).toContain('L&T Insurance');
    });
  });

  describe('case sensitivity in sorting', () => {
    it('sorts names case-insensitively (alphabetically)', () => {
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const text = disclosureFor(input, ['alpha', 'Zebra', 'BETA']);

      expect(text).toBe('Showing plans from your tied insurers only: alpha, BETA, Zebra. This disclosure appears on shared comparisons.');
    });
  });
});
