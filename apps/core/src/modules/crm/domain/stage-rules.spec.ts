import { describe, it, expect } from '@jest/globals';
import { StageRuleSet, HasConnectedContact, HasQualification, HasConsent } from './stage-rules';
import type { StageRuleContext } from './stage-rules';

/**
 * AC-M04-03: Default stage rules have CONTACTED requiring connected contact,
 * QUALIFIED requiring connected contact + qualification + consent.
 * missingFor returns exact labels of unmet rules.
 * HasConnectedContact accepts CALL+CONNECTED, MEETING, WHATSAPP/EMAIL by owner;
 * rejects NO_ANSWER and non-owner messages.
 */
describe('AC-M04-03 Stage rules', () => {
  const now = new Date('2026-10-03T10:00:00Z');

  describe('StageRuleSet.defaults()', () => {
    it('returns defaults with CONTACTED and QUALIFIED rules', () => {
      const rules = StageRuleSet.defaults();

      expect(rules.missingFor('NEW', {} as never)).toEqual([]);
      expect(rules.missingFor('CONTACTED', { activities: [], lead: {}, consentRecorded: false } as never)).toContain(
        'Log a connected call, meeting or message'
      );
    });
  });

  describe('HasConnectedContact', () => {
    it('has label "Log a connected call, meeting or message"', () => {
      expect(HasConnectedContact.label).toBe('Log a connected call, meeting or message');
    });

    it('is satisfied by a CALL activity with CONNECTED outcome', () => {
      const ctx: StageRuleContext = {
        activities: [
          {
            id: 'act_1',
            subjectType: 'LEAD',
            subjectId: 'lead_1',
            kind: 'CALL',
            outcome: 'CONNECTED',
            occurredAt: now.toISOString(),
            actorMemberId: 'member_1',
          },
        ],
        lead: { ownerMemberId: 'member_1' } as never,
        consentRecorded: false,
      };

      expect(HasConnectedContact.isSatisfiedBy(ctx)).toBe(true);
    });

    it('is satisfied by a MEETING activity', () => {
      const ctx: StageRuleContext = {
        activities: [
          {
            id: 'act_1',
            subjectType: 'LEAD',
            subjectId: 'lead_1',
            kind: 'MEETING',
            occurredAt: now.toISOString(),
            actorMemberId: 'member_1',
          },
        ],
        lead: { ownerMemberId: 'member_1' } as never,
        consentRecorded: false,
      };

      expect(HasConnectedContact.isSatisfiedBy(ctx)).toBe(true);
    });

    it('is satisfied by a WHATSAPP activity by the owner', () => {
      const ctx: StageRuleContext = {
        activities: [
          {
            id: 'act_1',
            subjectType: 'LEAD',
            subjectId: 'lead_1',
            kind: 'WHATSAPP',
            occurredAt: now.toISOString(),
            actorMemberId: 'member_1',
          },
        ],
        lead: { ownerMemberId: 'member_1' } as never,
        consentRecorded: false,
      };

      expect(HasConnectedContact.isSatisfiedBy(ctx)).toBe(true);
    });

    it('is satisfied by an EMAIL activity by the owner', () => {
      const ctx: StageRuleContext = {
        activities: [
          {
            id: 'act_1',
            subjectType: 'LEAD',
            subjectId: 'lead_1',
            kind: 'EMAIL',
            occurredAt: now.toISOString(),
            actorMemberId: 'member_1',
          },
        ],
        lead: { ownerMemberId: 'member_1' } as never,
        consentRecorded: false,
      };

      expect(HasConnectedContact.isSatisfiedBy(ctx)).toBe(true);
    });

    it('rejects WHATSAPP/EMAIL from non-owner', () => {
      const ctx: StageRuleContext = {
        activities: [
          {
            id: 'act_1',
            subjectType: 'LEAD',
            subjectId: 'lead_1',
            kind: 'WHATSAPP',
            occurredAt: now.toISOString(),
            actorMemberId: 'member_2',
          },
        ],
        lead: { ownerMemberId: 'member_1' } as never,
        consentRecorded: false,
      };

      expect(HasConnectedContact.isSatisfiedBy(ctx)).toBe(false);
    });

    it('rejects CALL with NO_ANSWER outcome', () => {
      const ctx: StageRuleContext = {
        activities: [
          {
            id: 'act_1',
            subjectType: 'LEAD',
            subjectId: 'lead_1',
            kind: 'CALL',
            outcome: 'NO_ANSWER',
            occurredAt: now.toISOString(),
            actorMemberId: 'member_1',
          },
        ],
        lead: { ownerMemberId: 'member_1' } as never,
        consentRecorded: false,
      };

      expect(HasConnectedContact.isSatisfiedBy(ctx)).toBe(false);
    });

    it('is not satisfied when no activities', () => {
      const ctx: StageRuleContext = {
        activities: [],
        lead: { ownerMemberId: 'member_1' } as never,
        consentRecorded: false,
      };

      expect(HasConnectedContact.isSatisfiedBy(ctx)).toBe(false);
    });
  });

  describe('HasQualification', () => {
    it('has label "Complete qualification (need, budget, timeline)"', () => {
      expect(HasQualification.label).toBe('Complete qualification (need, budget, timeline)');
    });

    it('is satisfied when need, budgetBand, and timeline are set', () => {
      const ctx: StageRuleContext = {
        activities: [],
        lead: {
          qualification: {
            need: 'PROTECTION',
            budgetBand: 'LT_15K',
            timeline: 'THIS_MONTH',
          },
        } as never,
        consentRecorded: true,
      };

      expect(HasQualification.isSatisfiedBy(ctx)).toBe(true);
    });

    it('is not satisfied when need is missing', () => {
      const ctx: StageRuleContext = {
        activities: [],
        lead: {
          qualification: {
            budgetBand: 'LT_15K',
            timeline: 'THIS_MONTH',
          },
        } as never,
        consentRecorded: true,
      };

      expect(HasQualification.isSatisfiedBy(ctx)).toBe(false);
    });

    it('is not satisfied when budgetBand is missing', () => {
      const ctx: StageRuleContext = {
        activities: [],
        lead: {
          qualification: {
            need: 'PROTECTION',
            timeline: 'THIS_MONTH',
          },
        } as never,
        consentRecorded: true,
      };

      expect(HasQualification.isSatisfiedBy(ctx)).toBe(false);
    });

    it('is not satisfied when timeline is missing', () => {
      const ctx: StageRuleContext = {
        activities: [],
        lead: {
          qualification: {
            need: 'PROTECTION',
            budgetBand: 'LT_15K',
          },
        } as never,
        consentRecorded: true,
      };

      expect(HasQualification.isSatisfiedBy(ctx)).toBe(false);
    });
  });

  describe('HasConsent', () => {
    it('has label "Record consent to contact"', () => {
      expect(HasConsent.label).toBe('Record consent to contact');
    });

    it('is satisfied when consentRecorded is true', () => {
      const ctx: StageRuleContext = {
        activities: [],
        lead: {} as never,
        consentRecorded: true,
      };

      expect(HasConsent.isSatisfiedBy(ctx)).toBe(true);
    });

    it('is not satisfied when consentRecorded is false', () => {
      const ctx: StageRuleContext = {
        activities: [],
        lead: {} as never,
        consentRecorded: false,
      };

      expect(HasConsent.isSatisfiedBy(ctx)).toBe(false);
    });
  });

  describe('StageRuleSet.missingFor', () => {
    const rules = StageRuleSet.defaults();

    it('returns empty list for NEW stage', () => {
      const missing = rules.missingFor('NEW', { activities: [], lead: {}, consentRecorded: false } as never);
      expect(missing).toEqual([]);
    });

    it('returns missing labels for CONTACTED when not satisfied', () => {
      const ctx: StageRuleContext = {
        activities: [],
        lead: { ownerMemberId: 'member_1' } as never,
        consentRecorded: false,
      };
      const missing = rules.missingFor('CONTACTED', ctx);
      expect(missing).toContain('Log a connected call, meeting or message');
      expect(missing).toHaveLength(1);
    });

    it('returns empty list for CONTACTED when HasConnectedContact is satisfied', () => {
      const ctx: StageRuleContext = {
        activities: [
          {
            id: 'act_1',
            subjectType: 'LEAD',
            subjectId: 'lead_1',
            kind: 'CALL',
            outcome: 'CONNECTED',
            occurredAt: now.toISOString(),
            actorMemberId: 'member_1',
          },
        ],
        lead: { ownerMemberId: 'member_1' } as never,
        consentRecorded: false,
      };
      const missing = rules.missingFor('CONTACTED', ctx);
      expect(missing).toEqual([]);
    });

    it('returns all missing labels for QUALIFIED when none are satisfied', () => {
      const ctx: StageRuleContext = {
        activities: [],
        lead: { ownerMemberId: 'member_1', qualification: {} } as never,
        consentRecorded: false,
      };
      const missing = rules.missingFor('QUALIFIED', ctx);
      expect(missing).toContain('Log a connected call, meeting or message');
      expect(missing).toContain('Complete qualification (need, budget, timeline)');
      expect(missing).toContain('Record consent to contact');
      expect(missing).toHaveLength(3);
    });

    it('returns only unmet labels for QUALIFIED', () => {
      const ctx: StageRuleContext = {
        activities: [
          {
            id: 'act_1',
            subjectType: 'LEAD',
            subjectId: 'lead_1',
            kind: 'CALL',
            outcome: 'CONNECTED',
            occurredAt: now.toISOString(),
            actorMemberId: 'member_1',
          },
        ],
        lead: {
          ownerMemberId: 'member_1',
          qualification: {
            need: 'PROTECTION',
            budgetBand: 'LT_15K',
            timeline: 'THIS_MONTH',
          },
        } as never,
        consentRecorded: false,
      };
      const missing = rules.missingFor('QUALIFIED', ctx);
      expect(missing).toContain('Record consent to contact');
      expect(missing).not.toContain('Log a connected call, meeting or message');
      expect(missing).not.toContain('Complete qualification (need, budget, timeline)');
      expect(missing).toHaveLength(1);
    });
  });
});
