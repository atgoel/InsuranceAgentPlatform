import { CrmModule } from '../../src/modules/crm/crm.module';
import { RENEWAL_OPPORTUNITY_PORT, RenewalOpportunityPort } from '../../src/modules/crm/application/renewal-opportunity.port';
import { UNIT_OF_WORK } from '../../src/kernel/tokens';
import { UnitOfWork } from '../../src/kernel/persistence/unit-of-work';
import { createTestApp, TestApp } from '../support/test-app';
describe('AC-M07-10 renewal CRM creation', () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp({ imports: [CrmModule] });
  });
  afterEach(async () => {
    await app.close();
  });
  it('replays the durable key and keeps one open renewal for a policy', async () => {
    const port = app.app.get<RenewalOpportunityPort>(RENEWAL_OPPORTUNITY_PORT);
    const uow = app.app.get<UnitOfWork>(UNIT_OF_WORK);
    const input = {
      heldPolicyId: 'hp1',
      renewalDate: '2027-10-03',
      partyId: 'p1',
      ownerMemberId: 'member_1',
      productName: 'Health',
      line: 'HEALTH' as const,
      premiumPaise: 10000,
    };
    const a = await uow.run('ten_acme', (tx) => port.ensure(tx, input));
    const b = await uow.run('ten_acme', (tx) => port.ensure(tx, input));
    const c = await uow.run('ten_acme', (tx) => port.ensure(tx, { ...input, renewalDate: '2028-10-03' }));
    expect(a.created).toBe(true);
    expect(b).toEqual({ ...a, created: false });
    expect(c).toEqual({ ...a, created: false });
  });
});
