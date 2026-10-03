import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createHmac } from 'node:crypto';
import { CrmModule } from '../../src/modules/crm/crm.module';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { OUTBOX, OUTBOX_RELAY } from '../../src/kernel/tokens';
import { OutboxRelay } from '../../src/kernel/outbox/outbox-relay';
import { InMemoryOutbox } from '../../src/kernel/outbox/outbox';
import { FakeTwentyClient } from '../../src/modules/crm/infrastructure/twenty/fake-twenty.client';
import { DerivedTwentyWorkspaceDirectory } from '../../src/modules/crm/infrastructure/twenty/derived-workspace.directory';
import { TWENTY_WORKSPACE_DIRECTORY } from '../../src/modules/crm/application/twenty-sync.ports';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';
import { setupSellerWithRouting } from './fixtures';

const WS = 'ws_ten_acme';
const HOST = 'acme.iap.test';

/** AC-M04-22/23/24: minimised projection to Twenty, degraded mode with retries, signed inbound webhooks. */
describe('AC-M04-22/23/24 Twenty projection and sync', () => {
  let t: TestApp;
  const admin = () => tokenFor({ tenantId: 'ten_acme', roles: ['TENANT_ADMIN'], memberId: 'member_admin' });
  const twenty = () => t.app.get(FakeTwentyClient);
  const relay = () => t.app.get<OutboxRelay>(OUTBOX_RELAY).relayOnce();
  const capture = async (mobile = '+919876500001') => {
    const res = await t.http.post('/api/v1/leads').set('Host', HOST).set('Authorization', `Bearer ${admin()}`).set('Idempotency-Key', newIdempotencyKey())
      .send({ fullName: 'Asha Verma', mobile, email: 'asha@example.com', pincode: '110001', productInterest: 'TERM_LIFE', source: 'WEB_FORM',
        consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'], purposes: ['SERVICE'] } });
    expect(res.status).toBe(201);
    return res.body as { leadId: string; partyId: string; ownerMemberId?: string };
  };
  const lead = async (id: string) => (await t.http.get(`/api/v1/leads/${id}`).set('Host', HOST).set('Authorization', `Bearer ${admin()}`)).body;

  beforeEach(async () => {
    t = await createTestApp({ imports: [CrmModule, DistributionModule] });
  });
  afterEach(async () => t.close());

  describe('Outbound projection', () => {
    it('AC-M04-22 a captured lead is projected with allow-listed fields only, and its person with masked contacts', async () => {
      const { leadId, partyId } = await capture();
      await relay();
      const projected = twenty().find('lead', leadId);
      expect(projected?.workspaceId).toBe(WS);
      expect(Object.keys(projected?.fields ?? {}).sort()).toEqual(
        ['core_id', 'core_party_id', 'created_at', 'owner_core_member_id', 'product_interest', 'sla_due_at', 'source', 'stage', 'temperature'],
      );
      const person = twenty().find('person', partyId)?.fields ?? {};
      expect(Object.keys(person).sort()).toEqual(['can_contact', 'core_party_id', 'email_masked', 'language', 'name', 'phone_masked']);
      expect(person).toMatchObject({ name: 'Asha Verma', can_contact: true });
      const everything = JSON.stringify([...twenty().records.values()]);
      expect(everything).not.toContain('9876500001');
      expect(everything).not.toContain('asha@example.com');
      expect(everything).not.toContain('110001');
      expect((await lead(leadId)).syncState).toBe('synced');
    });

    it('AC-M04-22 a later change updates the same Twenty record (externalRef reused)', async () => {
      const { leadId } = await capture();
      await relay();
      const first = twenty().find('lead', leadId)?.id;
      const res = await t.http.post(`/api/v1/leads/${leadId}/stage-transitions`).set('Host', HOST).set('Authorization', `Bearer ${admin()}`)
        .set('Idempotency-Key', newIdempotencyKey()).send({ to: 'LOST', lostReason: 'NOT_INTERESTED' });
      expect(res.status).toBe(200);
      await relay();
      expect(twenty().find('lead', leadId)).toMatchObject({ id: first, fields: { stage: 'LOST' } });
      expect([...twenty().records.values()].filter((r) => r.object === 'lead')).toHaveLength(1);
    });
  });

  describe('Degraded mode', () => {
    it('AC-M04-23 capture succeeds while Twenty is down (pending → failed), and syncs once Twenty recovers', async () => {
      twenty().failing = true;
      const { leadId } = await capture();
      expect((await lead(leadId)).syncState).toBe('pending');
      await relay();
      expect((await lead(leadId)).syncState).toBe('failed');
      expect(t.metrics.counter('crm_sync_total', 'Twenty sync attempts', ['object', 'outcome']).get({ object: 'lead', outcome: 'failed' })).toBe(1);
      twenty().failing = false;
      await relay();
      expect((await lead(leadId)).syncState).toBe('synced');
      expect(twenty().find('lead', leadId)?.fields.core_id).toBe(leadId);
    });

    it('AC-M04-23 after three failed deliveries the sync event is dead-lettered and no longer retried', async () => {
      twenty().failing = true;
      const { leadId } = await capture();
      await relay();
      await relay();
      await relay();
      const outbox = t.app.get<InMemoryOutbox>(OUTBOX);
      expect(outbox.deadLettered().filter((e) => e.type === 'crm.sync.requested' && e.subject === leadId)).toHaveLength(1);
      twenty().failing = false;
      expect((await relay()).published).toBe(0);
      expect((await lead(leadId)).syncState).toBe('failed');
    });

    it('AC-M04-23 an answer from another workspace is rejected, security-logged and never recorded', async () => {
      twenty().answerFromWorkspace = 'ws_ten_zen';
      const { leadId } = await capture();
      await relay();
      const leadMismatch = t.logs.byEvent('security.twenty_workspace_mismatch').filter((r) => r.ctx?.object === 'lead');
      expect(leadMismatch).toHaveLength(1);
      expect(leadMismatch[0]).toMatchObject({ channel: 'security', ctx: { expected: WS, returned: 'ws_ten_zen' } });
      expect((await lead(leadId)).syncState).toBe('failed');
      twenty().answerFromWorkspace = undefined;
      await relay(); // retry from scratch: no externalRef was kept, so a new record is created rather than patching the foreign one
      expect((await lead(leadId)).syncState).toBe('synced');
    });
  });

  describe('Inbound webhooks', () => {
    const now = () => Math.floor(t.clock.now().getTime() / 1000);
    const sign = (body: string, ts: number, workspace = WS) =>
      createHmac('sha256', t.app.get<DerivedTwentyWorkspaceDirectory>(TWENTY_WORKSPACE_DIRECTORY).webhookSecret(workspace)).update(`${ts}.${body}`).digest('hex');
    const send = (payload: object, opts: { ts?: number; signature?: string; workspace?: string } = {}) => {
      const body = JSON.stringify(payload);
      const ts = opts.ts ?? now();
      const workspace = opts.workspace ?? WS;
      return t.http.post(`/api/v1/webhooks/twenty/${workspace}`).set('Content-Type', 'application/json')
        .set('x-twenty-timestamp', String(ts)).set('x-twenty-signature', opts.signature ?? sign(body, ts, workspace)).send(body);
    };
    const later = '2026-01-01T00:05:00.000Z';

    it('AC-M04-24 an invalid signature is 401 and security-logged; nothing is applied', async () => {
      const res = await send({ id: 'evt_1', object: 'lead', updatedAt: later, record: { coreId: 'lead_x' } }, { signature: 'f'.repeat(64) });
      expect([res.status, res.body.code]).toEqual([401, 'invalid_signature']);
      expect(t.logs.byEvent('security.twenty_webhook_invalid_signature')).toHaveLength(1);
    });

    it('AC-M04-24 an unknown workspace is refused exactly like a bad signature', async () => {
      const res = await send({ id: 'evt_1', object: 'lead', updatedAt: later, record: { coreId: 'lead_x' } }, { workspace: 'ws_ten_nobody' });
      expect([res.status, res.body.code]).toEqual([401, 'invalid_signature']);
    });

    it('AC-M04-24 a correctly signed but stale timestamp (outside 5 minutes) is rejected', async () => {
      const res = await send({ id: 'evt_1', object: 'lead', updatedAt: later, record: { coreId: 'lead_x' } }, { ts: now() - 301 });
      expect([res.status, res.body.code]).toEqual([401, 'stale_webhook']);
      expect(t.logs.byEvent('security.twenty_webhook_stale')).toHaveLength(1);
    });

    it('AC-M04-24 an owner change from Twenty is applied once; a duplicate event id is not reprocessed', async () => {
      const a = await setupSellerWithRouting(t, 'tw_a');
      const b = await setupSellerWithRouting(t, 'tw_b');
      const { leadId, ownerMemberId } = await capture();
      const to = ownerMemberId === a.memberId ? b.memberId : a.memberId;
      const event = { id: 'evt_owner', object: 'lead', updatedAt: later, record: { coreId: leadId, ownerCoreMemberId: to } };
      const first = await send(event);
      expect([first.status, first.body]).toEqual([200, { outcome: 'applied' }]);
      expect((await lead(leadId)).ownerMemberId).toBe(to);
      const again = await send(event);
      expect(again.body).toEqual({ outcome: 'duplicate' });
    });

    it('AC-M04-24 an owner change older than the Core record, or to an ineligible member, is not applied', async () => {
      await setupSellerWithRouting(t, 'tw_c');
      const { leadId, ownerMemberId } = await capture();
      const stale = await send({ id: 'evt_stale', object: 'lead', updatedAt: '2025-12-31T23:00:00.000Z', record: { coreId: leadId, ownerCoreMemberId: 'mem_other' } });
      expect(stale.body).toEqual({ outcome: 'stale' });
      const ineligible = await send({ id: 'evt_inel', object: 'lead', updatedAt: later, record: { coreId: leadId, ownerCoreMemberId: 'mem_unknown' } });
      expect(ineligible.body).toEqual({ outcome: 'ineligible_owner' });
      expect((await lead(leadId)).ownerMemberId).toBe(ownerMemberId);
    });

    it('AC-M04-24 Twenty owns task status: DONE completes the open Core task', async () => {
      const seller = await setupSellerWithRouting(t, 'tw_d');
      const { leadId } = await capture();
      type View = { id: string; subjectId: string };
      const open = async () => {
        const res = await t.http.get('/api/v1/tasks?mine=true').set('Host', HOST).set('Authorization', `Bearer ${seller.token}`);
        return (res.body.groups as Array<{ items: View[] }>).flatMap((g) => g.items);
      };
      const task = (await open()).find((x) => x.subjectId === leadId);
      expect(task).toBeDefined();
      const res = await send({ id: 'evt_task', object: 'task', updatedAt: later, record: { coreId: task?.id, status: 'DONE' } });
      expect(res.body).toEqual({ outcome: 'applied' });
      expect((await open()).map((x) => x.id)).not.toContain(task?.id); // open tasks only
    });

    it('AC-M04-24 Core owns the person name: a Twenty edit becomes a change request (field names only) and Core values are projected back', async () => {
      const { leadId, partyId } = await capture();
      await relay();
      const res = await send({ id: 'evt_person', object: 'person', updatedAt: later, record: { coreId: partyId, name: 'A. Verma (edited)' } });
      expect(res.body).toEqual({ outcome: 'change_request' });
      const outbox = t.app.get<InMemoryOutbox>(OUTBOX);
      const request = outbox.events.find((e) => e.type === 'crm.change_request.created');
      expect(request?.data).toEqual({ partyId, fields: ['name'], source: 'twenty' });
      expect(JSON.stringify(outbox.events)).not.toContain('A. Verma (edited)');
      await relay();
      expect(twenty().find('person', partyId)?.fields.name).toBe('Asha Verma');
      expect((await lead(leadId)).name).toBe('Asha Verma');
    });

    it('AC-M04-24 a malformed payload with a valid signature is a 400', async () => {
      const res = await send({ id: 'evt_bad', object: 'invoice', updatedAt: later, record: {} });
      expect([res.status, res.body.code]).toEqual([400, 'invalid_webhook']);
    });
  });
});
