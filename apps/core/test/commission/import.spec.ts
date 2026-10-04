import { CommissionModule } from '../../src/modules/commission/commission.module';
import { COMMISSION_IMPORT_PORT, CommissionImportPort } from '../../src/modules/commission/application/ports';
import { UNIT_OF_WORK } from '../../src/kernel/tokens';
import { UnitOfWork } from '../../src/kernel/persistence/unit-of-work';
import { createTestApp, TestApp } from '../support/test-app';
describe('AC-CR001-03 commission register import', () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp({ imports: [CommissionModule] });
  });
  afterEach(async () => {
    await app?.close();
  });
  it('appends one RECEIVED entry per tenant import key and validates integer money', async () => {
    const port = app.app.get<CommissionImportPort>(COMMISSION_IMPORT_PORT),
      uow = app.app.get<UnitOfWork>(UNIT_OF_WORK);
    const input = {
      heldPolicyId: 'hp1',
      sellerMemberId: 'member_1',
      amountPaise: 374565,
      occurredOn: '2026-10-03',
      invoiceNo: 'GST/01',
      importKey: 'batch1:1',
    };
    const a = await uow.run('ten_acme', (tx) => port.recordReceived(tx, input));
    expect(await uow.run('ten_acme', (tx) => port.recordReceived(tx, input))).toEqual({ ...a, created: false });
    expect((await uow.run('ten_zen', (tx) => port.recordReceived(tx, input))).id).not.toBe(a.id);
    await expect(uow.run('ten_acme', (tx) => port.recordReceived(tx, { ...input, amountPaise: 1.5 }))).rejects.toMatchObject({
      code: 'money_not_integer',
    });
  });
});
