import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CrmModule } from '../../src/modules/crm/crm.module';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { EVENT_BUS, OUTBOX } from '../../src/kernel/tokens';
import { InMemoryOutbox } from '../../src/kernel/outbox/outbox';
import { EventBus } from '../../src/kernel/outbox/event-bus';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';
import { setupSellerWithRouting } from './fixtures';

const HOST = 'acme.iap.test';

/** AC-M04-18 cross-module reactions through the event bus: member exit, party merge, insurer-confirmed issuance. */
describe('AC-M04-18 CRM event subscribers', () => {
  let t: TestApp;
  const admin = tokenFor({ tenantId: 'ten_acme', roles: ['TENANT_ADMIN'], memberId: 'member_admin' });
  const req = (method: 'get' | 'post' | 'put', path: string, body?: object, token = admin) => {
    const r = t.http[method](path).set('Host', HOST).set('Authorization', `Bearer ${token}`);
    return method === 'post' ? r.set('Idempotency-Key', newIdempotencyKey()).send(body) : body ? r.send(body) : r;
  };
  let seq = 0;
  const publish = (type: string, subject: string, data: Record<string, unknown>, id = `evt_${(seq += 1)}`) =>
    t.app.get<EventBus>(EVENT_BUS).publish({ id, specVersion: '1.0', type, source: 'test', subject, tenantId: 'ten_acme', occurredAt: '2026-01-01T00:00:00.000Z', dataVersion: 1, data });

  /** Capture (routed to the only seller), qualify and convert; returns lead, party and opportunity ids. */
  const convertedLead = async (mobile: string, token: string) => {
    const lead = await req('post', '/api/v1/leads', { fullName: 'Asha Verma', mobile, productInterest: 'TERM_LIFE', source: 'WEB_FORM',
      consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'], purposes: ['SERVICE', 'MARKETING'] } });
    const id = lead.body.leadId as string;
    await req('post', `/api/v1/leads/${id}/activities`, { kind: 'CALL', outcome: 'CONNECTED' }, token);
    await req('post', `/api/v1/leads/${id}/stage-transitions`, { to: 'CONTACTED' }, token);
    await req('put', `/api/v1/leads/${id}/qualification`, { need: 'PROTECTION', budgetBand: 'LT_15K', timeline: 'THIS_MONTH' }, token);
    await req('post', `/api/v1/leads/${id}/stage-transitions`, { to: 'QUALIFIED' }, token);
    const conv = await req('post', `/api/v1/leads/${id}/conversion`, { partyChoice: 'LEAD_PARTY', productInterest: 'TERM_LIFE', expectedPremiumPaise: 2_000_000, startStage: 'DISCOVERY' }, token);
    expect(conv.status).toBe(201);
    return { leadId: id, partyId: lead.body.partyId as string, opportunityId: conv.body.opportunityId as string };
  };
  const opportunity = async (id: string) => {
    const board = await req('get', '/api/v1/opportunities');
    const all = (board.body.columns as Array<{ items: Array<{ id: string; ownerMemberId: string; partyId: string; stage: string }> }>).flatMap((c) => c.items);
    return all.find((o) => o.id === id);
  };

  beforeEach(async () => {
    t = await createTestApp({ imports: [CrmModule, DistributionModule] });
  });
  afterEach(async () => t.close());

  it('AC-M04-18 member exit moves open leads, tasks and opportunities to the transfer target, once', async () => {
    const leaver = await setupSellerWithRouting(t, 'sub_leaver');
    const { opportunityId } = await convertedLead('+919812300001', leaver.token);
    const open = await req('post', '/api/v1/leads', { fullName: 'Ravi Kumar', mobile: '+919812300002', productInterest: 'TERM_LIFE', source: 'WEB_FORM',
      consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'], purposes: ['SERVICE'] } });
    expect(open.body.ownerMemberId).toBe(leaver.memberId);
    const heir = await setupSellerWithRouting(t, 'sub_heir');
    const event = { memberId: leaver.memberId, transferToMemberId: heir.memberId };
    await publish('distribution.member.exited', leaver.memberId, event, 'evt_exit');
    await publish('distribution.member.exited', leaver.memberId, event, 'evt_exit'); // redelivery is a no-op

    expect((await req('get', `/api/v1/leads/${open.body.leadId}`)).body.ownerMemberId).toBe(heir.memberId);
    expect((await opportunity(opportunityId))?.ownerMemberId).toBe(heir.memberId);
    const heirTasks = await req('get', '/api/v1/tasks?mine=true', undefined, heir.token);
    const subjects = (heirTasks.body.groups as Array<{ items: Array<{ subjectId: string }> }>).flatMap((g) => g.items).map((i) => i.subjectId);
    expect(subjects).toContain(open.body.leadId);
  });

  it('AC-M04-18 member exit without a transfer target unassigns open leads', async () => {
    const leaver = await setupSellerWithRouting(t, 'sub_alone');
    const lead = await req('post', '/api/v1/leads', { fullName: 'Ravi Kumar', mobile: '+919812300003', productInterest: 'TERM_LIFE', source: 'WEB_FORM',
      consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'], purposes: ['SERVICE'] } });
    await publish('distribution.member.exited', leaver.memberId, { memberId: leaver.memberId, transferToMemberId: null });
    expect((await req('get', `/api/v1/leads/${lead.body.leadId}`)).body.ownerMemberId).toBeUndefined();
  });

  it('AC-M04-18 party merge relinks leads and opportunities to the survivor', async () => {
    const seller = await setupSellerWithRouting(t, 'sub_merge');
    const { leadId, partyId, opportunityId } = await convertedLead('+919812300004', seller.token);
    const other = await req('post', '/api/v1/leads', { fullName: 'Asha V.', mobile: '+919812300006', productInterest: 'HEALTH', source: 'REFERRAL',
      consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'], purposes: ['SERVICE'] } });
    const survivorId = other.body.partyId as string;
    expect(survivorId).not.toBe(partyId);
    await publish('party.party.merged', survivorId, { survivorId, mergedId: partyId });
    expect((await req('get', `/api/v1/leads/${leadId}`)).body.partyId).toBe(survivorId);
    expect((await opportunity(opportunityId))?.partyId).toBe(survivorId);
  });

  it('AC-M04-18 insurer-confirmed issuance marks the opportunity ISSUED exactly once', async () => {
    const seller = await setupSellerWithRouting(t, 'sub_issue');
    const { opportunityId } = await convertedLead('+919812300005', seller.token);
    for (const to of ['QUOTE_SHARED', 'PROPOSAL_COMPLETE', 'INSURER_PENDING']) {
      expect((await req('post', `/api/v1/opportunities/${opportunityId}/stage-transitions`, { to }, seller.token)).status).toBe(200);
    }
    const issued = { proposalId: 'prp_1', opportunityId, policySaleId: 'ps_1' };
    await publish('proposal.policy.issued', 'prp_1', issued, 'evt_issue');
    await publish('proposal.policy.issued', 'prp_1', { ...issued, policySaleId: 'ps_2' }, 'evt_issue_again');
    expect(await opportunity(opportunityId)).toBeUndefined(); // ISSUED leaves the open board
    const issuedEvents = t.app.get<InMemoryOutbox>(OUTBOX).events.filter((e) => e.type === 'crm.opportunity.issued');
    expect(issuedEvents.map((e) => e.data)).toEqual([{ opportunityId, policySaleId: 'ps_1' }]);
  });
});
