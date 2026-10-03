import { describe, it, expect } from '@jest/globals';
import {
  ContactabilityPolicy,
  PartyActiveRule,
  ContactPointRule,
  SuppressionRule,
  ConsentRule,
  ContactabilityQuery,
} from './contactability';
import { Party } from './party';
import { ContactPoint } from './contact-point';
import { ConsentLedger, ConsentRecord } from './consent';
import { Suppression } from './suppression';

/**
 * AC-M03-04: Contactability: inactive party, missing contact point, active suppression
 * on the contact hash, missing or withdrawn consent each deny with their reason
 * (in that precedence); SERVICE is allowed without explicit grant unless withdrawn;
 * marketing requires a grant.
 */
describe('AC-M03-04 ContactabilityPolicy', () => {
  const now = new Date('2026-10-03T00:00:00Z');

  const mobileCP: ContactPoint = {
    channel: 'MOBILE',
    valueEnc: 'enc',
    valueHash: 'hash_mobile_1',
    masked: '+91-XXXXXX1234',
    isPrimary: true,
  };

  const activeParty = Party.create({
    id: 'party_1',
    kind: 'PERSON',
    displayName: 'John Doe',
    contactPoints: [mobileCP],
    source: { kind: 'MANUAL' },
    now,
  });

  describe('PartyActiveRule', () => {
    it('allows contact if party is ACTIVE', () => {
      const rule = new PartyActiveRule();
      const query: ContactabilityQuery = {
        party: activeParty,
        ledger: new ConsentLedger([]),
        suppressions: [],
        channel: 'SMS',
        purpose: 'MARKETING',
        at: now,
      };

      const decision = rule.evaluate(query);

      expect(decision).toBeUndefined(); // Passes to next rule
    });

    it('denies contact if party is MERGED', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });
      party.markMerged('party_2', now);

      const rule = new PartyActiveRule();
      const query: ContactabilityQuery = {
        party,
        ledger: new ConsentLedger([]),
        suppressions: [],
        channel: 'SMS',
        purpose: 'MARKETING',
        at: now,
      };

      const decision = rule.evaluate(query);

      expect(decision?.allowed).toBe(false);
      expect(decision?.reason).toBe('party_inactive');
    });

    it('denies contact if party is ERASED', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });
      party.erase(now);

      const rule = new PartyActiveRule();
      const query: ContactabilityQuery = {
        party,
        ledger: new ConsentLedger([]),
        suppressions: [],
        channel: 'SMS',
        purpose: 'MARKETING',
        at: now,
      };

      const decision = rule.evaluate(query);

      expect(decision?.allowed).toBe(false);
      expect(decision?.reason).toBe('party_inactive');
    });
  });

  describe('ContactPointRule', () => {
    it('allows SMS if party has MOBILE contact point', () => {
      const rule = new ContactPointRule();
      const query: ContactabilityQuery = {
        party: activeParty,
        ledger: new ConsentLedger([]),
        suppressions: [],
        channel: 'SMS',
        purpose: 'MARKETING',
        at: now,
      };

      const decision = rule.evaluate(query);

      expect(decision).toBeUndefined(); // Passes to next rule
    });

    it('denies SMS if party has no MOBILE contact point', () => {
      const emailCP: ContactPoint = {
        channel: 'EMAIL',
        valueEnc: 'enc',
        valueHash: 'hash_email_1',
        masked: 'u***@example.com',
        isPrimary: true,
      };
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [emailCP],
        source: { kind: 'MANUAL' },
        now,
      });

      const rule = new ContactPointRule();
      const query: ContactabilityQuery = {
        party,
        ledger: new ConsentLedger([]),
        suppressions: [],
        channel: 'SMS',
        purpose: 'MARKETING',
        at: now,
      };

      const decision = rule.evaluate(query);

      expect(decision?.allowed).toBe(false);
      expect(decision?.reason).toBe('no_contact_point');
    });

    it('denies EMAIL if party has no EMAIL contact point', () => {
      const rule = new ContactPointRule();
      const query: ContactabilityQuery = {
        party: activeParty,
        ledger: new ConsentLedger([]),
        suppressions: [],
        channel: 'EMAIL',
        purpose: 'MARKETING',
        at: now,
      };

      const decision = rule.evaluate(query);

      expect(decision?.allowed).toBe(false);
      expect(decision?.reason).toBe('no_contact_point');
    });
  });

  describe('SuppressionRule', () => {
    it('allows contact when no suppression exists', () => {
      const rule = new SuppressionRule();
      const query: ContactabilityQuery = {
        party: activeParty,
        ledger: new ConsentLedger([]),
        suppressions: [],
        channel: 'SMS',
        purpose: 'MARKETING',
        at: now,
      };

      const decision = rule.evaluate(query);

      expect(decision).toBeUndefined(); // Passes to next rule
    });

    it('denies contact when active suppression exists on contact hash', () => {
      const suppression: Suppression = {
        id: 'supp_1',
        contactHash: 'hash_mobile_1',
        channel: 'SMS',
        reason: 'OPT_OUT',
        from: now.toISOString(),
        createdBy: 'system',
      };

      const rule = new SuppressionRule();
      const query: ContactabilityQuery = {
        party: activeParty,
        ledger: new ConsentLedger([]),
        suppressions: [suppression],
        channel: 'SMS',
        purpose: 'MARKETING',
        at: now,
      };

      const decision = rule.evaluate(query);

      expect(decision?.allowed).toBe(false);
      expect(decision?.reason).toBe('suppressed');
      expect(decision?.detail?.suppressionReason).toBe('OPT_OUT');
    });

    it('allows contact when suppression has ended', () => {
      const suppression: Suppression = {
        id: 'supp_1',
        contactHash: 'hash_mobile_1',
        channel: 'SMS',
        reason: 'OPT_OUT',
        from: new Date(now.getTime() - 10000).toISOString(),
        to: new Date(now.getTime() - 1000).toISOString(),
        createdBy: 'system',
      };

      const rule = new SuppressionRule();
      const query: ContactabilityQuery = {
        party: activeParty,
        ledger: new ConsentLedger([]),
        suppressions: [suppression],
        channel: 'SMS',
        purpose: 'MARKETING',
        at: now,
      };

      const decision = rule.evaluate(query);

      expect(decision).toBeUndefined(); // Passes to next rule
    });
  });

  describe('ConsentRule', () => {
    it('allows SERVICE without explicit grant unless withdrawn', () => {
      const rule = new ConsentRule();
      const query: ContactabilityQuery = {
        party: activeParty,
        ledger: new ConsentLedger([]),
        suppressions: [],
        channel: 'SMS',
        purpose: 'SERVICE',
        at: now,
      };

      const decision = rule.evaluate(query);

      expect(decision?.allowed).toBe(true);
      expect(decision?.reason).toBe('ok');
    });

    it('denies SERVICE when latest record is withdrawal', () => {
      const record: ConsentRecord = {
        id: 'consent_1',
        partyId: 'party_1',
        purpose: 'SERVICE',
        channel: 'SMS',
        granted: false,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: now.toISOString(),
      };

      const rule = new ConsentRule();
      const query: ContactabilityQuery = {
        party: activeParty,
        ledger: new ConsentLedger([record]),
        suppressions: [],
        channel: 'SMS',
        purpose: 'SERVICE',
        at: now,
      };

      const decision = rule.evaluate(query);

      expect(decision?.allowed).toBe(false);
      expect(decision?.reason).toBe('consent_withdrawn');
    });

    it('requires MARKETING to have explicit grant', () => {
      const rule = new ConsentRule();
      const query: ContactabilityQuery = {
        party: activeParty,
        ledger: new ConsentLedger([]),
        suppressions: [],
        channel: 'SMS',
        purpose: 'MARKETING',
        at: now,
      };

      const decision = rule.evaluate(query);

      expect(decision?.allowed).toBe(false);
      expect(decision?.reason).toBe('consent_missing');
    });

    it('allows MARKETING with explicit grant', () => {
      const record: ConsentRecord = {
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

      const rule = new ConsentRule();
      const query: ContactabilityQuery = {
        party: activeParty,
        ledger: new ConsentLedger([record]),
        suppressions: [],
        channel: 'SMS',
        purpose: 'MARKETING',
        at: now,
      };

      const decision = rule.evaluate(query);

      expect(decision?.allowed).toBe(true);
      expect(decision?.reason).toBe('ok');
    });

    it('denies MARKETING when withdrawn', () => {
      const grant: ConsentRecord = {
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

      const withdrawal: ConsentRecord = {
        id: 'consent_2',
        partyId: 'party_1',
        purpose: 'MARKETING',
        channel: 'SMS',
        granted: false,
        noticeVersion: '1.0',
        source: 'WEB_FORM',
        capturedBy: 'customer',
        occurredAt: new Date(now.getTime() + 1000).toISOString(),
      };

      const rule = new ConsentRule();
      const query: ContactabilityQuery = {
        party: activeParty,
        ledger: new ConsentLedger([grant, withdrawal]),
        suppressions: [],
        channel: 'SMS',
        purpose: 'MARKETING',
        at: now,
      };

      const decision = rule.evaluate(query);

      expect(decision?.allowed).toBe(false);
      expect(decision?.reason).toBe('consent_withdrawn');
    });
  });

  describe('ContactabilityPolicy', () => {
    it('applies rules in order and returns first non-undefined decision', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });
      party.markMerged('party_2', now);

      const policy = new ContactabilityPolicy();
      const query: ContactabilityQuery = {
        party,
        ledger: new ConsentLedger([]),
        suppressions: [],
        channel: 'SMS',
        purpose: 'MARKETING',
        at: now,
      };

      const decision = policy.decide(query);

      // PartyActiveRule should deny first
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('party_inactive');
    });

    it('returns ok when all rules pass', () => {
      const record: ConsentRecord = {
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

      const policy = new ContactabilityPolicy();
      const query: ContactabilityQuery = {
        party: activeParty,
        ledger: new ConsentLedger([record]),
        suppressions: [],
        channel: 'SMS',
        purpose: 'MARKETING',
        at: now,
      };

      const decision = policy.decide(query);

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('ok');
    });
  });
});
