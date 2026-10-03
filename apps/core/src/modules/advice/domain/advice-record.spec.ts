import { BusinessRuleError, ForbiddenError, ValidationError } from '../../../kernel/errors/domain-errors';
import { AdviceRecord } from './advice-record';

const now = new Date('2026-10-03T06:00:00.000Z');
const scope = { disclosure: 'We compare products from 2 insurers', entityType: 'IMF', versionIdsShown: ['pv_a', 'pv_b'], excludedCount: 3, evaluatedOn: '2026-10-03' };
const draft = () => AdviceRecord.start({ id: 'adv_1', partyId: 'pty_1', advisorMemberId: 'mem_1', scope, now });

describe('AC-M06-04 advice record', () => {
  it('AC-M06-04 recommends only versions shown in the scope snapshot', () => {
    const a = draft();
    a.recommend('pv_a', 'Lowest premium for the cover needed');
    expect(a.props.recommended).toEqual([{ versionId: 'pv_a', rationale: 'Lowest premium for the cover needed' }]);
    expect(() => a.recommend('pv_x', 'Not in the comparison scope')).toThrow(ForbiddenError);
    expect(() => a.recommend('pv_x', 'Not in the comparison scope')).toThrow(expect.objectContaining({ code: 'product_out_of_scope' }));
  });

  it('AC-M06-04 requires a 10–500 character rationale', () => {
    expect(() => draft().recommend('pv_a', 'short')).toThrow(ValidationError);
  });

  it('AC-M06-04 needs a reason when the customer picks a product that was not recommended', () => {
    const a = draft();
    a.recommend('pv_a', 'Lowest premium for the cover needed');
    expect(() => a.recordChoice('pv_b')).toThrow(expect.objectContaining({ code: 'choice_reason_required' }));
    a.recordChoice('pv_b', 'Prefers the insurer brand');
    expect(a.props.customerChoice).toEqual({ versionId: 'pv_b', reasonIfDifferent: 'Prefers the insurer brand' });
    expect(a.choseRecommended).toBe(false);
    a.recordChoice('pv_a');
    expect(a.props.customerChoice).toEqual({ versionId: 'pv_a' });
    expect(a.choseRecommended).toBe(true);
  });

  it('AC-M06-04 finalise lists the missing recommendation and choice', () => {
    const a = draft();
    try {
      a.finalise(now);
      throw new Error('expected advice_incomplete');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessRuleError);
      expect((e as BusinessRuleError).details).toEqual({ missing: ['recommendation', 'customerChoice'] });
    }
  });

  it('AC-M06-04 nothing changes after finalisation', () => {
    const a = draft();
    a.recommend('pv_a', 'Lowest premium for the cover needed');
    a.recordChoice('pv_a');
    a.finalise(now);
    expect(a.props.status).toBe('FINALISED');
    expect(a.props.finalisedAt).toBe(now.toISOString());
    const finalised = expect.objectContaining({ code: 'advice_finalised' });
    expect(() => a.recommend('pv_b', 'Changing my mind later')).toThrow(finalised);
    expect(() => a.recordChoice('pv_b', 'Changed')).toThrow(finalised);
    expect(() => a.setNotes('x')).toThrow(finalised);
    expect(() => a.addCalculatorRun({ calculator: 'floater', inputs: {}, outputs: {}, assumptionsVersion: '2026.1', ranAt: now.toISOString() })).toThrow(finalised);
    expect(() => a.finalise(now)).toThrow(finalised);
  });

  it('AC-M06-04 suitability notes reject PAN and are capped at 2000 characters', () => {
    const a = draft();
    expect(() => a.setNotes('PAN ABCDE1234F on file')).toThrow(expect.objectContaining({ code: 'sensitive_content_not_allowed' }));
    expect(() => a.setNotes('x'.repeat(2001))).toThrow(expect.objectContaining({ code: 'notes_too_long' }));
    a.setNotes('Needs cover till retirement');
    expect(a.props.suitabilityNotes).toBe('Needs cover till retirement');
  });
});
