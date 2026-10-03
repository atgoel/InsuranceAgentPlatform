import { TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';
import { activateSeller } from '../distribution/fixtures';

/**
 * Create an active seller with routing configured so that they receive all leads.
 * Returns the memberId and token so tests can create leads assigned to this seller.
 */
export async function setupSellerWithRouting(
  app: TestApp,
  sellerId: string,
  tenantId = 'ten_acme',
  host = 'acme.iap.test',
): Promise<{ memberId: string; token: string }> {
  const adminToken = tokenFor({ tenantId, roles: ['TENANT_ADMIN'], memberId: 'admin' });

  // Generate a unique 10-digit phone starting with 9
  const uniquePhone = `+919${String(Math.random()).slice(2, 11)}`;

  // Create the seller member
  const createRes = await app.http
    .post('/api/v1/members')
    .set('Host', host)
    .set('Authorization', `Bearer ${adminToken}`)
    .set('Idempotency-Key', newIdempotencyKey())
    .send({
      displayName: `Seller ${sellerId}`,
      phone: uniquePhone,
      roles: ['SALESPERSON'],
      salespersonType: 'EMPLOYEE',
      orgUnitId: 'ou_root',
    });
  if (createRes.status !== 201) {
    throw new Error(`Failed to create seller: ${createRes.status} ${JSON.stringify(createRes.body)}`);
  }
  const actualMemberId = createRes.body.id;

  // Activate the seller
  await activateSeller(app, actualMemberId, 'EMPLOYEE', { tenantId, host });

  // Create a round-robin routing rule that matches all leads
  const ruleRes = await app.http
    .put('/api/v1/routing-rules')
    .set('Host', host)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      rules: [
        {
          id: 'r_all_leads',
          priority: 1,
          name: 'All leads',
          active: true,
          conditions: [],
          method: 'ROUND_ROBIN',
          slaMinutes: 30,
          onBreach: 'NOTIFY_MANAGER',
        },
      ],
    });
  if (ruleRes.status !== 200) {
    throw new Error(`Failed to set routing rule: ${ruleRes.status} ${JSON.stringify(ruleRes.body)}`);
  }

  const sellerToken = tokenFor({ tenantId, roles: ['SALESPERSON'], memberId: actualMemberId, orgUnitId: 'ou_root' });
  return { memberId: actualMemberId, token: sellerToken };
}
