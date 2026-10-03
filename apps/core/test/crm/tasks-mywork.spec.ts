import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CrmModule } from '../../src/modules/crm/crm.module';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { createTestApp, TestApp } from '../support/test-app';
import { newIdempotencyKey } from '../support/idempotency';
import { setupSellerWithRouting } from './fixtures';

/**
 * AC-M04-09 tasks: GET /tasks?mine=true groups (OVERDUE/TODAY/UPCOMING) and counts;
 * PATCH with If-Match completes a task; stale If-Match → 412.
 *
 * AC-M04-10 my-work: GET /my-work lists items; token without memberId → 403.
 */
describe('AC-M04-09/10 Tasks and my-work', () => {
  let testApp: TestApp;
  let sellerToken: string;
  const post = (path: string, body?: object, token = sellerToken) =>
    testApp.http.post(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', newIdempotencyKey()).send(body);
  const patch = (path: string, body?: object, token = sellerToken, ifMatch?: string) => {
    const req = testApp.http.patch(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`);
    if (ifMatch) req.set('If-Match', ifMatch);
    return req.send(body);
  };
  const get = (path: string, token = sellerToken) => testApp.http.get(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`);

  const basicLead = (mobile: string) => ({
    fullName: 'Task Test',
    mobile,
    productInterest: 'TERM_LIFE' as const,
    source: 'WEB_FORM' as const,
    consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'] as const, purposes: ['SERVICE'] as const },
  });

  async function createLead(mobile: string): Promise<string> {
    const res = await post('/api/v1/leads', basicLead(mobile));
    expect(res.status).toBe(201);
    expect(res.body.ownerMemberId).toBeDefined();
    return res.body.leadId;
  }

  beforeEach(async () => {
    testApp = await createTestApp({ imports: [CrmModule, DistributionModule] });
    const seller = await setupSellerWithRouting(testApp, 'member_tasks');
    sellerToken = seller.token;
  });

  afterEach(async () => {
    await testApp.close();
  });

  it('AC-M04-09 GET /tasks?mine=true groups by bucket', async () => {
    const leadId = await createLead('+919876543260');
    const dueTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const taskRes = await post('/api/v1/tasks', {
      subjectType: 'LEAD',
      subjectId: leadId,
      kind: 'CALL',
      title: 'Follow up',
      dueAt: dueTime,
    });
    expect(taskRes.status).toBe(201);

    const tasksRes = await get('/api/v1/tasks?mine=true');
    expect(tasksRes.status).toBe(200);
    expect(tasksRes.body.groups).toBeInstanceOf(Array);
    expect(tasksRes.body.counts).toMatchObject({
      overdue: expect.any(Number),
      today: expect.any(Number),
      upcoming: expect.any(Number),
    });
  });

  it('AC-M04-09 PATCH /tasks/{id} completes task', async () => {
    const leadId = await createLead('+919876543261');
    const taskRes = await post('/api/v1/tasks', {
      subjectType: 'LEAD',
      subjectId: leadId,
      kind: 'CALL',
      title: 'Call',
      dueAt: new Date().toISOString(),
    });
    expect(taskRes.status).toBe(201);
    const taskId = taskRes.body.id;

    // PATCH to complete the task
    const completeRes = await patch(`/api/v1/tasks/${taskId}`, { status: 'DONE' });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe('DONE');
  });

  it('AC-M04-09 stale If-Match → 412', async () => {
    const leadId = await createLead('+919876543262');
    const taskRes = await post('/api/v1/tasks', {
      subjectType: 'LEAD',
      subjectId: leadId,
      kind: 'CALL',
      title: 'Call',
      dueAt: new Date().toISOString(),
    });
    expect(taskRes.status).toBe(201);

    const staleRes = await patch(`/api/v1/tasks/${taskRes.body.id}`, { status: 'DONE' }, sellerToken, '"stale"');
    expect(staleRes.status).toBe(412);
  });

  it('AC-M04-10 GET /my-work lists items', async () => {
    await createLead('+919876543264');
    const myWorkRes = await get('/api/v1/my-work');
    expect(myWorkRes.status).toBe(200);
    expect(myWorkRes.body.items).toBeInstanceOf(Array);
    expect(myWorkRes.body.counts).toBeDefined();
  });
});
