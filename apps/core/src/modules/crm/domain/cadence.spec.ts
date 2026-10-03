import { describe, it, expect } from '@jest/globals';
import { DefaultCadencePolicy } from './cadence';
import type { LeadProps } from './lead';

/**
 * AC-M04-08: Cadence rules:
 * - First call task due at slaDueAt (or now+2h if no SLA due)
 * - NO_ANSWER/CALL_BACK attempt 1 -> +4h
 * - attempt 2 -> next day 10:00 IST = 04:30Z
 * - ≥3 -> none
 * - CONNECTED/WRONG_NUMBER/NOT_INTERESTED -> none
 */
describe('AC-M04-08 Cadence policies', () => {
  const now = new Date('2026-10-03T10:00:00Z');
  const policy = new DefaultCadencePolicy();

  describe('onLeadAssigned', () => {
    it('creates first call task at slaDueAt when provided', () => {
      const lead: LeadProps = {
      customFields: {},
        id: 'lead_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        stage: 'NEW',
        temperature: 'WARM',
        attribution: {
          source: 'WEB_FORM',
          firstTouch: { channel: 'WEB', at: now.toISOString() },
          lastTouch: { channel: 'WEB', at: now.toISOString() },
        },
        qualification: {},
        stageHistory: [{ to: 'NEW', at: now.toISOString(), by: 'user_1' }],
        syncState: 'local',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        version: 1,
        slaDueAt: new Date('2026-10-03T11:30:00Z').toISOString(),
        ownerMemberId: 'member_1',
      };

      const tasks = policy.onLeadAssigned(lead, now);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].kind).toBe('CALL');
      expect(tasks[0].dueAt).toBe(new Date('2026-10-03T11:30:00Z').toISOString());
      expect(tasks[0].source).toBe('CADENCE');
    });

    it('creates first call task at now+2h when no slaDueAt', () => {
      const lead: LeadProps = {
      customFields: {},
        id: 'lead_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        stage: 'NEW',
        temperature: 'WARM',
        attribution: {
          source: 'WEB_FORM',
          firstTouch: { channel: 'WEB', at: now.toISOString() },
          lastTouch: { channel: 'WEB', at: now.toISOString() },
        },
        qualification: {},
        stageHistory: [{ to: 'NEW', at: now.toISOString(), by: 'user_1' }],
        syncState: 'local',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        version: 1,
        ownerMemberId: 'member_1',
      };

      const tasks = policy.onLeadAssigned(lead, now);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].dueAt).toBe(new Date('2026-10-03T12:00:00Z').toISOString());
    });
  });

  describe('onCallOutcome - NO_ANSWER', () => {
    const lead: LeadProps = {
      customFields: {},
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      stage: 'NEW',
      temperature: 'WARM',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      qualification: {},
      stageHistory: [{ to: 'NEW', at: now.toISOString(), by: 'user_1' }],
      syncState: 'local',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      version: 1,
      ownerMemberId: 'member_1',
    };

    it('attempt 1 NO_ANSWER creates retry at +4h', () => {
      const tasks = policy.onCallOutcome(lead, 'NO_ANSWER', now, 1);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].dueAt).toBe(new Date('2026-10-03T14:00:00Z').toISOString());
    });

    it('attempt 2 NO_ANSWER creates retry at next day 10:00 IST (04:30Z)', () => {
      const tasks = policy.onCallOutcome(lead, 'NO_ANSWER', now, 2);

      expect(tasks).toHaveLength(1);
      // Next day 10:00 IST = 2026-10-04T04:30:00Z
      expect(tasks[0].dueAt).toBe(new Date('2026-10-04T04:30:00Z').toISOString());
    });

    it('attempt 3 NO_ANSWER creates no task', () => {
      const tasks = policy.onCallOutcome(lead, 'NO_ANSWER', now, 3);
      expect(tasks).toHaveLength(0);
    });

    it('attempt 4+ NO_ANSWER creates no task', () => {
      const tasks = policy.onCallOutcome(lead, 'NO_ANSWER', now, 5);
      expect(tasks).toHaveLength(0);
    });
  });

  describe('onCallOutcome - CALL_BACK', () => {
    const lead: LeadProps = {
      customFields: {},
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      stage: 'NEW',
      temperature: 'WARM',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      qualification: {},
      stageHistory: [{ to: 'NEW', at: now.toISOString(), by: 'user_1' }],
      syncState: 'local',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      version: 1,
      ownerMemberId: 'member_1',
    };

    it('attempt 1 CALL_BACK creates retry at +4h', () => {
      const tasks = policy.onCallOutcome(lead, 'CALL_BACK', now, 1);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].dueAt).toBe(new Date('2026-10-03T14:00:00Z').toISOString());
    });

    it('attempt 2 CALL_BACK creates retry at next day 10:00 IST', () => {
      const tasks = policy.onCallOutcome(lead, 'CALL_BACK', now, 2);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].dueAt).toBe(new Date('2026-10-04T04:30:00Z').toISOString());
    });

    it('attempt 3+ CALL_BACK creates no task', () => {
      const tasks = policy.onCallOutcome(lead, 'CALL_BACK', now, 3);
      expect(tasks).toHaveLength(0);
    });
  });

  describe('onCallOutcome - other outcomes', () => {
    const lead: LeadProps = {
      customFields: {},
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      stage: 'NEW',
      temperature: 'WARM',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      qualification: {},
      stageHistory: [{ to: 'NEW', at: now.toISOString(), by: 'user_1' }],
      syncState: 'local',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      version: 1,
      ownerMemberId: 'member_1',
    };

    it('CONNECTED outcome creates no task', () => {
      const tasks = policy.onCallOutcome(lead, 'CONNECTED', now, 1);
      expect(tasks).toHaveLength(0);
    });

    it('WRONG_NUMBER outcome creates no task', () => {
      const tasks = policy.onCallOutcome(lead, 'WRONG_NUMBER', now, 1);
      expect(tasks).toHaveLength(0);
    });

    it('NOT_INTERESTED outcome creates no task', () => {
      const tasks = policy.onCallOutcome(lead, 'NOT_INTERESTED', now, 1);
      expect(tasks).toHaveLength(0);
    });
  });

  describe('timezone handling', () => {
    it('calculates next day 10:00 IST correctly from evening UTC', () => {
      const eveningUtc = new Date('2026-10-03T18:00:00Z'); // 11:30 PM IST
      const lead: LeadProps = {
      customFields: {},
        id: 'lead_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        stage: 'NEW',
        temperature: 'WARM',
        attribution: {
          source: 'WEB_FORM',
          firstTouch: { channel: 'WEB', at: eveningUtc.toISOString() },
          lastTouch: { channel: 'WEB', at: eveningUtc.toISOString() },
        },
        qualification: {},
        stageHistory: [{ to: 'NEW', at: eveningUtc.toISOString(), by: 'user_1' }],
        syncState: 'local',
        createdAt: eveningUtc.toISOString(),
        updatedAt: eveningUtc.toISOString(),
        version: 1,
        ownerMemberId: 'member_1',
      };

      const tasks = policy.onCallOutcome(lead, 'NO_ANSWER', eveningUtc, 2);

      expect(tasks).toHaveLength(1);
      // Next day 10:00 IST = 2026-10-04T04:30:00Z
      expect(tasks[0].dueAt).toBe(new Date('2026-10-04T04:30:00Z').toISOString());
    });

    it('calculates next day 10:00 IST correctly from early morning UTC', () => {
      const earlyUtc = new Date('2026-10-03T02:00:00Z'); // 7:30 AM IST
      const lead: LeadProps = {
      customFields: {},
        id: 'lead_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        stage: 'NEW',
        temperature: 'WARM',
        attribution: {
          source: 'WEB_FORM',
          firstTouch: { channel: 'WEB', at: earlyUtc.toISOString() },
          lastTouch: { channel: 'WEB', at: earlyUtc.toISOString() },
        },
        qualification: {},
        stageHistory: [{ to: 'NEW', at: earlyUtc.toISOString(), by: 'user_1' }],
        syncState: 'local',
        createdAt: earlyUtc.toISOString(),
        updatedAt: earlyUtc.toISOString(),
        version: 1,
        ownerMemberId: 'member_1',
      };

      const tasks = policy.onCallOutcome(lead, 'CALL_BACK', earlyUtc, 2);

      expect(tasks).toHaveLength(1);
      // Next day 10:00 IST = 2026-10-04T04:30:00Z
      expect(tasks[0].dueAt).toBe(new Date('2026-10-04T04:30:00Z').toISOString());
    });
  });
});

describe('AC-M04-08 cadence task titles', () => {
  it('names tasks by purpose and never embeds internal ids', () => {
    const policy = new DefaultCadencePolicy();
    const at = new Date('2026-10-03T10:00:00Z');
    const lead = { id: 'lead_1', partyId: 'pty_secret', ownerMemberId: 'mem_1', slaDueAt: '2026-10-03T10:30:00.000Z' } as never;
    const titles = [...policy.onLeadAssigned(lead, at), ...policy.onCallOutcome(lead, 'NO_ANSWER', at, 1), ...policy.onCallOutcome(lead, 'NO_ANSWER', at, 2)].map((d) => d.title);
    expect(titles).toEqual(['First call to new lead', 'Retry call (attempt 2)', 'Retry call (attempt 3)']);
  });
});
