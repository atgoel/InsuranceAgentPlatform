import { describe, it, expect } from '@jest/globals';
import { ConsentRecord, ConsentLedger } from './consent';

/**
 * AC-M03-03: Consent ledger is append-only and stateFor returns the latest record
 * per purpose+channel with ANY fallback and correct override by time; summary lists
 * the latest per pair.
 */
describe('AC-M03-03 ConsentLedger', () => {
  const now = new Date('2026-10-03T00:00:00Z');
  const later = new Date('2026-10-03T01:00:00Z');

  describe('constructor', () => {
    it('sorts records by occurredAt then id', () => {
      const r2: ConsentRecord = {
        id: 'consent_2',
        partyId: 'party_1',
        purpose: 'SERVICE',
        channel: 'SMS',
        granted: true,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: now.toISOString(),
      };

      const r1: ConsentRecord = {
        id: 'consent_1',
        partyId: 'party_1',
        purpose: 'SERVICE',
        channel: 'SMS',
        granted: true,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: new Date(now.getTime() - 1000).toISOString(),
      };

      const r3: ConsentRecord = {
        id: 'consent_3',
        partyId: 'party_1',
        purpose: 'MARKETING',
        channel: 'EMAIL',
        granted: false,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: later.toISOString(),
      };

      // Pass in random order
      const ledger = new ConsentLedger([r2, r3, r1]);

      const history = ledger.history();
      expect(history[0].id).toBe('consent_1');
      expect(history[1].id).toBe('consent_2');
      expect(history[2].id).toBe('consent_3');
    });
  });

  describe('append', () => {
    it('returns a new ledger with the record appended', () => {
      const r1: ConsentRecord = {
        id: 'consent_1',
        partyId: 'party_1',
        purpose: 'SERVICE',
        channel: 'SMS',
        granted: true,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: now.toISOString(),
      };

      const ledger1 = new ConsentLedger([]);
      const ledger2 = ledger1.append(r1);

      expect(ledger1.history()).toHaveLength(0);
      expect(ledger2.history()).toHaveLength(1);
      expect(ledger2.history()[0].id).toBe('consent_1');
    });

    it('is append-only (original ledger unchanged)', () => {
      const r1: ConsentRecord = {
        id: 'consent_1',
        partyId: 'party_1',
        purpose: 'SERVICE',
        channel: 'SMS',
        granted: true,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: now.toISOString(),
      };

      const ledger1 = new ConsentLedger([]);
      const ledger2 = ledger1.append(r1);

      expect(ledger1.history()).toHaveLength(0);
      expect(ledger2.history()).toHaveLength(1);
      // ledger1 is unchanged
      expect(ledger1).not.toBe(ledger2);
    });
  });

  describe('stateFor', () => {
    it('returns the latest record for purpose+channel', () => {
      const r1: ConsentRecord = {
        id: 'consent_1',
        partyId: 'party_1',
        purpose: 'MARKETING',
        channel: 'SMS',
        granted: true,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: now.toISOString(),
      };

      const r2: ConsentRecord = {
        id: 'consent_2',
        partyId: 'party_1',
        purpose: 'MARKETING',
        channel: 'SMS',
        granted: false,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: later.toISOString(),
      };

      const ledger = new ConsentLedger([r1, r2]);

      const state = ledger.stateFor('MARKETING', 'SMS');
      expect(state.granted).toBe(false);
      expect(state.record?.id).toBe('consent_2');
    });

    it('returns undefined when no record exists', () => {
      const ledger = new ConsentLedger([]);

      const state = ledger.stateFor('MARKETING', 'SMS');
      expect(state.granted).toBe(false);
      expect(state.record).toBeUndefined();
    });

    it('falls back to ANY channel when no specific channel record exists', () => {
      const r1: ConsentRecord = {
        id: 'consent_1',
        partyId: 'party_1',
        purpose: 'MARKETING',
        channel: 'ANY',
        granted: true,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: now.toISOString(),
      };

      const ledger = new ConsentLedger([r1]);

      const state = ledger.stateFor('MARKETING', 'SMS');
      expect(state.granted).toBe(true);
      expect(state.record?.id).toBe('consent_1');
    });

    it('prefers specific channel over ANY when both exist', () => {
      const rAny: ConsentRecord = {
        id: 'consent_any',
        partyId: 'party_1',
        purpose: 'MARKETING',
        channel: 'ANY',
        granted: true,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: now.toISOString(),
      };

      const rSms: ConsentRecord = {
        id: 'consent_sms',
        partyId: 'party_1',
        purpose: 'MARKETING',
        channel: 'SMS',
        granted: false,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: later.toISOString(),
      };

      const ledger = new ConsentLedger([rAny, rSms]);

      const state = ledger.stateFor('MARKETING', 'SMS');
      expect(state.granted).toBe(false);
      expect(state.record?.id).toBe('consent_sms');
    });

    it('allows channel-specific withdrawal to override earlier ANY grant', () => {
      const rAny: ConsentRecord = {
        id: 'consent_any',
        partyId: 'party_1',
        purpose: 'MARKETING',
        channel: 'ANY',
        granted: true,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: now.toISOString(),
      };

      const rSms: ConsentRecord = {
        id: 'consent_sms',
        partyId: 'party_1',
        purpose: 'MARKETING',
        channel: 'SMS',
        granted: false,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: later.toISOString(),
      };

      const ledger = new ConsentLedger([rAny, rSms]);

      const state = ledger.stateFor('MARKETING', 'SMS');
      expect(state.granted).toBe(false);
      expect(state.record?.channel).toBe('SMS');
    });

    it('allows ANY withdrawal to override earlier specific grant', () => {
      const rSms: ConsentRecord = {
        id: 'consent_sms',
        partyId: 'party_1',
        purpose: 'MARKETING',
        channel: 'SMS',
        granted: true,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: now.toISOString(),
      };

      const rAny: ConsentRecord = {
        id: 'consent_any',
        partyId: 'party_1',
        purpose: 'MARKETING',
        channel: 'ANY',
        granted: false,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: later.toISOString(),
      };

      const ledger = new ConsentLedger([rSms, rAny]);

      const state = ledger.stateFor('MARKETING', 'SMS');
      expect(state.granted).toBe(false);
      expect(state.record?.channel).toBe('ANY');
    });
  });

  describe('summary', () => {
    it('returns the latest record per purpose+channel pair', () => {
      const r1: ConsentRecord = {
        id: 'consent_1',
        partyId: 'party_1',
        purpose: 'MARKETING',
        channel: 'SMS',
        granted: true,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: now.toISOString(),
      };

      const r2: ConsentRecord = {
        id: 'consent_2',
        partyId: 'party_1',
        purpose: 'MARKETING',
        channel: 'SMS',
        granted: false,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: later.toISOString(),
      };

      const r3: ConsentRecord = {
        id: 'consent_3',
        partyId: 'party_1',
        purpose: 'SERVICE',
        channel: 'EMAIL',
        granted: true,
        noticeVersion: '2.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: now.toISOString(),
      };

      const ledger = new ConsentLedger([r1, r2, r3]);

      const summary = ledger.summary();
      expect(summary).toHaveLength(2);
      expect(summary.find((s) => s.purpose === 'MARKETING' && s.channel === 'SMS')).toEqual(
        expect.objectContaining({
          purpose: 'MARKETING',
          channel: 'SMS',
          granted: false,
        })
      );
      expect(summary.find((s) => s.purpose === 'SERVICE' && s.channel === 'EMAIL')).toEqual(
        expect.objectContaining({
          purpose: 'SERVICE',
          channel: 'EMAIL',
          granted: true,
        })
      );
    });

    it('returns empty summary for empty ledger', () => {
      const ledger = new ConsentLedger([]);

      const summary = ledger.summary();
      expect(summary).toEqual([]);
    });
  });

  describe('history', () => {
    it('returns all records in chronological order', () => {
      const r1: ConsentRecord = {
        id: 'consent_1',
        partyId: 'party_1',
        purpose: 'SERVICE',
        channel: 'SMS',
        granted: true,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: now.toISOString(),
      };

      const r2: ConsentRecord = {
        id: 'consent_2',
        partyId: 'party_1',
        purpose: 'MARKETING',
        channel: 'EMAIL',
        granted: false,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: later.toISOString(),
      };

      const ledger = new ConsentLedger([r2, r1]);

      const history = ledger.history();
      expect(history).toHaveLength(2);
      expect(history[0].id).toBe('consent_1');
      expect(history[1].id).toBe('consent_2');
    });

    it('returns readonly array', () => {
      const ledger = new ConsentLedger([]);

      const history = ledger.history();
      expect(() => {
        (history as any).push({ id: 'test' });
      }).toThrow();
    });
  });
});
