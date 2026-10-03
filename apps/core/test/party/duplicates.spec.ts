import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PartyModule } from '../../src/modules/party/party.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';
import { PARTY_FACADE, PartyFacade } from '../../src/modules/party/application/ports';
import { UNIT_OF_WORK } from '../../src/kernel/tokens';
import { UnitOfWork } from '../../src/kernel/persistence/unit-of-work';

/**
 * AC-M03-07 duplicate queue, AC-M03-09 reviewed merge and 30-day reversal, AC-M03-13 scope/isolation.
 * Fixtures: two parties owned by a salesperson in ou_root sharing a PAN (score 100).
 */
describe('AC-M03-07/09 Duplicate queue and merge endpoints', () => {
  let testApp: TestApp;
  let johnId: string;
  let jonId: string;
  const seller = () => tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId: 'member_1', orgUnitId: 'ou_root' });
  const manager = () => tokenFor({ tenantId: 'ten_acme', roles: ['BRANCH_MANAGER'], memberId: 'member_mgr', orgUnitId: 'ou_root' });
  const get = (path: string, token = manager()) => testApp.http.get(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`);
  const post = (path: string, body?: object, token = manager()) =>
    testApp.http.post(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', newIdempotencyKey()).send(body);

  async function createParty(body: object): Promise<string> {
    const res = await post('/api/v1/parties', body, seller());
    expect(res.status).toBe(201);
    return res.body.party.id;
  }

  async function onlyCandidate(): Promise<{ id: string; a: { id: string }; b: { id: string }; score: number; rule: string; explanation: string }> {
    const res = await get('/api/v1/duplicates');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    return res.body.items[0];
  }

  beforeEach(async () => {
    testApp = await createTestApp({ imports: [PartyModule] });
    johnId = await createParty({
      kind: 'PERSON', displayName: 'John Doe', contacts: [{ channel: 'MOBILE', value: '+919876543210' }], pan: 'AAAAA0000A', tags: ['vip'],
      consent: [{ purpose: 'MARKETING', channel: 'SMS', granted: true, noticeVersion: 'n1', source: 'ASSISTED' }],
    });
    jonId = await createParty({
      kind: 'PERSON', displayName: 'Jon Doe', contacts: [{ channel: 'EMAIL', value: 'jon@example.com' }], pan: 'aaaaa0000a', tags: ['renewal'],
    });
  });

  afterEach(async () => {
    await testApp.close();
  });

  describe('GET /duplicates', () => {
    it('lists the same-PAN pair once with score 100, both sides as masked list items', async () => {
      const c = await onlyCandidate();
      expect(c.score).toBe(100);
      expect(c.explanation).toMatch(/PAN/);
      expect([c.a.id, c.b.id].sort()).toEqual([johnId, jonId].sort());
      expect(JSON.stringify(c)).not.toContain('AAAAA0000A');
      expect(JSON.stringify(c)).not.toContain('9876543210');
    });

    it('requires party.merge (salespeople cannot review duplicates)', async () => {
      const res = await get('/api/v1/duplicates', seller());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('permission_denied');
    });

    it('hides pairs outside the reviewer’s record scope', async () => {
      const otherBranchManager = tokenFor({ tenantId: 'ten_acme', roles: ['BRANCH_MANAGER'], memberId: 'member_x', orgUnitId: 'ou_elsewhere' });
      const res = await get('/api/v1/duplicates', otherBranchManager);
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
    });

    it('never matches across tenants (F40)', async () => {
      const zenSeller = tokenFor({ tenantId: 'ten_zen', roles: ['SALESPERSON'], memberId: 'member_z', orgUnitId: 'ou_root' });
      const res = await testApp.http
        .post('/api/v1/parties').set('Host', 'zen.iap.test').set('Authorization', `Bearer ${zenSeller}`).set('Idempotency-Key', newIdempotencyKey())
        .send({ kind: 'PERSON', displayName: 'John Doe', contacts: [{ channel: 'MOBILE', value: '+919876543210' }], pan: 'AAAAA0000A' });
      expect(res.status).toBe(201);
      expect(res.body.duplicateCandidates).toEqual([]);
    });
  });

  describe('GET /duplicates/{id}/comparison', () => {
    it('compares field by field with masked contacts, DOB year only and PAN last four', async () => {
      const c = await onlyCandidate();
      const res = await get(`/api/v1/duplicates/${c.id}/comparison`);
      expect(res.status).toBe(200);
      const byField = Object.fromEntries(res.body.fields.map((f: { field: string; a: unknown; b: unknown }) => [f.field, [f.a, f.b]]));
      expect(byField.pan).toEqual(['XXXXXX000A', 'XXXXXX000A']);
      expect(byField.displayName.sort()).toEqual(['John Doe', 'Jon Doe']);
      expect(JSON.stringify(res.body)).not.toContain('9876543210');
      expect(JSON.stringify(res.body)).not.toContain('jon@example.com');
    });

    it('returns 404 for an unknown candidate', async () => {
      expect((await get('/api/v1/duplicates/dup_missing/comparison')).status).toBe(404);
    });
  });

  describe('POST /duplicates/{id}/merge and /merges/{id}/reversal', () => {
    it('merges with survivor choices, unions contacts and tags, carries consent, and removes the merged party from lists', async () => {
      const c = await onlyCandidate();
      const survivorSide = c.a.id === johnId ? 'A' : 'B';
      const res = await post(`/api/v1/duplicates/${c.id}/merge`, { survivor: survivorSide, choices: [{ field: 'displayName', from: survivorSide }] });
      expect(res.status).toBe(200);
      expect(res.body.survivorId).toBe(johnId);
      expect(res.body.mergedId).toBe(jonId);
      expect(Date.parse(res.body.reversibleUntil) - testApp.clock.now().getTime()).toBe(30 * 86_400_000);

      const survivor = await get(`/api/v1/parties/${johnId}`, seller());
      expect(survivor.status).toBe(200);
      expect(survivor.body.displayName).toBe('John Doe');
      expect(survivor.body.contacts.map((x: { channel: string }) => x.channel).sort()).toEqual(['EMAIL', 'MOBILE']);
      expect(survivor.body.tags.sort()).toEqual(['renewal', 'vip']);

      const list = await get('/api/v1/parties', seller());
      expect(list.body.items.map((p: { id: string }) => p.id)).toEqual([johnId]);
      expect((await get('/api/v1/duplicates')).body.items).toEqual([]);
    });

    it('re-points the merged party’s consent history to the survivor with merge evidence', async () => {
      const c = await onlyCandidate();
      // jon gives a WhatsApp marketing grant; john survives
      expect((await post(`/api/v1/parties/${jonId}/consents`, { purpose: 'MARKETING', channel: 'WHATSAPP', granted: true, noticeVersion: 'n2', source: 'WEB_FORM' }, seller())).status).toBe(201);
      const merged = await post(`/api/v1/duplicates/${c.id}/merge`, { survivor: c.a.id === johnId ? 'A' : 'B', choices: [] });
      expect(merged.status).toBe(200);

      const ledger = await get(`/api/v1/parties/${johnId}/consents`, seller());
      const copied = ledger.body.history.filter((r: { channel: string }) => r.channel === 'WHATSAPP');
      expect(copied).toHaveLength(1);
      expect(copied[0].evidenceRef).toBe(`merge:${merged.body.mergeId}`);
    });

    it('reverses within 30 days, restoring the merged party; a second reversal is refused', async () => {
      const c = await onlyCandidate();
      const merged = await post(`/api/v1/duplicates/${c.id}/merge`, { survivor: c.a.id === johnId ? 'A' : 'B', choices: [] });
      expect(merged.status).toBe(200);

      testApp.clock.advance(29 * 86_400_000);
      const reversal = await post(`/api/v1/merges/${merged.body.mergeId}/reversal`);
      expect(reversal.status).toBe(200);
      expect(reversal.body).toEqual({ restoredPartyId: jonId });
      expect((await get(`/api/v1/parties/${jonId}`, seller())).body.status).toBe('ACTIVE');

      const again = await post(`/api/v1/merges/${merged.body.mergeId}/reversal`);
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('merge_already_reversed');
    });

    it('moves role links to the survivor and, on reversal, moves exactly those links back', async () => {
      const facade = testApp.app.get<PartyFacade>(PARTY_FACADE);
      const uow = testApp.app.get<UnitOfWork>(UNIT_OF_WORK);
      await uow.run('ten_acme', async (tx) => {
        await facade.linkRole(tx, { partyId: johnId, role: 'PROPOSER', subjectType: 'PROPOSAL', subjectId: 'prp_john' });
        await facade.linkRole(tx, { partyId: jonId, role: 'INSURED', subjectType: 'HELD_POLICY', subjectId: 'pol_jon', label: 'health' });
      });
      const c = await onlyCandidate();
      const merged = await post(`/api/v1/duplicates/${c.id}/merge`, { survivor: c.a.id === johnId ? 'A' : 'B', choices: [] });
      expect(merged.status).toBe(200);
      const roleSubjects = async (id: string) => (await get(`/api/v1/parties/${id}`, seller())).body.roles.map((r: { subjectId: string }) => r.subjectId).sort();
      expect(await roleSubjects(johnId)).toEqual(['pol_jon', 'prp_john']);

      expect((await post(`/api/v1/merges/${merged.body.mergeId}/reversal`)).status).toBe(200);
      expect(await roleSubjects(johnId)).toEqual(['prp_john']);
      expect(await roleSubjects(jonId)).toEqual(['pol_jon']);
    });

    it('refuses reversal after 30 days', async () => {
      const c = await onlyCandidate();
      const merged = await post(`/api/v1/duplicates/${c.id}/merge`, { survivor: 'A', choices: [] });
      expect(merged.status).toBe(200);
      testApp.clock.advance(31 * 86_400_000);
      const res = await post(`/api/v1/merges/${merged.body.mergeId}/reversal`);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('merge_not_reversible');
    });

    it('requires an Idempotency-Key and party.merge', async () => {
      const c = await onlyCandidate();
      const noKey = await testApp.http
        .post(`/api/v1/duplicates/${c.id}/merge`).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${manager()}`).send({ survivor: 'A', choices: [] });
      expect(noKey.status).toBe(400);
      expect((await post(`/api/v1/duplicates/${c.id}/merge`, { survivor: 'A', choices: [] }, seller())).status).toBe(403);
    });
  });

  describe('POST /duplicates/{id}/dismissal', () => {
    it('dismisses the candidate so it leaves the queue and can no longer be merged', async () => {
      const c = await onlyCandidate();
      expect((await post(`/api/v1/duplicates/${c.id}/dismissal`)).status).toBe(204);
      expect((await get('/api/v1/duplicates')).body.items).toEqual([]);
      const merge = await post(`/api/v1/duplicates/${c.id}/merge`, { survivor: 'A', choices: [] });
      expect(merge.status).toBe(409);
      expect(merge.body.code).toBe('candidate_closed');
    });
  });
});
