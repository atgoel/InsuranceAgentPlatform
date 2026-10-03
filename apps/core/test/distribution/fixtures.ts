import { TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';

/** The invited member signs in for the first time: invited → active (non-sellers) or onboarding (sellers). */
export async function acceptInvitation(app: TestApp, memberId: string, tenantId = 'ten_acme', host = 'acme.iap.test'): Promise<string> {
  const res = await app.http
    .post('/api/v1/me/invitation-acceptance')
    .set('Host', host)
    .set('Authorization', `Bearer ${tokenFor({ tenantId, roles: [], memberId, sub: `user_${memberId}` })}`);
  if (res.status !== 200) throw new Error(`invitation acceptance failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.status as string;
}

/** Drives an invited seller through the whole onboarding checklist and activation (AC-M02-03/04). */
export async function activateSeller(app: TestApp, memberId: string, type: 'POSP' | 'EMPLOYEE', at: { tenantId: string; host: string } = { tenantId: 'ten_acme', host: 'acme.iap.test' }): Promise<void> {
  const { tenantId, host } = at;
  const { newIdempotencyKey } = await import('../support/idempotency');
  const admin = `Bearer ${tokenFor({ tenantId, roles: ['TENANT_ADMIN'] })}`;
  const post = (path: string, body?: object) => app.http.post(path).set('Host', host).set('Authorization', admin).set('Idempotency-Key', newIdempotencyKey()).send(body);
  const expectOk = (res: { status: number; body: unknown }, step: string) => {
    if (res.status >= 300) throw new Error(`${step} failed: ${res.status} ${JSON.stringify(res.body)}`);
  };
  await acceptInvitation(app, memberId, tenantId, host);
  const keys = type === 'POSP' ? ['IDENTITY_PAN', 'EXAM', 'CERTIFICATE'] : ['IDENTITY_PAN'];
  for (const key of keys) expectOk(await post(`/api/v1/members/${memberId}/onboarding/evidence`, { key, evidenceRef: `ev_${key}` }), key);
  if (type === 'POSP') expectOk(await post(`/api/v1/members/${memberId}/onboarding/training`, { hours: 15, evidenceRef: 'ev_training' }), 'training');
  expectOk(await app.http.put(`/api/v1/members/${memberId}/insurer-codes/ins_hdfc`).set('Host', host).set('Authorization', admin).send({ code: `HD-${memberId.slice(-6)}` }), 'insurer code');
  expectOk(await post(`/api/v1/members/${memberId}/activation`), 'activation');
}
