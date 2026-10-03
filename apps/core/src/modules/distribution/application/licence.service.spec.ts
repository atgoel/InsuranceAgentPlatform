import { FixedClock } from '../../../kernel/domain/clock';

/**
 * AC-M02-08: Licence expiry scanner alerts once per threshold (60/30/7 days) per licence
 * and never twice for the same threshold.
 */
describe('AC-M02-08 LicenceService and LicenceExpiryScanner', () => {
  let licenceService: LicenceService;
  let licenceRepo: Record<string, unknown>;
  let scanner: LicenceExpiryScanner;
  let logs: Record<string, unknown>;
  let clock: FixedClock;

  beforeEach(() => {
    clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    licenceRepo = createMockLicenceRepo();
    logs = { events: [] };

    licenceService = new LicenceService({
      licenceRepository: licenceRepo,
      logger: createMockLogger(logs),
      clock,
    });

    scanner = new LicenceExpiryScanner({
      licenceRepository: licenceRepo,
      logger: createMockLogger(logs),
      clock,
    });
  });

  describe('LicenceService.record', () => {
    it('records licence for member', async () => {
      const tx = mockTx();
      const licence = {
        memberId: 'mem_001',
        kind: 'POSP_LIFE',
        number: 'LIC-123',
        validFrom: '2023-01-01',
        validTo: '2026-12-31',
      };

      const recorded = await licenceService.record(tx, licence);

      expect(recorded.memberId).toBe('mem_001');
      expect(licenceRepo.saved).toHaveLength(1);
    });

    it('rejects licence with validFrom after validTo', async () => {
      const tx = mockTx();

      await expect(
        licenceService.record(tx, {
          memberId: 'mem_001',
          kind: 'POSP_LIFE',
          number: 'LIC-123',
          validFrom: '2026-12-31',
          validTo: '2023-01-01',
        })
      ).rejects.toThrow();
    });
  });

  describe('LicenceService.expiring', () => {
    it('returns licences expiring within specified days', async () => {
      const tx = mockTx();

      licenceRepo.addLicence({
        id: 'lic_001',
        memberId: 'mem_001',
        kind: 'POSP_LIFE',
        validTo: '2026-01-31',
      });

      const licences = await licenceService.expiring(tx, 60);

      expect(licences).toHaveLength(1);
    });
  });

  describe('LicenceExpiryScanner (AC-M02-08)', () => {
    it('alerts once per 60-day threshold per licence', async () => {
      const tx = mockTx();
      const tenantId = 'ten_acme';

      licenceRepo.addLicence({
        id: 'lic_001',
        memberId: 'mem_001',
        kind: 'POSP_LIFE',
        validTo: '2026-02-20', // 50 days away
      });

      await scanner.run(tx, tenantId, clock.now());

      const alerts = licenceRepo.alertedThresholds('lic_001');
      expect(alerts).toContain(60);
      expect(alerts.length).toBe(1);
    });

    it('alerts once per 30-day threshold', async () => {
      const tx = mockTx();
      const tenantId = 'ten_acme';

      licenceRepo.addLicence({
        id: 'lic_001',
        memberId: 'mem_001',
        kind: 'POSP_LIFE',
        validTo: '2026-01-25', // 24 days away
      });

      await scanner.run(tx, tenantId, clock.now());

      const alerts = licenceRepo.alertedThresholds('lic_001');
      expect(alerts).toContain(30);
    });

    it('alerts once per 7-day threshold', async () => {
      const tx = mockTx();
      const tenantId = 'ten_acme';

      licenceRepo.addLicence({
        id: 'lic_001',
        memberId: 'mem_001',
        kind: 'POSP_LIFE',
        validTo: '2026-01-07', // 6 days away
      });

      await scanner.run(tx, tenantId, clock.now());

      const alerts = licenceRepo.alertedThresholds('lic_001');
      expect(alerts).toContain(7);
    });

    it('never alerts twice for the same threshold (AC-M02-08)', async () => {
      const tx = mockTx();
      const tenantId = 'ten_acme';

      licenceRepo.addLicence({
        id: 'lic_001',
        memberId: 'mem_001',
        kind: 'POSP_LIFE',
        validTo: '2026-02-20',
      });

      // First run
      await scanner.run(tx, tenantId, clock.now());

      // Second run same day
      await scanner.run(tx, tenantId, clock.now());

      const alerts = licenceRepo.alertedThresholds('lic_001');
      expect(alerts.filter(a => a === 60)).toHaveLength(1);
    });

    it('emits distribution.licence.expiring event once per threshold', async () => {
      const tx = mockTx();
      const tenantId = 'ten_acme';

      licenceRepo.addLicence({
        id: 'lic_001',
        memberId: 'mem_001',
        kind: 'POSP_LIFE',
        validTo: '2026-02-20', // 50 days: triggers 60-day threshold
      });

      await scanner.run(tx, tenantId, clock.now());

      const events = tx.outbox.events;
      const expiringEvents = events.filter(e => e.type === 'distribution.licence.expiring');
      expect(expiringEvents).toHaveLength(1);
      expect(expiringEvents[0].data.licenceId).toBe('lic_001');
      expect(expiringEvents[0].data.threshold).toBe(60);
    });

    it('includes member name and days left in event', async () => {
      const tx = mockTx();
      const tenantId = 'ten_acme';

      licenceRepo.addMember('mem_001', 'John Doe');
      licenceRepo.addLicence({
        id: 'lic_001',
        memberId: 'mem_001',
        kind: 'POSP_LIFE',
        validTo: '2026-02-20',
      });

      await scanner.run(tx, tenantId, clock.now());

      const events = tx.outbox.events;
      const event = events[0];
      expect(event?.data.daysLeft).toBe(50);
      expect(event?.data.kind).toBe('POSP_LIFE');
    });

    it('handles multiple licences per member', async () => {
      const tx = mockTx();
      const tenantId = 'ten_acme';

      licenceRepo.addLicence({
        id: 'lic_001',
        memberId: 'mem_001',
        kind: 'POSP_LIFE',
        validTo: '2026-02-20',
      });

      licenceRepo.addLicence({
        id: 'lic_002',
        memberId: 'mem_001',
        kind: 'POSP_GENERAL',
        validTo: '2026-01-25',
      });

      await scanner.run(tx, tenantId, clock.now());

      const events = tx.outbox.events;
      expect(events.length).toBeGreaterThanOrEqual(2);
    });

    it('skips already-expired licences', async () => {
      const tx = mockTx();
      const tenantId = 'ten_acme';

      licenceRepo.addLicence({
        id: 'lic_001',
        memberId: 'mem_001',
        kind: 'POSP_LIFE',
        validTo: '2025-12-01', // Expired
      });

      await scanner.run(tx, tenantId, clock.now());

      const events = tx.outbox.events;
      const expiringEvents = events.filter(e => e.type === 'distribution.licence.expiring');
      expect(expiringEvents).toHaveLength(0);
    });
  });
});

// Helper stubs
class LicenceService {
  constructor(_deps: Record<string, unknown>) {}
  record(__tx: Record<string, unknown>, __licence: Record<string, unknown>): Promise<Record<string, unknown>> {
    throw new Error('not implemented');
  }
  expiring(__tx: Record<string, unknown>, __withinDays: number): Promise<Record<string, unknown>[]> {
    throw new Error('not implemented');
  }
}

class LicenceExpiryScanner {
  constructor(_deps: Record<string, unknown>) {}
  run(__tx: Record<string, unknown>, __tenantId: string, _today: Date): Promise<void> {
    throw new Error('not implemented');
  }
}

function createMockLicenceRepo() {
  const licences = new Map();
  const alerts = new Map();
  const members = new Map();

  return {
    saved: [],
    licences,
    alerts,
    members,
    addLicence(licence: Record<string, unknown>) {
      licences.set(licence.id, licence);
    },
    addMember(memberId: string, displayName: string) {
      members.set(memberId, { displayName });
    },
    save(_tx: Record<string, unknown>, _licence: Record<string, unknown>) {
      this.saved.push(licence);
      licences.set(licence.id, licence);
    },
    listForMember(_tx: Record<string, unknown>, _memberId: string) {
      return Promise.resolve([]);
    },
    expiringWithin(_tx: Record<string, unknown>, _days: number, today: Date) {
      return Promise.resolve(Array.from(licences.values()).filter(l => {
        const expiryDate = new Date(l.validTo);
        const daysUntil = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return daysUntil >= 0 && daysUntil <= days;
      }));
    },
    alertedThresholds(licenceId: string) {
      return alerts.get(licenceId) || [];
    },
    recordAlert(_tx: Record<string, unknown>, _licenceId: string, threshold: number) {
      if (!alerts.has(licenceId)) {
        alerts.set(licenceId, []);
      }
      alerts.get(licenceId).push(threshold);
    },
  };
}

function createMockLogger(_logs: Record<string, unknown>) {
  return {
    info: (event: string, msg: string, _ctx?: Record<string, unknown>) => {
      logs.events.push({ event, msg });
    },
  };
}

function mockTx() {
  return {
    outbox: { events: [] },
    audit: { log: () => {} },
  };
}
