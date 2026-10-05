import { BookModule } from '../../src/modules/book/book.module';
import { PartyModule } from '../../src/modules/party/party.module';
import { PARTY_FACADE, PartyFacade } from '../../src/modules/party/application/ports';
import { UNIT_OF_WORK } from '../../src/kernel/tokens';
import { UnitOfWork } from '../../src/kernel/persistence/unit-of-work';
import { createTestApp, TestApp } from '../support/test-app';
import { input, req } from '../book/fixtures';

async function newParty(app: TestApp, name: string, mobile: string): Promise<string> {
  const r = await req(app, 'post', '/parties').send({ kind: 'PERSON', displayName: name, contacts: [{ channel: 'MOBILE', value: mobile }] });
  if (r.status !== 201) throw new Error(`party ${r.status}: ${JSON.stringify(r.body)}`);
  return String(r.body.party.id);
}

async function newPolicy(app: TestApp, partyId: string, number: string, extra: Record<string, unknown>): Promise<string> {
  const r = await req(app, 'post', '/held-policies').send(input(partyId, { policyNumber: number, ...extra }));
  if (r.status !== 201) throw new Error(`policy ${r.status}: ${JSON.stringify(r.body)}`);
  return String(r.body.id);
}

async function names(app: TestApp, query: string): Promise<string[]> {
  const r = await req(app, 'get', `/parties?${query}`);
  expect(r.status).toBe(200);
  return (r.body.items as { displayName: string }[]).map((i) => i.displayName).sort();
}

describe('M03 customer segments (ADR-M03-customer-segments)', () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp({ imports: [PartyModule, BookModule] });
    app.clock.set(new Date('2026-10-03T00:00:00Z'));
    const dueToday = await newParty(app, 'Dueton Today', '+919876500101');
    const terminal = await newParty(app, 'Closed Claim', '+919876500102');
    const eightDays = await newParty(app, 'Eightdays Out', '+919876500103');
    const sevenDays = await newParty(app, 'Sevendays Out', '+919876500104');
    const insured = await newParty(app, 'Insured Only', '+919876500105');
    await newParty(app, 'Nopolicy Person', '+919876500106');
    const heldId = await newPolicy(app, dueToday, 'POL1000001', { nextDueDate: '2026-10-03' });
    await newPolicy(app, terminal, 'POL1000002', { nextDueDate: '2026-10-03', status: 'CLAIMED', statusAsOf: '2026-10-01' });
    await newPolicy(app, eightDays, 'POL1000003', { nextDueDate: '2026-10-11' });
    await newPolicy(app, sevenDays, 'POL1000004', { nextDueDate: '2026-10-10' });
    await app.app
      .get<UnitOfWork>(UNIT_OF_WORK)
      .run('ten_acme', (tx) =>
        app.app.get<PartyFacade>(PARTY_FACADE).linkRole(tx, { partyId: insured, role: 'INSURED', subjectType: 'HELD_POLICY', subjectId: heldId }),
      );
  });
  afterEach(async () => {
    await app.close();
  });

  it('AC-M03-18 with_dues lists non-terminal policyholders due today or within 7 days, not terminal or 8 days out', async () => {
    expect(await names(app, 'segment=with_dues')).toEqual(['Dueton Today', 'Sevendays Out']);
  });

  it('AC-M03-18 with_dues is ANDed with q and tag', async () => {
    expect(await names(app, 'segment=with_dues&q=Sevendays')).toEqual(['Sevendays Out']);
    expect(await names(app, 'segment=with_dues&tag=nonexistent')).toEqual([]);
  });

  it('AC-M03-19 no_policy excludes policyholders and insured-only parties', async () => {
    expect(await names(app, 'segment=no_policy')).toEqual(['Nopolicy Person']);
  });

  it('AC-M03-19 no_policy is ANDed with q', async () => {
    expect(await names(app, 'segment=no_policy&q=Dueton')).toEqual([]);
  });

  it('AC-M03-19 an unknown segment is 400 validation_failed', async () => {
    const r = await req(app, 'get', '/parties?segment=overdue');
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('validation_failed');
  });
});
