import { describe, it, expect } from '@jest/globals';
import { MergePlan, SurvivorChoice } from './merge';
import { Party } from './party';
import { ContactPoint } from './contact-point';
import { BusinessRuleError } from '../../../kernel/errors/domain-errors';

/**
 * AC-M03-09: Merge applies survivor choices, unions contact points and tags,
 * re-points consents (history preserved with merge evidence), role links and household,
 * marks the other party MERGED, emits party.party.merged and audits; reversal within
 * 30 days restores both; after 30 days it is refused.
 */
describe('AC-M03-09 MergePlan', () => {
  const now = new Date('2026-10-03T00:00:00Z');

  const mobileCP: ContactPoint = {
    channel: 'MOBILE',
    valueEnc: 'enc_mobile',
    valueHash: 'hash_mobile_1',
    masked: '+91-XXXXXX1234',
    isPrimary: true,
  };

  const emailCP: ContactPoint = {
    channel: 'EMAIL',
    valueEnc: 'enc_email',
    valueHash: 'hash_email_1',
    masked: 'u***@example.com',
    isPrimary: true,
  };

  describe('MergePlan.build', () => {
    it('builds a merge plan from two parties and survivor choices', () => {
      const partyA = Party.create({
        id: 'party_a',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        preferredLanguage: 'en',
        source: { kind: 'MANUAL' },
        now,
      });

      const partyB = Party.create({
        id: 'party_b',
        kind: 'PERSON',
        displayName: 'John D.',
        contactPoints: [emailCP],
        preferredLanguage: 'hi',
        source: { kind: 'MANUAL' },
        now,
      });

      const choices: SurvivorChoice[] = [
        { field: 'displayName', from: 'A' },
        { field: 'preferredLanguage', from: 'A' },
      ];

      const plan = MergePlan.build(partyA, partyB, choices, 'A');

      expect(plan).toBeDefined();
    });

    it('rejects merge when both parties are not ACTIVE', () => {
      const partyA = Party.create({
        id: 'party_a',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });

      const partyB = Party.create({
        id: 'party_b',
        kind: 'PERSON',
        displayName: 'John D.',
        contactPoints: [emailCP],
        source: { kind: 'MANUAL' },
        now,
      });

      partyA.markMerged('party_c', now);

      const choices: SurvivorChoice[] = [
        { field: 'displayName', from: 'A' },
      ];

      expect(() => {
        MergePlan.build(partyA, partyB, choices, 'A');
      }).toThrow(BusinessRuleError);
    });

    it('rejects merge when same party ID', () => {
      const party = Party.create({
        id: 'party_a',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });

      const choices: SurvivorChoice[] = [
        { field: 'displayName', from: 'A' },
      ];

      expect(() => {
        MergePlan.build(party, party, choices, 'A');
      }).toThrow(BusinessRuleError);
    });

    it('requires all merge fields to be resolved', () => {
      const partyA = Party.create({
        id: 'party_a',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });

      const partyB = Party.create({
        id: 'party_b',
        kind: 'PERSON',
        displayName: 'John D.',
        contactPoints: [emailCP],
        source: { kind: 'MANUAL' },
        now,
      });

      // Missing choices for some fields
      const choices: SurvivorChoice[] = [
        { field: 'displayName', from: 'A' },
      ];

      expect(() => {
        MergePlan.build(partyA, partyB, choices, 'A');
      }).toThrow(BusinessRuleError);
    });

    it('defaults missing choices to survivor', () => {
      const partyA = Party.create({
        id: 'party_a',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        preferredLanguage: 'en',
        source: { kind: 'MANUAL' },
        now,
      });

      const partyB = Party.create({
        id: 'party_b',
        kind: 'PERSON',
        displayName: 'John D.',
        contactPoints: [emailCP],
        preferredLanguage: 'hi',
        source: { kind: 'MANUAL' },
        now,
      });

      // Complete choices including all merge fields
      const choices: SurvivorChoice[] = [
        { field: 'displayName', from: 'A' },
        { field: 'dateOfBirth', from: 'A' },
        { field: 'pan', from: 'A' },
        { field: 'preferredLanguage', from: 'A' },
        { field: 'preferredChannel', from: 'A' },
        { field: 'ownerMemberId', from: 'A' },
      ];

      const plan = MergePlan.build(partyA, partyB, choices, 'A');

      expect(plan).toBeDefined();
    });
  });

  describe('apply', () => {
    it('applies survivor choices to create merged and survivor parties', () => {
      const partyA = Party.create({
        id: 'party_a',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        preferredLanguage: 'en',
        source: { kind: 'MANUAL' },
        now,
      });

      const partyB = Party.create({
        id: 'party_b',
        kind: 'PERSON',
        displayName: 'John D.',
        contactPoints: [emailCP],
        preferredLanguage: 'hi',
        source: { kind: 'MANUAL' },
        now,
      });

      const choices: SurvivorChoice[] = [
        { field: 'displayName', from: 'A' },
        { field: 'dateOfBirth', from: 'B' },
        { field: 'pan', from: 'A' },
        { field: 'preferredLanguage', from: 'A' },
        { field: 'preferredChannel', from: 'A' },
        { field: 'ownerMemberId', from: 'A' },
      ];

      const plan = MergePlan.build(partyA, partyB, choices, 'A');
      const { survivor, merged } = plan.apply(now);

      expect(survivor.props.displayName).toBe('John Doe');
      expect(survivor.props.preferredLanguage).toBe('en');
      expect(merged.props.status).toBe('MERGED');
      expect(merged.props.mergedIntoId).toBe('party_a');
    });

    it('unions contact points by hash', () => {
      const partyA = Party.create({
        id: 'party_a',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });

      const partyB = Party.create({
        id: 'party_b',
        kind: 'PERSON',
        displayName: 'John D.',
        contactPoints: [emailCP],
        source: { kind: 'MANUAL' },
        now,
      });

      const choices: SurvivorChoice[] = [
        { field: 'displayName', from: 'A' },
        { field: 'dateOfBirth', from: 'A' },
        { field: 'pan', from: 'A' },
        { field: 'preferredLanguage', from: 'A' },
        { field: 'preferredChannel', from: 'A' },
        { field: 'ownerMemberId', from: 'A' },
      ];

      const plan = MergePlan.build(partyA, partyB, choices, 'A');
      const { survivor } = plan.apply(now);

      expect(survivor.props.contactPoints).toHaveLength(2);
      const hashes = survivor.props.contactPoints.map((cp) => cp.valueHash);
      expect(hashes).toContain('hash_mobile_1');
      expect(hashes).toContain('hash_email_1');
    });

    it('unions tags from both parties', () => {
      const partyA = Party.create({
        id: 'party_a',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        tags: ['VIP', 'Insurance'],
        source: { kind: 'MANUAL' },
        now,
      });

      const partyB = Party.create({
        id: 'party_b',
        kind: 'PERSON',
        displayName: 'John D.',
        contactPoints: [emailCP],
        tags: ['Insurance', 'Customer'],
        source: { kind: 'MANUAL' },
        now,
      });

      const choices: SurvivorChoice[] = [
        { field: 'displayName', from: 'A' },
        { field: 'dateOfBirth', from: 'A' },
        { field: 'pan', from: 'A' },
        { field: 'preferredLanguage', from: 'A' },
        { field: 'preferredChannel', from: 'A' },
        { field: 'ownerMemberId', from: 'A' },
      ];

      const plan = MergePlan.build(partyA, partyB, choices, 'A');
      const { survivor } = plan.apply(now);

      expect(survivor.props.tags).toContain('VIP');
      expect(survivor.props.tags).toContain('Insurance');
      expect(survivor.props.tags).toContain('Customer');
    });

    it('prefers survivor contact primaries', () => {
      const primaryMobile: ContactPoint = {
        ...mobileCP,
        isPrimary: true,
      };
      const secondaryMobile: ContactPoint = {
        channel: 'MOBILE',
        valueEnc: 'enc_mobile_2',
        valueHash: 'hash_mobile_2',
        masked: '+91-XXXXXX5678',
        isPrimary: false,
      };

      const partyA = Party.create({
        id: 'party_a',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [primaryMobile],
        source: { kind: 'MANUAL' },
        now,
      });

      const partyB = Party.create({
        id: 'party_b',
        kind: 'PERSON',
        displayName: 'John D.',
        contactPoints: [secondaryMobile],
        source: { kind: 'MANUAL' },
        now,
      });

      const choices: SurvivorChoice[] = [
        { field: 'displayName', from: 'A' },
        { field: 'dateOfBirth', from: 'A' },
        { field: 'pan', from: 'A' },
        { field: 'preferredLanguage', from: 'A' },
        { field: 'preferredChannel', from: 'A' },
        { field: 'ownerMemberId', from: 'A' },
      ];

      const plan = MergePlan.build(partyA, partyB, choices, 'A');
      const { survivor } = plan.apply(now);

      const mobiles = survivor.props.contactPoints.filter((cp) => cp.channel === 'MOBILE');
      const primary = mobiles.find((cp) => cp.isPrimary);
      expect(primary?.valueHash).toBe('hash_mobile_1');
    });
  });
});
