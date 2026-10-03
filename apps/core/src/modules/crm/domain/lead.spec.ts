import { describe, it, expect } from '@jest/globals';
import { Lead, lineOfBusiness, ProductLine } from './lead';
import { ValidationError, BusinessRuleError } from '../../../kernel/errors/domain-errors';
import type { StageRuleSet, StageRuleContext } from './stage-rules';

/**
 * AC-M04-01: Lead.capture sets stage NEW, temperature WARM, and history [{ to: 'NEW' }];
 * assign sets owner and slaDueAt when slaMinutes given; slaState returns none/pending/met/breached at boundaries.
 *
 * AC-M04-02: Lead stage moves follow allowed transitions; CONVERTED only via markConverted from QUALIFIED;
 * LOST requires lostReason; closed leads cannot move; stageHistory records each transition.
 */
describe('AC-M04-01 Lead.capture and assign', () => {
  const now = new Date('2026-10-03T10:00:00Z');

  it('creates a new lead with stage NEW, temperature WARM, and empty history entry', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    expect(lead.props.stage).toBe('NEW');
    expect(lead.props.temperature).toBe('WARM');
    expect(lead.props.stageHistory).toEqual([{ to: 'NEW', at: now.toISOString(), by: 'user_1' }]);
  });

  it('validates pincode format /^[1-9][0-9]{5}$/ when given', () => {
    expect(() => {
      Lead.capture({
        id: 'lead_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        pincode: '012345', // starts with 0
        attribution: {
          source: 'WEB_FORM',
          firstTouch: { channel: 'WEB', at: now.toISOString() },
          lastTouch: { channel: 'WEB', at: now.toISOString() },
        },
        now,
        by: 'user_1',
      });
    }).toThrow(ValidationError);

    expect(() => {
      Lead.capture({
        id: 'lead_1',
        partyId: 'party_1',
        productInterest: 'TERM_LIFE',
        pincode: '12345', // only 5 digits
        attribution: {
          source: 'WEB_FORM',
          firstTouch: { channel: 'WEB', at: now.toISOString() },
          lastTouch: { channel: 'WEB', at: now.toISOString() },
        },
        now,
        by: 'user_1',
      });
    }).toThrow(ValidationError);

    const leadWithValidPincode = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      pincode: '560001',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });
    expect(leadWithValidPincode.props.pincode).toBe('560001');
  });

  it('assign sets owner, orgUnitId, and slaDueAt when slaMinutes is given', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    const assignTime = new Date('2026-10-03T10:00:00Z');
    lead.assign('member_1', 'ou_1', 60, assignTime, 'rule_1');

    expect(lead.props.ownerMemberId).toBe('member_1');
    expect(lead.props.orgUnitId).toBe('ou_1');
    expect(lead.props.routedByRuleId).toBe('rule_1');
    expect(lead.props.slaDueAt).toBe(new Date('2026-10-03T11:00:00Z').toISOString());
  });

  it('assign without slaMinutes does not set slaDueAt', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    lead.assign('member_1', 'ou_1', undefined, now);

    expect(lead.props.ownerMemberId).toBe('member_1');
    expect(lead.props.slaDueAt).toBeUndefined();
  });

  it('slaState returns "none" when no slaDueAt', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    expect(lead.slaState(now)).toBe('none');
  });

  it('slaState returns "met" when responded <= due', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    lead.assign('member_1', 'ou_1', 60, now);
    lead.recordResponse(new Date('2026-10-03T10:50:00Z'));

    expect(lead.slaState(new Date('2026-10-03T11:05:00Z'))).toBe('met');
  });

  it('slaState returns "breached" when responded > due', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    lead.assign('member_1', 'ou_1', 60, now);
    lead.recordResponse(new Date('2026-10-03T11:30:00Z'));

    expect(lead.slaState(new Date('2026-10-03T12:00:00Z'))).toBe('breached');
  });

  it('slaState returns "pending" when not responded and now < due', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    lead.assign('member_1', 'ou_1', 60, now);

    expect(lead.slaState(new Date('2026-10-03T10:30:00Z'))).toBe('pending');
  });

  it('slaState returns "breached" when not responded and now > due', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    lead.assign('member_1', 'ou_1', 60, now);

    expect(lead.slaState(new Date('2026-10-03T11:30:00Z'))).toBe('breached');
  });

  it('recordResponse only once sets firstRespondedAt on first call', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    const firstResponseTime = new Date('2026-10-03T10:15:00Z');
    lead.recordResponse(firstResponseTime);
    expect(lead.props.firstRespondedAt).toBe(firstResponseTime.toISOString());

    const secondResponseTime = new Date('2026-10-03T10:30:00Z');
    lead.recordResponse(secondResponseTime);
    expect(lead.props.firstRespondedAt).toBe(firstResponseTime.toISOString());
  });
});

describe('AC-M04-02 Lead stage transitions', () => {
  const now = new Date('2026-10-03T10:00:00Z');
  const mockRuleSet: StageRuleSet = {
    missingFor: jest.fn(() => []),
  } as any;
  const mockContext: StageRuleContext = {
    activities: [],
    lead: {} as any,
    consentRecorded: true,
  };

  it('allows NEW -> CONTACTED', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    lead.moveTo('CONTACTED', mockRuleSet, mockContext, now, 'user_1');
    expect(lead.props.stage).toBe('CONTACTED');
    expect(lead.props.stageHistory).toContainEqual(
      expect.objectContaining({ from: 'NEW', to: 'CONTACTED' })
    );
  });

  it('allows NEW -> LOST with reason', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    lead.moveTo('LOST', mockRuleSet, mockContext, now, 'user_1', 'NOT_INTERESTED');
    expect(lead.props.stage).toBe('LOST');
    expect(lead.props.lostReason).toBe('NOT_INTERESTED');
  });

  it('requires lostReason when moving to LOST', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    expect(() => {
      lead.moveTo('LOST', mockRuleSet, mockContext, now, 'user_1');
    }).toThrow(ValidationError);
  });

  it('allows CONTACTED -> QUALIFIED', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    lead.moveTo('CONTACTED', mockRuleSet, mockContext, now, 'user_1');
    lead.moveTo('QUALIFIED', mockRuleSet, mockContext, now, 'user_1');
    expect(lead.props.stage).toBe('QUALIFIED');
  });

  it('allows CONTACTED -> NEW', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    lead.moveTo('CONTACTED', mockRuleSet, mockContext, now, 'user_1');
    lead.moveTo('NEW', mockRuleSet, mockContext, now, 'user_1');
    expect(lead.props.stage).toBe('NEW');
  });

  it('allows QUALIFIED -> CONTACTED', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    lead.moveTo('CONTACTED', mockRuleSet, mockContext, now, 'user_1');
    lead.moveTo('QUALIFIED', mockRuleSet, mockContext, now, 'user_1');
    lead.moveTo('CONTACTED', mockRuleSet, mockContext, now, 'user_1');
    expect(lead.props.stage).toBe('CONTACTED');
  });

  it('rejects illegal transitions with illegal_lead_transition error', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    expect(() => {
      lead.moveTo('QUALIFIED', mockRuleSet, mockContext, now, 'user_1');
    }).toThrow(BusinessRuleError);
  });

  it('rejects conversion via moveTo with use_conversion error', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    lead.moveTo('CONTACTED', mockRuleSet, mockContext, now, 'user_1');
    lead.moveTo('QUALIFIED', mockRuleSet, mockContext, now, 'user_1');

    expect(() => {
      lead.moveTo('CONVERTED', mockRuleSet, mockContext, now, 'user_1');
    }).toThrow(BusinessRuleError);
  });

  it('markConverted requires stage QUALIFIED', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    expect(() => {
      lead.markConverted('opp_1', now, 'user_1');
    }).toThrow(BusinessRuleError);
  });

  it('markConverted from QUALIFIED sets stage CONVERTED and convertedOpportunityId', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    lead.moveTo('CONTACTED', mockRuleSet, mockContext, now, 'user_1');
    lead.moveTo('QUALIFIED', mockRuleSet, mockContext, now, 'user_1');
    lead.markConverted('opp_1', now, 'user_1');

    expect(lead.props.stage).toBe('CONVERTED');
    expect(lead.props.convertedOpportunityId).toBe('opp_1');
  });

  it('CONVERTED is terminal and cannot move', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    lead.moveTo('CONTACTED', mockRuleSet, mockContext, now, 'user_1');
    lead.moveTo('QUALIFIED', mockRuleSet, mockContext, now, 'user_1');
    lead.markConverted('opp_1', now, 'user_1');

    expect(() => {
      lead.moveTo('CONTACTED', mockRuleSet, mockContext, now, 'user_1');
    }).toThrow(BusinessRuleError);
  });

  it('LOST is terminal and cannot move', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    lead.moveTo('LOST', mockRuleSet, mockContext, now, 'user_1', 'NOT_INTERESTED');

    expect(() => {
      lead.moveTo('CONTACTED', mockRuleSet, mockContext, now, 'user_1');
    }).toThrow(BusinessRuleError);
  });

  it('touch updates attribution.lastTouch', () => {
    const lead = Lead.capture({
      id: 'lead_1',
      partyId: 'party_1',
      productInterest: 'TERM_LIFE',
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB', at: now.toISOString() },
        lastTouch: { channel: 'WEB', at: now.toISOString() },
      },
      now,
      by: 'user_1',
    });

    const newTouch = { channel: 'CALL', ref: 'ref_123', at: new Date('2026-10-03T11:00:00Z').toISOString() };
    lead.touch(newTouch);

    expect(lead.props.attribution.lastTouch).toEqual(newTouch);
    expect(lead.props.attribution.firstTouch.channel).toBe('WEB');
  });

  it('AC-M04-07 lineOfBusiness maps every ProductLine to its licence line', () => {
    const expected: Record<ProductLine, 'LIFE' | 'HEALTH' | 'GENERAL'> = {
      TERM_LIFE: 'LIFE', SAVINGS_LIFE: 'LIFE', CHILD: 'LIFE', RETIREMENT: 'LIFE',
      HEALTH: 'HEALTH', HEALTH_FLOATER: 'HEALTH', MOTOR: 'GENERAL', OTHER: 'GENERAL',
    };
    for (const [product, line] of Object.entries(expected)) expect(lineOfBusiness(product as ProductLine)).toBe(line);
  });
});
