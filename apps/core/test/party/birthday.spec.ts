import { PartyModule } from '../../src/modules/party/party.module';
import { PARTY_FACADE, PartyFacade } from '../../src/modules/party/application/ports';
import { UNIT_OF_WORK } from '../../src/kernel/tokens';
import { UnitOfWork } from '../../src/kernel/persistence/unit-of-work';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';

describe('AC-M07-06 internal birthday projection', () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp({ imports: [PartyModule] });
  });
  afterEach(async () => {
    await app.close();
  });
  it('captures month/day for lifecycle consumers without exposing it over HTTP', async () => {
    const r = await app.http
      .post('/api/v1/parties')
      .set('Host', 'acme.iap.test')
      .set('Authorization', `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId: 'member_1' })}`)
      .set('Idempotency-Key', newIdempotencyKey())
      .send({
        kind: 'PERSON',
        displayName: 'Birthday Person',
        contacts: [{ channel: 'MOBILE', value: '+919876500123' }],
        dateOfBirth: '1992-02-29',
      });
    expect(r.status).toBe(201);
    expect(r.body.party.birthday).toBeUndefined();
    const summary = await app.app
      .get<UnitOfWork>(UNIT_OF_WORK)
      .run('ten_acme', (tx) => app.app.get<PartyFacade>(PARTY_FACADE).summary(tx, r.body.party.id));
    expect(summary).toMatchObject({ dobYear: 1992, birthday: '02-29' });
  });
});

import { Party } from '../../src/modules/party/domain/party';
import { MergePlan } from '../../src/modules/party/domain/merge';
import { partySummary } from '../../src/modules/party/application/party-views';
const now = new Date('2026-10-03T00:00:00Z');
const person = (id: string) =>
  Party.create({
    id,
    kind: 'PERSON',
    displayName: 'Party Person',
    contactPoints: [{ channel: 'MOBILE', valueEnc: 'enc', valueHash: id, masked: 'masked', isPrimary: true }],
    source: { kind: 'MANUAL' },
    now,
  });
describe('AC-M07-06 birthday privacy lifecycle', () => {
  it('erasure clears all birthday and year projections', () => {
    const p = person('p1');
    p.setSensitive({ dateOfBirthEnc: 'enc', dobYear: 1992, birthday: '02-29' });
    p.erase(now);
    expect(partySummary(p).birthday).toBeUndefined();
    expect(partySummary(p).dobYear).toBeUndefined();
  });
  it('merge carries the birthday belonging to the selected DOB and clears a stale projection', () => {
    const a = person('a'),
      b = person('b');
    a.setSensitive({ dateOfBirthEnc: 'enc-a', dobYear: 1992, birthday: '02-29' });
    b.setSensitive({ dateOfBirthEnc: 'enc-b', dobYear: 1980 });
    const result = MergePlan.build(a, b, [{ field: 'dateOfBirth', from: 'B' }], 'A').apply(now);
    expect(result.survivor.props.dateOfBirthEnc).toBe('enc-b');
    expect(result.survivor.props.birthday).toBeUndefined();
    expect(result.survivor.props.dobYear).toBe(1980);
  });
});

import { TwentyProjector } from '../../src/modules/crm/application/twenty-projector';
describe('AC-M07-06 birthday projection minimization', () => {
  it('keeps birthday and DOB year out of Twenty person payloads', () => {
    const p = person('p2');
    p.setSensitive({ dateOfBirthEnc: 'enc', dobYear: 1992, birthday: '02-29' });
    const external = TwentyProjector.person(partySummary(p), true);
    expect(external).not.toHaveProperty('birthday');
    expect(external).not.toHaveProperty('dobYear');
    expect(JSON.stringify(external)).not.toContain('02-29');
  });
});

import { PARTY_REPOSITORY, PartyRepository } from '../../src/modules/party/application/ports';
describe('AC-CR001-01 internal referrer name search', () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp({ imports: [PartyModule] });
  });
  afterEach(async () => {
    await app.close();
  });
  it('returns only exact normalized names within the current tenant', async () => {
    const uow = app.app.get<UnitOfWork>(UNIT_OF_WORK),
      repository = app.app.get<PartyRepository>(PARTY_REPOSITORY);
    const exact = person('exact');
    exact.rename('Meera Nair', now);
    const prefix = person('prefix');
    prefix.rename('Meera Nair Senior', now);
    await uow.run('ten_acme', async (tx) => {
      await repository.save(tx, exact);
      await repository.save(tx, prefix);
    });
    const facade = app.app.get<PartyFacade>(PARTY_FACADE);
    expect((await uow.run('ten_acme', (tx) => facade.searchByName(tx, ' meera  nair '))).map((p) => p.id)).toEqual(['exact']);
    expect(await uow.run('ten_zen', (tx) => facade.searchByName(tx, 'Meera Nair'))).toEqual([]);
  });
});
