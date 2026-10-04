import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PartyModule } from '../../src/modules/party/party.module';
import { createTestApp, TestApp } from '../support/test-app';
import { customFieldOverrides } from '../support/custom-field-defs';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';

const JOHN = { segment: 'RETAIL', occupation: 'Architect' };
const JON = { segment: 'HNI', occupation: 'Clerk', income_paise: 5_000_000 };

/** AC-CR001-08 (M03 part): merge copies missing custom-field keys to the survivor; reversal restores both sets. */
describe('AC-CR001-08 party merge and custom fields', () => {
  let app: TestApp;
  let johnId: string;
  let jonId: string;
  const seller = () => tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId: 'member_1', orgUnitId: 'ou_root' });
  const manager = () => tokenFor({ tenantId: 'ten_acme', roles: ['BRANCH_MANAGER'], memberId: 'member_mgr', orgUnitId: 'ou_root' });
  const get = (path: string) => app.http.get(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${manager()}`);
  const post = (path: string, body?: object, token = manager()) =>
    app.http
      .post(path)
      .set('Host', 'acme.iap.test')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', newIdempotencyKey())
      .send(body);
  const create = async (body: object): Promise<string> => {
    const res = await post('/api/v1/parties', body, seller());
    expect(res.status).toBe(201);
    return res.body.party.id;
  };

  beforeEach(async () => {
    app = await createTestApp({ imports: [PartyModule], overrides: customFieldOverrides() });
    johnId = await create({
      kind: 'PERSON',
      displayName: 'John Doe',
      contacts: [{ channel: 'MOBILE', value: '+919876543210' }],
      pan: 'AAAAA0000A',
      customFields: JOHN,
    });
    jonId = await create({
      kind: 'PERSON',
      displayName: 'Jon Doe',
      contacts: [{ channel: 'EMAIL', value: 'jon@example.com' }],
      pan: 'aaaaa0000a',
      customFields: JON,
    });
  });
  afterEach(async () => {
    await app.close();
  });

  it('AC-CR001-08 the survivor keeps its values, gains the missing keys, and reversal restores both sets', async () => {
    const queue = await get('/api/v1/duplicates');
    const candidate = queue.body.items[0];
    const survivorSide = candidate.a.id === johnId ? 'A' : 'B';
    const merged = await post(`/api/v1/duplicates/${candidate.id}/merge`, { survivor: survivorSide, choices: [] });
    expect(merged.status).toBe(200);
    expect(merged.body.survivorId).toBe(johnId);

    expect((await get(`/api/v1/parties/${johnId}`)).body.customFields).toEqual({
      segment: 'RETAIL',
      occupation: 'Architect',
      income_paise: 5_000_000,
    });
    expect((await get(`/api/v1/parties/${jonId}`)).body.customFields).toEqual(JON);

    const reversal = await post(`/api/v1/merges/${merged.body.mergeId}/reversal`);
    expect(reversal.status).toBe(200);
    expect((await get(`/api/v1/parties/${johnId}`)).body.customFields).toEqual(JOHN);
    expect((await get(`/api/v1/parties/${jonId}`)).body.customFields).toEqual(JON);
  });
});
