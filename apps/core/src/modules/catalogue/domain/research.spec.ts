import { describe, it, expect } from '@jest/globals';
import { isStale, type ResearchSummary, type ProductVersionProps } from './research';

/**
 * AC-M05-06: Research items include source and date, flag stale summaries when
 * the wording version changed or the review is older than 365 days.
 */
describe('AC-M05-06 ResearchSummary staleness', () => {
  const today = new Date('2026-10-03');

  describe('isStale with wording_changed reason', () => {
    it('returns stale: true with reason wording_changed when reviewedWordingVersion differs from version.wordingVersion', () => {
      const summary: ResearchSummary = {
        versionId: 'pv_1',
        summary: 'Test summary',
        points: ['Point 1', 'Point 2'],
        sourceRef: 'IRDA-2026',
        sourceDate: '2026-10-01',
        reviewedWordingVersion: 'v1.0',
        reviewedAt: new Date('2026-10-03T10:00:00Z').toISOString(),
      };

      const version: ProductVersionProps = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123',
        wordingVersion: 'v1.1',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const result = isStale(summary, version, today);

      expect(result.stale).toBe(true);
      expect(result.reason).toBe('wording_changed');
    });

    it('returns stale: false when reviewedWordingVersion matches version.wordingVersion', () => {
      const summary: ResearchSummary = {
        versionId: 'pv_1',
        summary: 'Test summary',
        points: ['Point 1'],
        sourceRef: 'IRDA-2026',
        sourceDate: '2026-10-01',
        reviewedWordingVersion: 'v1.0',
        reviewedAt: new Date('2026-10-03T10:00:00Z').toISOString(),
      };

      const version: ProductVersionProps = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const result = isStale(summary, version, today);

      expect(result.stale).toBe(false);
      expect(result.reason).toBeUndefined();
    });
  });

  describe('isStale with older_than_365_days reason', () => {
    it('returns stale: true with reason older_than_365_days when review is exactly 366 days old', () => {
      const reviewDate = new Date('2025-10-02'); // 366 days before 2026-10-03

      const summary: ResearchSummary = {
        versionId: 'pv_1',
        summary: 'Test summary',
        points: ['Point 1'],
        sourceRef: 'IRDA-2025',
        sourceDate: '2025-10-02',
        reviewedWordingVersion: 'v1.0',
        reviewedAt: new Date(reviewDate.getTime() + 10 * 60 * 60 * 1000).toISOString(), // 2025-10-02 10:00 UTC
      };

      const version: ProductVersionProps = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2025-10-02',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const result = isStale(summary, version, today);

      expect(result.stale).toBe(true);
      expect(result.reason).toBe('older_than_365_days');
    });

    it('returns stale: false when review is exactly 365 days old', () => {
      const reviewDate = new Date('2025-10-03'); // 365 days before 2026-10-03

      const summary: ResearchSummary = {
        versionId: 'pv_1',
        summary: 'Test summary',
        points: ['Point 1'],
        sourceRef: 'IRDA-2025',
        sourceDate: '2025-10-03',
        reviewedWordingVersion: 'v1.0',
        reviewedAt: new Date(reviewDate.getTime() + 10 * 60 * 60 * 1000).toISOString(),
      };

      const version: ProductVersionProps = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2025-10-03',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const result = isStale(summary, version, today);

      expect(result.stale).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    it('returns stale: false when review is recent (within 365 days)', () => {
      const reviewDate = new Date('2026-09-03'); // 30 days before 2026-10-03

      const summary: ResearchSummary = {
        versionId: 'pv_1',
        summary: 'Test summary',
        points: ['Point 1'],
        sourceRef: 'IRDA-2026',
        sourceDate: '2026-09-03',
        reviewedWordingVersion: 'v1.0',
        reviewedAt: new Date(reviewDate.getTime() + 10 * 60 * 60 * 1000).toISOString(),
      };

      const version: ProductVersionProps = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-09-03',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const result = isStale(summary, version, today);

      expect(result.stale).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    it('returns stale: true when review is older than 1 year', () => {
      const reviewDate = new Date('2024-10-03'); // 2 years before 2026-10-03

      const summary: ResearchSummary = {
        versionId: 'pv_1',
        summary: 'Test summary',
        points: ['Point 1'],
        sourceRef: 'IRDA-2024',
        sourceDate: '2024-10-03',
        reviewedWordingVersion: 'v1.0',
        reviewedAt: new Date(reviewDate.getTime() + 10 * 60 * 60 * 1000).toISOString(),
      };

      const version: ProductVersionProps = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2024-10-03',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const result = isStale(summary, version, today);

      expect(result.stale).toBe(true);
      expect(result.reason).toBe('older_than_365_days');
    });
  });

  describe('isStale fresh when all checks pass', () => {
    it('returns stale: false with no reason when wording matches and review is recent', () => {
      const summary: ResearchSummary = {
        versionId: 'pv_1',
        summary: 'Test summary',
        points: ['Point 1', 'Point 2', 'Point 3'],
        sourceRef: 'IRDA-2026',
        sourceDate: '2026-10-02',
        reviewedWordingVersion: 'v1.2',
        reviewedAt: new Date('2026-10-02T15:30:00Z').toISOString(),
      };

      const version: ProductVersionProps = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123',
        wordingVersion: 'v1.2',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-02',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const result = isStale(summary, version, today);

      expect(result.stale).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    it('returns stale: false on same day of review', () => {
      const summary: ResearchSummary = {
        versionId: 'pv_1',
        summary: 'Test summary',
        points: ['Point 1'],
        sourceRef: 'IRDA-2026',
        sourceDate: '2026-10-03',
        reviewedWordingVersion: 'v1.0',
        reviewedAt: new Date('2026-10-03T10:00:00Z').toISOString(),
      };

      const version: ProductVersionProps = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-03',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const result = isStale(summary, version, today);

      expect(result.stale).toBe(false);
      expect(result.reason).toBeUndefined();
    });
  });

  describe('isStale with multiple stale indicators', () => {
    it('reports wording_changed when both wording changed and review is old', () => {
      const reviewDate = new Date('2025-10-02'); // 366 days old

      const summary: ResearchSummary = {
        versionId: 'pv_1',
        summary: 'Test summary',
        points: ['Point 1'],
        sourceRef: 'IRDA-2025',
        sourceDate: '2025-10-02',
        reviewedWordingVersion: 'v1.0',
        reviewedAt: new Date(reviewDate.getTime() + 10 * 60 * 60 * 1000).toISOString(),
      };

      const version: ProductVersionProps = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123',
        wordingVersion: 'v1.1',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2025-10-02',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const result = isStale(summary, version, today);

      expect(result.stale).toBe(true);
      expect(result.reason).toBe('wording_changed');
    });
  });
});
