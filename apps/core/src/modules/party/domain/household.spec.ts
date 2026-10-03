import { describe, it, expect } from '@jest/globals';
import { Household } from './household';
import { ConflictError, BusinessRuleError } from '../../../kernel/errors/domain-errors';

/**
 * AC-M03-12: Household: one SELF, a party in at most one household, head removal rule.
 */
describe('AC-M03-12 Household', () => {
  describe('Household.create', () => {
    it('creates a household with head as SELF', () => {
      const household = Household.create({
        id: 'hh_1',
        name: 'Doe Family',
        head: 'party_1',
      });

      expect(household.id).toBe('hh_1');
      expect(household.name).toBe('Doe Family');
      expect(household.members).toHaveLength(1);
      expect(household.members[0].partyId).toBe('party_1');
      expect(household.members[0].relation).toBe('SELF');
    });
  });

  describe('add', () => {
    it('adds a member with relation', () => {
      const household = Household.create({
        id: 'hh_1',
        name: 'Doe Family',
        head: 'party_1',
      });

      household.add('party_2', 'SPOUSE');

      expect(household.members).toHaveLength(2);
      expect(household.members.find((m) => m.partyId === 'party_2')).toEqual({
        partyId: 'party_2',
        relation: 'SPOUSE',
      });
    });

    it('rejects adding a member already in the household', () => {
      const household = Household.create({
        id: 'hh_1',
        name: 'Doe Family',
        head: 'party_1',
      });

      expect(() => {
        household.add('party_1', 'CHILD');
      }).toThrow(ConflictError);
    });

    it('rejects adding a second SELF member', () => {
      const household = Household.create({
        id: 'hh_1',
        name: 'Doe Family',
        head: 'party_1',
      });

      household.add('party_2', 'SPOUSE');

      expect(() => {
        household.add('party_3', 'SELF');
      }).toThrow(BusinessRuleError);
    });
  });

  describe('remove', () => {
    it('removes a member from the household', () => {
      const household = Household.create({
        id: 'hh_1',
        name: 'Doe Family',
        head: 'party_1',
      });

      household.add('party_2', 'SPOUSE');
      household.remove('party_2');

      expect(household.members).toHaveLength(1);
      expect(household.members[0].partyId).toBe('party_1');
    });

    it('refuses to remove the head while others remain', () => {
      const household = Household.create({
        id: 'hh_1',
        name: 'Doe Family',
        head: 'party_1',
      });

      household.add('party_2', 'SPOUSE');

      expect(() => {
        household.remove('party_1');
      }).toThrow(BusinessRuleError);
    });

    it('allows removing the head if no other members', () => {
      const household = Household.create({
        id: 'hh_1',
        name: 'Doe Family',
        head: 'party_1',
      });

      household.remove('party_1');

      expect(household.members).toHaveLength(0);
    });
  });

  describe('members', () => {
    it('returns readonly members array', () => {
      const household = Household.create({
        id: 'hh_1',
        name: 'Doe Family',
        head: 'party_1',
      });

      const members = household.members;

      expect(() => {
        (members as any).push({ partyId: 'party_2', relation: 'SPOUSE' });
      }).toThrow();
    });
  });
});
