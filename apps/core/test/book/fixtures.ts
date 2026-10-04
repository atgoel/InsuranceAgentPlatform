import { TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';
export const ownerToken = () => tokenFor({ tenantId: 'ten_acme', roles: ['TENANT_ADMIN'], memberId: 'member_1', orgUnitId: 'org_1' });
export const otherToken = () => tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId: 'member_other', orgUnitId: 'org_1' });
export const zenToken = () => tokenFor({ tenantId: 'ten_zen', roles: ['TENANT_ADMIN'], memberId: 'zen_member' });
export function req(
  app: TestApp,
  method: 'get' | 'post' | 'patch' | 'put',
  path: string,
  auth: string | { token: string; host: string } = ownerToken(),
) {
  const token = typeof auth === 'string' ? auth : auth.token;
  const host = typeof auth === 'string' ? 'acme.iap.test' : auth.host;
  const r = app.http[method](`/api/v1${path}`).set('Host', host).set('Authorization', `Bearer ${token}`);
  return method === 'post' ? r.set('Idempotency-Key', newIdempotencyKey()) : r;
}
export async function party(app: TestApp) {
  const r = await req(app, 'post', '/parties').send({
    kind: 'PERSON',
    displayName: 'Book Person',
    contacts: [{ channel: 'MOBILE', value: '+919876500777' }],
  });
  if (r.status !== 201) throw new Error(`party creation ${r.status}: ${JSON.stringify(r.body)}`);
  return String(r.body.party.id);
}
export function input(partyId: string, extra: Record<string, unknown> = {}) {
  return {
    proposerPartyId: partyId,
    policyNumber: 'POL9001234',
    line: 'LIFE',
    insurerName: 'Insurer',
    productName: 'Term Cover',
    mode: 'MONTHLY',
    commercials: {
      category: 'TERM',
      line: 'LIFE',
      businessType: 'FRESH',
      bookedOn: '2026-01-31',
      commencementDate: '2026-01-31',
      premiumNetPaise: 10000,
      premiumTaxPaise: 0,
      premiumGrossPaise: 10000,
    },
    nextDueDate: '2026-10-03',
    asOf: '2026-10-03',
    ...extra,
  };
}
export async function register(app: TestApp, extra: Record<string, unknown> = {}) {
  const partyId = await party(app);
  const r = await req(app, 'post', '/held-policies').send(input(partyId, extra));
  if (r.status !== 201) throw new Error(`policy creation ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body as { id: string; version: number; [key: string]: unknown };
}
export const importRow = {
  policyNumber: 'POL8884321',
  insurerName: 'Insurer',
  productName: 'Term',
  holderName: 'Import Person',
  mobile: '+919876500888',
  dob: '1990-02-28',
  premium: '1000',
  mode: 'ANNUAL',
  commencementDate: '2026-01-01',
  nextDueDate: '2027-01-01',
  category: 'TERM',
};
export const mapping = Object.fromEntries(Object.keys(importRow).map((key) => [key, key]));
