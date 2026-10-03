import { describe, it, expect } from '@jest/globals';
import { normaliseName, jaroWinkler } from './name-matching';

/**
 * AC-M03-06: normaliseName strips honorifics/punctuation/diacritics;
 * jaroWinkler matches reference values (MARTHA/MARHTA ≈ 0.961, DIXON/DICKSONX ≈ 0.813);
 * identical strings = 1.
 */
describe('AC-M03-06 Name matching', () => {
  describe('normaliseName', () => {
    it('converts to lowercase', () => {
      expect(normaliseName('JOHN DOE')).toContain('john');
      expect(normaliseName('JOHN DOE')).toContain('doe');
    });

    it('strips honorifics', () => {
      expect(normaliseName('Mr. John Doe')).not.toContain('mr');
      expect(normaliseName('Mrs. Jane Doe')).not.toContain('mrs');
      expect(normaliseName('Ms. Sarah Doe')).not.toContain('ms');
      expect(normaliseName('Dr. Sarah Doe')).not.toContain('dr');
      expect(normaliseName('Shri. Rajesh Kumar')).not.toContain('shri');
      expect(normaliseName('Smt. Priya Sharma')).not.toContain('smt');
      expect(normaliseName('Kumari. Neha')).not.toContain('kumari');
      expect(normaliseName('Sri. Vikram')).not.toContain('sri');
    });

    it('removes punctuation', () => {
      const normalized = normaliseName('John. Doe-Smith');
      expect(normalized).not.toContain('.');
      expect(normalized).not.toContain('-');
    });

    it('collapses multiple spaces', () => {
      const normalized = normaliseName('John    Doe');
      expect(normalized).not.toContain('    ');
      expect(normalized).toMatch(/john\s+doe/);
    });

    it('removes diacritics', () => {
      const normalized = normaliseName('José María');
      expect(normalized).toBe('jose maria');
    });

    it('combines all transformations', () => {
      const normalized = normaliseName('Dr. José María-Santos');
      expect(normalized).toBe('jose maria santos');
    });
  });

  describe('jaroWinkler', () => {
    it('returns 1 for identical strings', () => {
      expect(jaroWinkler('john', 'john')).toBe(1);
      expect(jaroWinkler('', '')).toBe(1);
    });

    it('returns 0 for completely different strings', () => {
      const score = jaroWinkler('abc', 'xyz');
      expect(score).toBeLessThan(0.1);
    });

    it('matches MARTHA and MARHTA with score ≈ 0.961', () => {
      const score = jaroWinkler('MARTHA', 'MARHTA');
      expect(score).toBeCloseTo(0.961, 2);
    });

    it('matches DIXON and DICKSONX with score ≈ 0.813', () => {
      const score = jaroWinkler('DIXON', 'DICKSONX');
      expect(score).toBeCloseTo(0.813, 2);
    });

    it('is case-insensitive', () => {
      const score1 = jaroWinkler('MARTHA', 'MARHTA');
      const score2 = jaroWinkler('martha', 'marhta');
      expect(score1).toBeCloseTo(score2, 3);
    });

    it('accounts for prefix scaling (max 4)', () => {
      // Common prefix increases score
      const score1 = jaroWinkler('john', 'john');
      const score2 = jaroWinkler('john', 'john2');
      expect(score1).toBeGreaterThan(score2);
    });

    it('is symmetric', () => {
      const score1 = jaroWinkler('john', 'joan');
      const score2 = jaroWinkler('joan', 'john');
      expect(score1).toBeCloseTo(score2, 3);
    });
  });

  describe('integration', () => {
    it('normalises then compares for dedup matching', () => {
      const score1 = jaroWinkler(
        normaliseName('John Doe'),
        normaliseName('Jon Doe')
      );
      expect(score1).toBeGreaterThan(0.85);

      const score2 = jaroWinkler(
        normaliseName('Dr. John Doe'),
        normaliseName('Mr. Jon Dough')
      );
      expect(score2).toBeGreaterThan(0.75);
    });
  });
});
