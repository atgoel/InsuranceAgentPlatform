import { describe, it, expect } from '@jest/globals';
import { Opportunity } from './opportunity';
import { Money } from '../../../kernel/domain';
import { BusinessRuleError } from '../../../kernel/errors/domain-errors';

/**
 * AC-M04-05: Opportunity opens with a start stage (DISCOVERY or QUOTE_SHARED).
 * Moves only to adjacent open stages (one step forward or back).
 * Non-adjacent moves raise error (assuming BusinessRuleError with code illegal_opportunity_transition if LLD unspecified).
 * markIssued works only from PROPOSAL_COMPLETE or INSURER_PENDING via insurer-confirmation.
 * LOST requires a reason from the list.
 * Terminal stages (ISSUED, LOST) cannot move.
 * ageInStageDays returns days since stageEnteredAt.
 */
describe('AC-M04-05 Opportunity aggregate', () => {
  const now = new Date('2026-10-03T10:00:00Z');
  const expectedPremium = Money.ofPaise(50000); // 50000 paise

  describe('Opportunity.open', () => {
    it('opens an opportunity with DISCOVERY start stage', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        leadId: 'lead_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life Opportunity',
        expectedPremium,
        startStage: 'DISCOVERY',
        ownerMemberId: 'member_1',
        orgUnitId: 'ou_1',
        now,
      });

      expect(opp.props.id).toBe('opp_1');
      expect(opp.props.stage).toBe('DISCOVERY');
      expect(opp.props.partyId).toBe('party_1');
      expect(opp.props.leadId).toBe('lead_1');
      expect(opp.props.ownerMemberId).toBe('member_1');
      expect(opp.props.stageEnteredAt).toBe(now.toISOString());
    });

    it('opens an opportunity with QUOTE_SHARED start stage', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life Opportunity',
        expectedPremium,
        startStage: 'QUOTE_SHARED',
        ownerMemberId: 'member_1',
        now,
      });

      expect(opp.props.stage).toBe('QUOTE_SHARED');
    });

    it('stores expectedPremium as Money with paise', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium: Money.ofPaise(75000),
        startStage: 'DISCOVERY',
        ownerMemberId: 'member_1',
        now,
      });

      expect(opp.props.expectedPremium.paise).toBe(75000);
      expect(opp.props.expectedPremium.currency).toBe('INR');
    });
  });

  describe('move to adjacent stages', () => {
    it('allows DISCOVERY -> QUOTE_SHARED', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'DISCOVERY',
        ownerMemberId: 'member_1',
        now,
      });

      const moveTime = new Date('2026-10-03T11:00:00Z');
      opp.move('QUOTE_SHARED', moveTime);
      expect(opp.props.stage).toBe('QUOTE_SHARED');
      expect(opp.props.stageEnteredAt).toBe(moveTime.toISOString());
    });

    it('allows QUOTE_SHARED -> DISCOVERY (backward)', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'QUOTE_SHARED',
        ownerMemberId: 'member_1',
        now,
      });

      const moveTime = new Date('2026-10-03T11:00:00Z');
      opp.move('DISCOVERY', moveTime);
      expect(opp.props.stage).toBe('DISCOVERY');
    });

    it('allows QUOTE_SHARED -> PROPOSAL_COMPLETE', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'QUOTE_SHARED',
        ownerMemberId: 'member_1',
        now,
      });

      opp.move('PROPOSAL_COMPLETE', new Date('2026-10-03T11:00:00Z'));
      expect(opp.props.stage).toBe('PROPOSAL_COMPLETE');
    });

    it('allows PROPOSAL_COMPLETE -> INSURER_PENDING', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'QUOTE_SHARED',
        ownerMemberId: 'member_1',
        now,
      });

      opp.move('PROPOSAL_COMPLETE', new Date('2026-10-03T11:00:00Z'));
      opp.move('INSURER_PENDING', new Date('2026-10-03T12:00:00Z'));
      expect(opp.props.stage).toBe('INSURER_PENDING');
    });

    it('allows INSURER_PENDING -> PROPOSAL_COMPLETE (backward)', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'QUOTE_SHARED',
        ownerMemberId: 'member_1',
        now,
      });

      opp.move('PROPOSAL_COMPLETE', new Date('2026-10-03T11:00:00Z'));
      opp.move('INSURER_PENDING', new Date('2026-10-03T12:00:00Z'));
      opp.move('PROPOSAL_COMPLETE', new Date('2026-10-03T13:00:00Z'));
      expect(opp.props.stage).toBe('PROPOSAL_COMPLETE');
    });
  });

  describe('reject non-adjacent moves', () => {
    it('rejects DISCOVERY -> PROPOSAL_COMPLETE (skip one stage)', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'DISCOVERY',
        ownerMemberId: 'member_1',
        now,
      });

      expect(() => {
        opp.move('PROPOSAL_COMPLETE', new Date('2026-10-03T11:00:00Z'));
      }).toThrow(BusinessRuleError);
    });

    it('rejects DISCOVERY -> INSURER_PENDING (skip two stages)', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'DISCOVERY',
        ownerMemberId: 'member_1',
        now,
      });

      expect(() => {
        opp.move('INSURER_PENDING', new Date('2026-10-03T11:00:00Z'));
      }).toThrow(BusinessRuleError);
    });

    it('rejects QUOTE_SHARED -> INSURER_PENDING (skip one stage)', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'QUOTE_SHARED',
        ownerMemberId: 'member_1',
        now,
      });

      expect(() => {
        opp.move('INSURER_PENDING', new Date('2026-10-03T11:00:00Z'));
      }).toThrow(BusinessRuleError);
    });
  });

  describe('terminal stages', () => {
    it('ISSUED is terminal and cannot move', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'QUOTE_SHARED',
        ownerMemberId: 'member_1',
        now,
      });

      opp.move('PROPOSAL_COMPLETE', new Date('2026-10-03T11:00:00Z'));
      opp.move('INSURER_PENDING', new Date('2026-10-03T12:00:00Z'));
      opp.markIssued(
        { policySaleId: 'sale_1', confirmedBy: 'INSURER' },
        new Date('2026-10-03T13:00:00Z')
      );

      expect(opp.props.stage).toBe('ISSUED');

      expect(() => {
        opp.move('PROPOSAL_COMPLETE', new Date('2026-10-03T14:00:00Z'));
      }).toThrow(BusinessRuleError);
    });

    it('LOST is terminal and cannot move', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'DISCOVERY',
        ownerMemberId: 'member_1',
        now,
      });

      opp.markLost('BOUGHT_ELSEWHERE', new Date('2026-10-03T11:00:00Z'));
      expect(opp.props.stage).toBe('LOST');

      expect(() => {
        opp.move('QUOTE_SHARED', new Date('2026-10-03T12:00:00Z'));
      }).toThrow(BusinessRuleError);
    });

    it('cannot call move on ISSUED opportunity', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'QUOTE_SHARED',
        ownerMemberId: 'member_1',
        now,
      });

      opp.move('PROPOSAL_COMPLETE', new Date('2026-10-03T11:00:00Z'));
      opp.move('INSURER_PENDING', new Date('2026-10-03T12:00:00Z'));
      opp.markIssued(
        { policySaleId: 'sale_1', confirmedBy: 'INSURER' },
        new Date('2026-10-03T13:00:00Z')
      );

      expect(() => {
        opp.move('PROPOSAL_COMPLETE', new Date('2026-10-03T14:00:00Z'));
      }).toThrow(BusinessRuleError);
    });
  });

  describe('move cannot set ISSUED', () => {
    it('raises issued_requires_insurer_confirmation when trying to move to ISSUED', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'QUOTE_SHARED',
        ownerMemberId: 'member_1',
        now,
      });

      opp.move('PROPOSAL_COMPLETE', new Date('2026-10-03T11:00:00Z'));
      opp.move('INSURER_PENDING', new Date('2026-10-03T12:00:00Z'));

      expect(() => {
        opp.move('ISSUED', new Date('2026-10-03T13:00:00Z'));
      }).toThrow(BusinessRuleError);

      try {
        opp.move('ISSUED', new Date('2026-10-03T13:00:00Z'));
      } catch (e) {
        if (e instanceof BusinessRuleError) {
          expect(e.code).toBe('issued_requires_insurer_confirmation');
        }
      }
    });
  });

  describe('markIssued', () => {
    it('marks ISSUED from PROPOSAL_COMPLETE via insurer confirmation', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'QUOTE_SHARED',
        ownerMemberId: 'member_1',
        now,
      });

      opp.move('PROPOSAL_COMPLETE', new Date('2026-10-03T11:00:00Z'));
      opp.markIssued(
        { policySaleId: 'sale_1', confirmedBy: 'INSURER' },
        new Date('2026-10-03T12:00:00Z')
      );

      expect(opp.props.stage).toBe('ISSUED');
      expect(opp.props.issuedPolicySaleId).toBe('sale_1');
    });

    it('marks ISSUED from INSURER_PENDING via insurer confirmation', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'QUOTE_SHARED',
        ownerMemberId: 'member_1',
        now,
      });

      opp.move('PROPOSAL_COMPLETE', new Date('2026-10-03T11:00:00Z'));
      opp.move('INSURER_PENDING', new Date('2026-10-03T12:00:00Z'));
      opp.markIssued(
        { policySaleId: 'sale_1', confirmedBy: 'INSURER' },
        new Date('2026-10-03T13:00:00Z')
      );

      expect(opp.props.stage).toBe('ISSUED');
      expect(opp.props.issuedPolicySaleId).toBe('sale_1');
    });

    it('rejects markIssued from DISCOVERY', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'DISCOVERY',
        ownerMemberId: 'member_1',
        now,
      });

      expect(() => {
        opp.markIssued(
          { policySaleId: 'sale_1', confirmedBy: 'INSURER' },
          new Date('2026-10-03T11:00:00Z')
        );
      }).toThrow(BusinessRuleError);
    });

    it('rejects markIssued from QUOTE_SHARED', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'QUOTE_SHARED',
        ownerMemberId: 'member_1',
        now,
      });

      expect(() => {
        opp.markIssued(
          { policySaleId: 'sale_1', confirmedBy: 'INSURER' },
          new Date('2026-10-03T11:00:00Z')
        );
      }).toThrow(BusinessRuleError);
    });
  });

  describe('markLost', () => {
    it('marks LOST with a reason from the list', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'DISCOVERY',
        ownerMemberId: 'member_1',
        now,
      });

      opp.markLost('BOUGHT_ELSEWHERE', new Date('2026-10-03T11:00:00Z'));

      expect(opp.props.stage).toBe('LOST');
      expect(opp.props.lostReason).toBe('BOUGHT_ELSEWHERE');
    });

    it('marks LOST with PREMIUM_TOO_HIGH reason', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'DISCOVERY',
        ownerMemberId: 'member_1',
        now,
      });

      opp.markLost('PREMIUM_TOO_HIGH', new Date('2026-10-03T11:00:00Z'));

      expect(opp.props.lostReason).toBe('PREMIUM_TOO_HIGH');
    });
  });

  describe('ageInStageDays', () => {
    it('returns 0 days when called immediately after move', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'DISCOVERY',
        ownerMemberId: 'member_1',
        now,
      });

      expect(opp.ageInStageDays(now)).toBe(0);
    });

    it('returns 1 day when called 24 hours after move', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'DISCOVERY',
        ownerMemberId: 'member_1',
        now,
      });

      const later = new Date('2026-10-04T10:00:00Z');
      expect(opp.ageInStageDays(later)).toBe(1);
    });

    it('returns age in stage after move to next stage', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'DISCOVERY',
        ownerMemberId: 'member_1',
        now,
      });

      const later = new Date('2026-10-07T10:00:00Z');
      opp.move('QUOTE_SHARED', new Date('2026-10-05T10:00:00Z'));
      expect(opp.ageInStageDays(later)).toBe(2);
    });
  });

  describe('updateExpectedPremium', () => {
    it('updates the expected premium amount', () => {
      const opp = Opportunity.open({
        id: 'opp_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        title: 'Term Life',
        expectedPremium,
        startStage: 'DISCOVERY',
        ownerMemberId: 'member_1',
        now,
      });

      const newPremium = Money.ofPaise(100000);
      opp.updateExpectedPremium(newPremium);

      expect(opp.props.expectedPremium.paise).toBe(100000);
    });
  });
});
