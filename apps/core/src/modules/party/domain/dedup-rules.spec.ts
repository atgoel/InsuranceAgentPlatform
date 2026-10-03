import { describe, it, expect } from '@jest/globals';
import {
  DuplicateMatcher,
  SamePanRule,
  SameEmailAndNameRule,
  SameMobileAndNameRule,
  NameAndDobRule,
  SharedContactOnlyRule,
  MatchCandidateInput,
  DuplicateSignal,
} from './dedup-rules';

/**
 * AC-M03-07: Duplicate rules: same PAN → 100; same mobile + similar name → 90;
 * same email + similar name → 90; similar name + same DOB → 80; shared mobile
 * with different name → 40 with the family explanation and never a merge candidate
 * above threshold; autoMergeAllowed is always false.
 */
describe('AC-M03-07 DuplicateRules', () => {
  const candidateA: MatchCandidateInput = {
    partyId: 'party_a',
    displayName: 'John Doe',
    contactHashes: ['hash_mobile_1'],
    dobYear: 1990,
  };

  const candidateB: MatchCandidateInput = {
    partyId: 'party_b',
    displayName: 'John Doe',
    contactHashes: ['hash_mobile_1'],
    dobYear: 1990,
  };

  describe('SamePanRule', () => {
    it('returns 100 score when PAN hashes match', () => {
      const rule = new SamePanRule();
      const a: MatchCandidateInput = {
        ...candidateA,
        panHash: 'pan_hash_1',
      };
      const b: MatchCandidateInput = {
        ...candidateB,
        panHash: 'pan_hash_1',
      };

      const signal = rule.match(a, b);

      expect(signal).toBeDefined();
      expect(signal?.score).toBe(100);
      expect(signal?.rule).toBe('SamePanRule');
      expect(signal?.autoMergeAllowed).toBe(false);
    });

    it('returns undefined when PAN hashes differ', () => {
      const rule = new SamePanRule();
      const a: MatchCandidateInput = {
        ...candidateA,
        panHash: 'pan_hash_1',
      };
      const b: MatchCandidateInput = {
        ...candidateB,
        panHash: 'pan_hash_2',
      };

      const signal = rule.match(a, b);

      expect(signal).toBeUndefined();
    });

    it('returns undefined when either panHash is missing', () => {
      const rule = new SamePanRule();
      const a: MatchCandidateInput = {
        ...candidateA,
        panHash: 'pan_hash_1',
      };
      const b: MatchCandidateInput = {
        ...candidateB,
      };

      const signal = rule.match(a, b);

      expect(signal).toBeUndefined();
    });
  });

  describe('SameMobileAndNameRule', () => {
    it('returns 90 score when mobile hash and names are similar (≥0.85)', () => {
      const rule = new SameMobileAndNameRule();
      const a: MatchCandidateInput = {
        ...candidateA,
        displayName: 'John Doe',
        contactHashes: ['hash_mobile_1'],
      };
      const b: MatchCandidateInput = {
        ...candidateB,
        displayName: 'John Doe',
        contactHashes: ['hash_mobile_1'],
      };

      const signal = rule.match(a, b);

      expect(signal).toBeDefined();
      expect(signal?.score).toBe(90);
      expect(signal?.rule).toBe('SameMobileAndNameRule');
    });

    it('returns undefined when names are dissimilar (<0.85)', () => {
      const rule = new SameMobileAndNameRule();
      const a: MatchCandidateInput = {
        ...candidateA,
        displayName: 'John Doe',
        contactHashes: ['hash_mobile_1'],
      };
      const b: MatchCandidateInput = {
        ...candidateB,
        displayName: 'Jane Smith',
        contactHashes: ['hash_mobile_1'],
      };

      const signal = rule.match(a, b);

      expect(signal).toBeUndefined();
    });

    it('returns undefined when mobile hashes differ', () => {
      const rule = new SameMobileAndNameRule();
      const a: MatchCandidateInput = {
        ...candidateA,
        displayName: 'John Doe',
        contactHashes: ['hash_mobile_1'],
      };
      const b: MatchCandidateInput = {
        ...candidateB,
        displayName: 'John Doe',
        contactHashes: ['hash_mobile_2'],
      };

      const signal = rule.match(a, b);

      expect(signal).toBeUndefined();
    });
  });

  describe('SameEmailAndNameRule', () => {
    it('returns 90 score when email hash and names are similar (≥0.85)', () => {
      const rule = new SameEmailAndNameRule();
      const a: MatchCandidateInput = {
        ...candidateA,
        displayName: 'John Doe',
        contactHashes: ['hash_email_1'],
      };
      const b: MatchCandidateInput = {
        ...candidateB,
        displayName: 'John Doe',
        contactHashes: ['hash_email_1'],
      };

      const signal = rule.match(a, b);

      expect(signal).toBeDefined();
      expect(signal?.score).toBe(90);
      expect(signal?.rule).toBe('SameEmailAndNameRule');
    });

    it('returns undefined when email hashes differ', () => {
      const rule = new SameEmailAndNameRule();
      const a: MatchCandidateInput = {
        ...candidateA,
        displayName: 'John Doe',
        contactHashes: ['hash_email_1'],
      };
      const b: MatchCandidateInput = {
        ...candidateB,
        displayName: 'John Doe',
        contactHashes: ['hash_email_2'],
      };

      const signal = rule.match(a, b);

      expect(signal).toBeUndefined();
    });
  });

  describe('NameAndDobRule', () => {
    it('returns 80 score when name JW ≥0.92 and DOB hashes match', () => {
      const rule = new NameAndDobRule();
      const a: MatchCandidateInput = {
        ...candidateA,
        displayName: 'John Doe',
        dobYear: 1990,
        dobHash: 'dob_hash_1',
      };
      const b: MatchCandidateInput = {
        ...candidateB,
        displayName: 'John Doe',
        dobYear: 1990,
        dobHash: 'dob_hash_1',
      };

      const signal = rule.match(a, b);

      expect(signal).toBeDefined();
      expect(signal?.score).toBe(80);
      expect(signal?.rule).toBe('NameAndDobRule');
    });

    it('returns undefined when DOB hashes differ', () => {
      const rule = new NameAndDobRule();
      const a: MatchCandidateInput = {
        ...candidateA,
        displayName: 'John Doe',
        dobYear: 1990,
        dobHash: 'dob_hash_1',
      };
      const b: MatchCandidateInput = {
        ...candidateB,
        displayName: 'John Doe',
        dobYear: 1990,
        dobHash: 'dob_hash_2',
      };

      const signal = rule.match(a, b);

      expect(signal).toBeUndefined();
    });

    it('returns undefined when names are dissimilar (<0.92)', () => {
      const rule = new NameAndDobRule();
      const a: MatchCandidateInput = {
        ...candidateA,
        displayName: 'John Doe',
        dobYear: 1990,
        dobHash: 'dob_hash_1',
      };
      const b: MatchCandidateInput = {
        ...candidateB,
        displayName: 'Jane Smith',
        dobYear: 1990,
        dobHash: 'dob_hash_1',
      };

      const signal = rule.match(a, b);

      expect(signal).toBeUndefined();
    });
  });

  describe('SharedContactOnlyRule', () => {
    it('returns 40 score when shared contact but names differ', () => {
      const rule = new SharedContactOnlyRule();
      const a: MatchCandidateInput = {
        ...candidateA,
        displayName: 'John Doe',
        contactHashes: ['hash_mobile_1'],
      };
      const b: MatchCandidateInput = {
        ...candidateB,
        displayName: 'Jane Smith',
        contactHashes: ['hash_mobile_1'],
      };

      const signal = rule.match(a, b);

      expect(signal).toBeDefined();
      expect(signal?.score).toBe(40);
      expect(signal?.rule).toBe('SharedContactOnlyRule');
      expect(signal?.explanation).toContain('Shared mobile');
      expect(signal?.explanation).toContain('family');
      expect(signal?.autoMergeAllowed).toBe(false);
    });

    it('returns undefined when no shared contact', () => {
      const rule = new SharedContactOnlyRule();
      const a: MatchCandidateInput = {
        ...candidateA,
        displayName: 'John Doe',
        contactHashes: ['hash_mobile_1'],
      };
      const b: MatchCandidateInput = {
        ...candidateB,
        displayName: 'Jane Smith',
        contactHashes: ['hash_mobile_2'],
      };

      const signal = rule.match(a, b);

      expect(signal).toBeUndefined();
    });

    it('returns undefined when names are similar', () => {
      const rule = new SharedContactOnlyRule();
      const a: MatchCandidateInput = {
        ...candidateA,
        displayName: 'John Doe',
        contactHashes: ['hash_mobile_1'],
      };
      const b: MatchCandidateInput = {
        ...candidateB,
        displayName: 'John Doe',
        contactHashes: ['hash_mobile_1'],
      };

      const signal = rule.match(a, b);

      expect(signal).toBeUndefined();
    });
  });

  describe('DuplicateMatcher', () => {
    it('applies rules in order and returns first match', () => {
      const matcher = new DuplicateMatcher();
      const a: MatchCandidateInput = {
        partyId: 'party_a',
        displayName: 'John Doe',
        contactHashes: ['hash_mobile_1'],
        panHash: 'pan_hash_1',
        dobYear: 1990,
      };
      const b: MatchCandidateInput = {
        partyId: 'party_b',
        displayName: 'John Doe',
        contactHashes: ['hash_mobile_1'],
        panHash: 'pan_hash_1',
        dobYear: 1990,
      };

      const signal = matcher.compare(a, b);

      // SamePanRule should match first (score 100)
      expect(signal?.score).toBe(100);
      expect(signal?.rule).toBe('SamePanRule');
    });

    it('returns undefined when no rules match', () => {
      const matcher = new DuplicateMatcher();
      const a: MatchCandidateInput = {
        partyId: 'party_a',
        displayName: 'John Doe',
        contactHashes: ['hash_mobile_1'],
      };
      const b: MatchCandidateInput = {
        partyId: 'party_b',
        displayName: 'Jane Smith',
        contactHashes: ['hash_mobile_2'],
      };

      const signal = matcher.compare(a, b);

      expect(signal).toBeUndefined();
    });

    it('isCandidate returns true when score >= threshold', () => {
      const matcher = new DuplicateMatcher();
      const signal: DuplicateSignal = {
        rule: 'SamePanRule',
        score: 100,
        autoMergeAllowed: false,
        explanation: 'Same PAN',
      };

      expect(matcher.isCandidate(signal, 60)).toBe(true);
      expect(matcher.isCandidate(signal, 100)).toBe(true);
      expect(matcher.isCandidate(signal, 101)).toBe(false);
    });

    it('isCandidate returns false when signal is undefined', () => {
      const matcher = new DuplicateMatcher();

      expect(matcher.isCandidate(undefined, 60)).toBe(false);
    });

    it('autoMergeAllowed is always false', () => {
      const matcher = new DuplicateMatcher();
      const a: MatchCandidateInput = {
        partyId: 'party_a',
        displayName: 'John Doe',
        contactHashes: ['hash_mobile_1'],
        panHash: 'pan_hash_1',
      };
      const b: MatchCandidateInput = {
        partyId: 'party_b',
        displayName: 'John Doe',
        contactHashes: ['hash_mobile_1'],
        panHash: 'pan_hash_1',
      };

      const signal = matcher.compare(a, b);

      expect(signal?.autoMergeAllowed).toBe(false);
    });
  });
});
