/**
 * AC-M02-08: Licence expiry scanner alerts once per threshold (60/30/7 days) per licence
 * and never twice for the same threshold.
 * AC-M02-09: SellerDirectory eligibility filtering
 */
describe('AC-M02-08, AC-M02-09 Licence domain', () => {
  describe('daysUntil', () => {
    it('calculates days until expiry', () => {
      const today = new Date('2026-01-01T00:00:00Z');
      const expiryDate = new Date('2026-01-31T00:00:00Z');

      const days = daysUntil(expiryDate.toISOString(), today);

      expect(days).toBe(30);
    });

    it('returns 0 for expiring today', () => {
      const today = new Date('2026-01-01T00:00:00Z');
      const expiryDate = new Date('2026-01-01T00:00:00Z');

      const days = daysUntil(expiryDate.toISOString(), today);

      expect(days).toBe(0);
    });

    it('returns negative for expired', () => {
      const today = new Date('2026-01-01T00:00:00Z');
      const expiryDate = new Date('2025-12-01T00:00:00Z');

      const days = daysUntil(expiryDate.toISOString(), today);

      expect(days).toBeLessThan(0);
    });
  });

  describe('dueThreshold', () => {
    const licence = {
      id: 'lic_001',
      memberId: 'mem_001',
      kind: 'POSP_LIFE' as const,
      number: 'LIC-123',
      validFrom: '2023-01-01',
      validTo: '2026-01-15',
      verifiedAt: '2023-01-01T00:00:00Z',
    };

    const today = new Date('2026-01-01T00:00:00Z');

    it('returns 60 when licence expires in 60-70 days and not yet alerted', () => {
      const sixtyDaysLater = new Date(today);
      sixtyDaysLater.setDate(sixtyDaysLater.getDate() + 65);
      const lic = { ...licence, validTo: sixtyDaysLater.toISOString().split('T')[0] };

      const threshold = dueThreshold(lic, today, []);

      expect(threshold).toBe(60);
    });

    it('returns 30 when licence expires in 30-60 days and not yet alerted', () => {
      const thirtyDaysLater = new Date(today);
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 45);
      const lic = { ...licence, validTo: thirtyDaysLater.toISOString().split('T')[0] };

      const threshold = dueThreshold(lic, today, []);

      expect(threshold).toBe(30);
    });

    it('returns 7 when licence expires in 7-30 days and not yet alerted', () => {
      const sevenDaysLater = new Date(today);
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 15);
      const lic = { ...licence, validTo: sevenDaysLater.toISOString().split('T')[0] };

      const threshold = dueThreshold(lic, today, []);

      expect(threshold).toBe(7);
    });

    it('returns undefined when already alerted at threshold', () => {
      const sixtyDaysLater = new Date(today);
      sixtyDaysLater.setDate(sixtyDaysLater.getDate() + 65);
      const lic = { ...licence, validTo: sixtyDaysLater.toISOString().split('T')[0] };

      const threshold = dueThreshold(lic, today, [60]);

      expect(threshold).toBeUndefined();
    });

    it('returns smaller threshold when skipped larger one', () => {
      const thirtyDaysLater = new Date(today);
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 45);
      const lic = { ...licence, validTo: thirtyDaysLater.toISOString().split('T')[0] };

      const threshold = dueThreshold(lic, today, [60]);

      expect(threshold).toBe(30);
    });

    it('returns undefined for expired licence', () => {
      const pastDate = new Date(today);
      pastDate.setDate(pastDate.getDate() - 5);
      const lic = { ...licence, validTo: pastDate.toISOString().split('T')[0] };

      const threshold = dueThreshold(lic, today, []);

      expect(threshold).toBeUndefined();
    });

    it('returns undefined when all thresholds already alerted', () => {
      const thirtyDaysLater = new Date(today);
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 45);
      const lic = { ...licence, validTo: thirtyDaysLater.toISOString().split('T')[0] };

      const threshold = dueThreshold(lic, today, [60, 30, 7]);

      expect(threshold).toBeUndefined();
    });
  });

  describe('Licence entity', () => {
    it('creates a licence with validFrom before validTo', () => {
      const lic = createLicence({
        memberId: 'mem_001',
        kind: 'POSP_LIFE',
        number: 'LIC-123',
        validFrom: '2023-01-01',
        validTo: '2026-01-01',
      });

      expect(lic.validFrom).toBe('2023-01-01');
      expect(lic.validTo).toBe('2026-01-01');
    });

    it('rejects licence with validFrom after validTo', () => {
      expect(() => {
        createLicence({
          memberId: 'mem_001',
          kind: 'POSP_LIFE',
          number: 'LIC-123',
          validFrom: '2026-01-01',
          validTo: '2023-01-01',
        });
      }).toThrow();
    });
  });

  describe('EXPIRY_THRESHOLDS_DAYS', () => {
    it('defines thresholds as [60, 30, 7]', () => {
      expect(EXPIRY_THRESHOLDS_DAYS).toEqual([60, 30, 7]);
    });
  });
});

// Helper stubs
function daysUntil(_dateIso: string, _today: Date): number {
  throw new Error('daysUntil not implemented');
}

function dueThreshold(__licence: Record<string, unknown>, _today: Date, _alreadyAlerted: number[]): 60 | 30 | 7 | undefined {
  throw new Error('dueThreshold not implemented');
}

function createLicence(_input: Record<string, unknown>): Record<string, unknown> {
  throw new Error('createLicence not implemented');
}

const EXPIRY_THRESHOLDS_DAYS = [60, 30, 7] as const;
