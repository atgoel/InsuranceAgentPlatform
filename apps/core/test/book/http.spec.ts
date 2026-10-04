import { InMemoryOutbox } from '../../src/kernel/outbox/outbox';
import { RolePermissionMatrix } from '../../src/kernel/tenancy/permissions';
import { InMemoryAuditLog } from '../../src/kernel/audit/audit-log';
import { BookModule } from '../../src/modules/book/book.module';
import { createTestApp, TestApp } from '../support/test-app';
import { FixedDefinitionReader } from '../support/custom-field-defs';
import { CustomFieldDefinition } from '../../src/kernel/custom-fields';
import { tokenFor } from '../support/tokens';
import { UNIT_OF_WORK, CUSTOM_FIELD_DEFINITIONS, AUDIT_LOG, PERMISSION_POLICY, OUTBOX } from '../../src/kernel/tokens';
import { UnitOfWork } from '../../src/kernel/persistence/unit-of-work';
import {
  HELD_POLICY_REPOSITORY,
  HeldPolicyRepository,
  IMPORT_BATCH_REPOSITORY,
  ImportBatchRepository,
} from '../../src/modules/book/application/ports';
import { req, register, party, otherToken, zenToken, importRow, mapping } from './fixtures';

describe('AC-M07 HTTP behavior', () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp({
      imports: [BookModule],
      overrides: [
        {
          token: CUSTOM_FIELD_DEFINITIONS,
          value: new FixedDefinitionReader([
            {
              id: 'field1',
              entity: 'held_policy',
              key: 'segment',
              label: { en: 'Segment' },
              type: 'text',
              piiClass: 'P0',
              required: false,
              reportable: true,
              active: true,
              version: 1,
              createdAt: '2026-10-01Z',
              updatedAt: '2026-10-01Z',
            },
            {
              id: 'field2',
              entity: 'held_policy',
              key: 'private_note',
              label: { en: 'Private' },
              type: 'text',
              piiClass: 'P2',
              required: false,
              reportable: false,
              active: true,
              version: 1,
              createdAt: '2026-10-01Z',
              updatedAt: '2026-10-01Z',
            },
          ] satisfies CustomFieldDefinition[]),
        },
      ],
    });
    app.clock.set(new Date('2026-10-03T00:00:00Z'));
  });
  afterEach(async () => {
    await app?.close();
  });
  it('AC-M07-01 AC-M07-13 creates encrypted policy identifiers and minimizes HTTP fields', async () => {
    const p = await register(app);
    expect(p.policyNumber).toBe('XXXX1234');
    expect(p).not.toHaveProperty('policyNumberEnc');
    expect(p).not.toHaveProperty('policyNumberHash');
    const stored = await app.app
      .get<UnitOfWork>(UNIT_OF_WORK)
      .run('ten_acme', (tx) => app.app.get<HeldPolicyRepository>(HELD_POLICY_REPOSITORY).get(tx, p.id));
    expect(stored?.props.policyNumberEnc).toBeDefined();
    expect(stored?.props.policyNumberEnc).not.toContain('POL9001234');
    expect(stored?.props.source).toBe('MANUAL');
    const events = app.app.get<InMemoryOutbox>(OUTBOX).events.filter((e) => e.type === 'book.policy.registered');
    expect(events).toHaveLength(1);
    expect(events[0].data).toMatchObject({ policyId: p.id, source: 'MANUAL' });
    expect(JSON.stringify(app.logs.records)).not.toContain('POL9001234');
    expect(JSON.stringify(app.logs.records)).not.toContain('+919876500777');
  });
  it('AC-M07-13 enforces own scope and tenant isolation on detail, lists, dues and payments', async () => {
    const p = await register(app);
    expect((await req(app, 'get', `/held-policies/${p.id}`, otherToken())).status).toBe(404);
    expect((await req(app, 'get', `/held-policies/${p.id}`, { token: zenToken(), host: 'zen.iap.test' })).status).toBe(404);
    expect((await req(app, 'get', '/held-policies', otherToken())).body.items).toEqual([]);
    expect((await req(app, 'get', '/dues/today', otherToken())).body.dueToday).toEqual([]);
    expect(
      (await req(app, 'post', `/held-policies/${p.id}/payments`, otherToken()).send({ installmentDue: '2026-10-03', paidOn: '2026-10-03' }))
        .status,
    ).toBe(404);
  });
  it('AC-M07-02 protects stale patches and requires asOf for status updates', async () => {
    const p = await register(app);
    expect(
      (await req(app, 'patch', `/held-policies/${p.id}`).set('If-Match', '"v0"').send({ status: 'GRACE', asOf: '2026-10-04' })).status,
    ).toBe(412);
    expect((await req(app, 'patch', `/held-policies/${p.id}`).set('If-Match', `"v${p.version}"`).send({ status: 'GRACE' })).status).toBe(
      400,
    );
  });
  it('AC-M07-05 records a payment and exposes the anchored next installment', async () => {
    const p = await register(app);
    const r = await req(app, 'post', `/held-policies/${p.id}/payments`).send({ installmentDue: '2026-10-03', paidOn: '2026-10-03' });
    expect(r.status).toBe(200);
    expect(r.body.nextDueDate).toBe('2026-11-30');
    const detail = await req(app, 'get', `/held-policies/${p.id}`);
    expect(detail.body.nextDueDate).toBe('2026-11-30');
    const replay = await req(app, 'post', `/held-policies/${p.id}/payments`).send({ installmentDue: '2026-10-03', paidOn: '2026-10-03' });
    expect(replay.status).toBe(200);
    expect(replay.body.nextDueDate).toBe('2026-11-30');
    expect(replay.body.version).toBe(r.body.version);
    expect(app.app.get<InMemoryOutbox>(OUTBOX).events.filter((event) => event.type === 'book.policy.payment_recorded')).toHaveLength(1);
  });
  it('AC-M07-09 composes dues into calendar, today and CRM MyWork', async () => {
    const p = await register(app);
    const dues = await req(app, 'get', '/dues?from=2026-10-03&to=2026-10-04');
    expect(dues.body.days[0].dues[0].policyId).toBe(p.id);
    expect((await req(app, 'get', '/dues/today')).body.dueToday[0].policyId).toBe(p.id);
    const work = await req(app, 'get', '/my-work');
    expect(work.status).toBe(200);
    expect(work.body.items.some((i: { kind: string; id: string }) => i.kind === 'DUE')).toBe(true);
    expect(app.metrics.render()).toContain('book_dues_computed_total 2');
  });
  it('AC-M07-12 validates servicing state, notes, stale versions and cross-tenant mutations', async () => {
    const p = await register(app),
      r = await req(app, 'post', `/held-policies/${p.id}/servicing-requests`).send({ kind: 'CLAIM', followUpOn: '2026-10-03' });
    expect(r.status).toBe(201);
    const id = r.body.id;
    expect(
      (await req(app, 'patch', `/servicing-requests/${id}`).set('If-Match', `"v${r.body.version}"`).send({ status: 'RESOLVED' })).status,
    ).toBe(422);
    expect((await req(app, 'post', `/servicing-requests/${id}/notes`).send({ text: 'ABCDE1234F' })).status).toBe(422);
    expect(
      (
        await req(app, 'post', `/servicing-requests/${id}/notes`, { token: zenToken(), host: 'zen.iap.test' }).send({
          text: 'Documents received',
        })
      ).status,
    ).toBe(404);
    expect((await req(app, 'get', '/servicing-requests', otherToken())).body.items).toEqual([]);
    for (const auth of [otherToken(), { token: zenToken(), host: 'zen.iap.test' }]) {
      expect(
        (
          await req(app, 'patch', `/servicing-requests/${id}`, auth)
            .set('If-Match', `"v${r.body.version}"`)
            .send({ status: 'SUBMITTED_TO_INSURER' })
        ).status,
      ).toBe(404);
      expect((await req(app, 'post', `/servicing-requests/${id}/notes`, auth).send({ text: 'Documents received' })).status).toBe(404);
      expect((await req(app, 'post', `/held-policies/${p.id}/servicing-requests`, auth).send({ kind: 'CLAIM' })).status).toBe(404);
    }
  });
  it('AC-M07-13 denies missing book permission and rejects tenant body injection', async () => {
    const p = await register(app);
    const unprivileged = tokenFor({ tenantId: 'ten_acme', roles: [], memberId: 'member_1' });
    expect((await req(app, 'get', `/held-policies/${p.id}`, unprivileged)).status).toBe(403);
    expect(
      (await req(app, 'patch', `/held-policies/${p.id}`).set('If-Match', `"v${p.version}"`).send({ tenantId: 'ten_zen' })).status,
    ).toBe(400);
  });
  it('AC-CR001-04 filters only reportable public custom fields and masks private fields', async () => {
    const p = await register(app, { customFields: { segment: 'VIP', private_note: 'Private client note' } });
    expect(p.customFields).toEqual({ segment: 'VIP', private_note: '****' });
    expect((await req(app, 'get', '/held-policies?cf.segment=VIP')).body.items).toHaveLength(1);
    expect((await req(app, 'get', '/held-policies?cf.private_note=Private')).status).toBe(400);
  });
  it('AC-M07-07 detects duplicates in a file and replays uploaded checksum without adding batches', async () => {
    const body = { format: 'CSV_TEMPLATE', fileChecksum: 'duplicate_file', asOf: '2026-10-03', rows: [importRow, importRow] };
    const a = await req(app, 'post', '/book-imports').send(body),
      b = await req(app, 'post', '/book-imports').send(body);
    expect(b.body.id).toBe(a.body.id);
    await req(app, 'put', `/book-imports/${a.body.id}/mapping`).send({ mapping });
    const rows = await req(app, 'get', `/book-imports/${a.body.id}/rows?filter=duplicates`);
    expect(rows.body.items).toHaveLength(1);
    expect(rows.body.items[0].match.kind).toBe('DUPLICATE_IN_FILE');
    const committed = await req(app, 'post', `/book-imports/${a.body.id}/commit`);
    expect(committed.body).toMatchObject({ imported: 1, skipped: 1 });
  });
  it('AC-CR001-01 keeps referrer text until an explicit in-scope confirmation', async () => {
    const partyId = await party(app);
    const row = { ...importRow, policyNumber: 'REFER5678', referredByName: 'Book Person' };
    const upload = await req(app, 'post', '/book-imports').send({
      format: 'CSV_TEMPLATE',
      fileChecksum: 'referrer_file',
      asOf: '2026-10-03',
      rows: [row],
    });
    const id = upload.body.id;
    await req(app, 'put', `/book-imports/${id}/mapping`).send({ mapping: { ...mapping, referredByName: 'referredByName' } });
    const rows = await req(app, 'get', `/book-imports/${id}/rows`);
    expect(rows.body.items[0].parsed.commercials.referredBy).toEqual({ name: 'Book Person' });
    expect(rows.body.items[0].referrerSuggestions).toContainEqual({ partyId, name: 'Book Person' });
    expect((await req(app, 'put', `/book-imports/${id}/rows/1/referrer`).send({ partyId: 'unavailable' })).status).toBe(404);
    expect((await req(app, 'put', `/book-imports/${id}/rows/1/referrer`).send({ partyId })).status).toBe(200);
    const confirmed = await req(app, 'get', `/book-imports/${id}/rows`);
    expect(confirmed.body.items[0].parsed.commercials.referredBy.partyId).toBe(partyId);
  });
  it('AC-CR001-03 imports commission invoice exactly once with its held policy', async () => {
    const row = {
      ...importRow,
      policyNumber: 'COMM1234',
      premiumNet: '900',
      premiumTax: '100',
      commissionAmount: '135',
      invoiceNo: 'GST-001',
    };
    const upload = await req(app, 'post', '/book-imports').send({
      format: 'CSV_TEMPLATE',
      fileChecksum: 'commission_file',
      asOf: '2026-10-03',
      rows: [row],
    });
    const id = upload.body.id;
    const fields = Object.fromEntries(Object.keys(row).map((key) => [key, key]));
    await req(app, 'put', `/book-imports/${id}/mapping`).send({ mapping: fields });
    const committed = await req(app, 'post', `/book-imports/${id}/commit`);
    expect(committed.status).toBe(200);
    expect(committed.body.imported).toBe(1);
    await req(app, 'post', `/book-imports/${id}/commit`);
    expect(app.app.get<InMemoryAuditLog>(AUDIT_LOG).events.filter((e) => e.action === 'commission.received_recorded')).toHaveLength(1);
    expect(app.logs.records.filter((e) => e.event === 'commission.received_recorded')).toHaveLength(1);
  });
  it('AC-M07-13 denies cross-tenant and out-of-scope import mutations', async () => {
    const body = { format: 'CSV_TEMPLATE', fileChecksum: 'scope_file', asOf: '2026-10-03', rows: [importRow] };
    const uploaded = await req(app, 'post', '/book-imports').send(body);
    const id = uploaded.body.id;
    app.app.get<RolePermissionMatrix>(PERMISSION_POLICY).grant('SALESPERSON', ['book.import']);
    const ownImporter = tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId: 'someone_else' });
    for (const auth of [ownImporter, { token: zenToken(), host: 'zen.iap.test' }]) {
      expect((await req(app, 'get', `/book-imports/${id}/rows`, auth)).status).toBe(404);
      expect((await req(app, 'put', `/book-imports/${id}/mapping`, auth).send({ mapping })).status).toBe(404);
      expect((await req(app, 'put', `/book-imports/${id}/rows/1/decision`, auth).send({ decision: 'SKIP' })).status).toBe(404);
      expect((await req(app, 'put', `/book-imports/${id}/rows/1/referrer`, auth).send({ partyId: 'x' })).status).toBe(404);
      expect((await req(app, 'post', `/book-imports/${id}/commit`, auth)).status).toBe(404);
    }
  });
  it('AC-M07-08 commits 201 rows across transaction chunks and replays without duplicating policies', async () => {
    const rows = Array.from({ length: 201 }, (_, index) => ({
      ...importRow,
      policyNumber: `CHUNK${String(index).padStart(5, '0')}`,
      mobile: `+9198765${String(index).padStart(5, '0')}`,
      holderName: `Import Person ${index}`,
    }));
    const uploaded = await req(app, 'post', '/book-imports').send({
      format: 'CSV_TEMPLATE',
      fileChecksum: 'chunk_file',
      asOf: '2026-10-03',
      rows,
    });
    const id = uploaded.body.id;
    await req(app, 'put', `/book-imports/${id}/mapping`).send({ mapping });
    const committed = await req(app, 'post', `/book-imports/${id}/commit`);
    expect(committed.body).toMatchObject({ imported: 201, updated: 0, skipped: 0, parties: { created: 201, linked: 0 } });
    const replay = await req(app, 'post', `/book-imports/${id}/commit`);
    expect(replay.body).toMatchObject({ imported: 0, skipped: 201 });
    const stored = await app.app
      .get<UnitOfWork>(UNIT_OF_WORK)
      .run('ten_acme', (tx) => app.app.get<HeldPolicyRepository>(HELD_POLICY_REPOSITORY).all(tx));
    expect(stored).toHaveLength(201);
    expect(app.app.get<InMemoryAuditLog>(AUDIT_LOG).events.filter((e) => e.action === 'book.import.committed')).toHaveLength(1);
    expect(app.metrics.render()).toContain('book_import_rows_total{outcome="imported"} 201');
  }, 30000);
  it('AC-CR001-03 rejects commission invoice problems before any held policy writes', async () => {
    const row = {
      ...importRow,
      policyNumber: 'BADCOMM1234',
      premiumNet: '900',
      premiumTax: '100',
      commissionAmount: '135',
      invoiceNo: 'x'.repeat(41),
    };
    const upload = await req(app, 'post', '/book-imports').send({
      format: 'CSV_TEMPLATE',
      fileChecksum: 'invalid_commission',
      asOf: '2026-10-03',
      rows: [row],
    });
    const id = upload.body.id;
    await req(app, 'put', `/book-imports/${id}/mapping`).send({ mapping: Object.fromEntries(Object.keys(row).map((k) => [k, k])) });
    expect((await req(app, 'post', `/book-imports/${id}/commit`)).status).toBe(422);
    const stored = await app.app
      .get<UnitOfWork>(UNIT_OF_WORK)
      .run('ten_acme', (tx) => app.app.get<HeldPolicyRepository>(HELD_POLICY_REPOSITORY).all(tx));
    expect(stored).toHaveLength(0);
  });
  it('AC-CR001-02 encrypts motor registration and validates motor risk before writes', async () => {
    const commercials = {
      category: 'MOTOR',
      line: 'GENERAL',
      businessType: 'FRESH',
      bookedOn: '2026-01-01',
      commencementDate: '2026-01-01',
      expiryDate: '2026-12-31',
      premiumNetPaise: 10000,
      premiumTaxPaise: 1800,
      premiumGrossPaise: 11800,
    };
    const risk = {
      schemaId: 'motor',
      schemaVersion: 1,
      details: {
        registrationNo: 'MH01AB1234',
        registrationYear: 2020,
        make: 'Tata',
        model: 'Nexon',
        ncbPercent: 20,
        claimInPreviousYear: false,
        odPremiumPaise: 5000,
        tpPremiumPaise: 3000,
        addOns: [],
      },
    };
    const p = await register(app, { line: 'GENERAL', mode: 'ANNUAL', nextDueDate: undefined, commercials, risk });
    expect(p.registrationNoLast4).toBe('1234');
    expect(JSON.stringify(p)).not.toContain('MH01AB1234');
    expect(p).not.toHaveProperty('registrationNoEnc');
    const stored = await app.app
      .get<UnitOfWork>(UNIT_OF_WORK)
      .run('ten_acme', (tx) => app.app.get<HeldPolicyRepository>(HELD_POLICY_REPOSITORY).get(tx, p.id));
    expect(stored?.props.registrationNoEnc).not.toContain('MH01AB1234');
    const changed = await req(app, 'patch', `/held-policies/${p.id}`)
      .set('If-Match', `"v${p.version}"`)
      .send({ risk: { ...risk, details: { ...risk.details, model: 'Altroz' } } });
    expect(changed.status).toBe(200);
    expect(changed.body.risk.details.model).toBe('Altroz');
    const bad = await req(app, 'patch', `/held-policies/${p.id}`)
      .set('If-Match', `"v${changed.body.version}"`)
      .send({ risk: { ...risk, details: { ...risk.details, claimInPreviousYear: true } } });
    expect(bad.status).toBe(400);
  });
  it('AC-M07-02 updates commercials with guarded aliases and rejects invalid assignment', async () => {
    const p = await register(app);
    const commercials = {
      ...(p.commercials as Record<string, unknown>),
      premiumNetPaise: 20000,
      premiumTaxPaise: 1000,
      premiumGrossPaise: 21000,
    };
    const changed = await req(app, 'patch', `/held-policies/${p.id}`).set('If-Match', `"v${p.version}"`).send({ commercials });
    expect(changed.status).toBe(200);
    expect(changed.body.premiumPaise).toBe(21000);
    expect(
      (
        await req(app, 'patch', `/held-policies/${p.id}`)
          .set('If-Match', `"v${changed.body.version}"`)
          .send({ servicingMemberId: 'unavailable', orgUnitId: 'org_1' })
      ).status,
    ).toBe(400);
    expect(
      (
        await req(app, 'patch', `/held-policies/${p.id}`)
          .set('If-Match', `"v${changed.body.version}"`)
          .send({ customFields: { unknown: 'value' } })
      ).status,
    ).toBe(400);
    expect((await req(app, 'get', '/held-policies?q=Book')).body.items).toHaveLength(1);
    expect((await req(app, 'get', '/held-policies?q=unmatched')).body.items).toEqual([]);
  });
  it('AC-M07-09 prioritizes grace deadlines and servicing follow-ups in Today', async () => {
    const near = await register(app, { policyNumber: 'NEAR1111', nextDueDate: '2026-09-20' });
    await register(app, { policyNumber: 'GRACE2222', nextDueDate: '2026-10-01' });
    await register(app, { policyNumber: 'FUTURE3333', nextDueDate: '2026-10-10' });
    const request = await req(app, 'post', `/held-policies/${near.id}/servicing-requests`).send({
      kind: 'CLAIM',
      followUpOn: '2026-10-02',
    });
    expect(request.status).toBe(201);
    const today = await req(app, 'get', '/dues/today');
    expect(today.body.inGrace).toHaveLength(2);
    expect(today.body.lapsingSoon).toHaveLength(1);
    expect(today.body.lapsingSoon[0].policyId).toBe(near.id);
    const work = await req(app, 'get', '/my-work');
    expect(work.body.items.filter((i: { kind: string }) => i.kind === 'DUE')).toHaveLength(2);
    expect(work.body.items.find((i: { id: string }) => i.id === near.id).priority).toBe(0);
    expect(work.body.items.find((i: { id: string }) => i.id === request.body.id)).toMatchObject({
      kind: 'TASK',
      priority: 0,
      subject: { type: 'SERVICING_REQUEST', id: request.body.id },
    });
    expect((await req(app, 'get', '/my-work', otherToken())).body.items).toEqual([]);
  });
  it('AC-M07-09 gives a general renewal due today normal priority', async () => {
    const general = await register(app, {
      policyNumber: 'HOME4444',
      line: 'GENERAL',
      mode: 'ANNUAL',
      nextDueDate: undefined,
      commercials: {
        category: 'HOME',
        line: 'GENERAL',
        businessType: 'FRESH',
        bookedOn: '2025-10-03',
        commencementDate: '2025-10-03',
        expiryDate: '2026-10-02',
        premiumNetPaise: 10000,
        premiumTaxPaise: 0,
        premiumGrossPaise: 10000,
      },
    });
    const work = await req(app, 'get', '/my-work');
    expect(work.body.items.find((i: { id: string }) => i.id === general.id)).toMatchObject({ subtitle: 'RENEWAL_DUE', priority: 1 });
  });
  it.each([{ commencementDate: '31-02-2026' }, { mode: 'WEEKLY' }, { mobile: 'not-a-phone' }])(
    'AC-M07-07 reports invalid import date/mode/contact before commit %j',
    async (invalid) => {
      const row = { ...importRow, ...invalid };
      const upload = await req(app, 'post', '/book-imports').send({
        format: 'CSV_TEMPLATE',
        fileChecksum: 'invalid_values',
        asOf: '2026-10-03',
        rows: [row],
      });
      const id = upload.body.id;
      await req(app, 'put', `/book-imports/${id}/mapping`).send({ mapping });
      const rows = await req(app, 'get', `/book-imports/${id}/rows?filter=problems`);
      expect(rows.body.items).toHaveLength(1);
      expect(rows.body.items[0].problems.length).toBeGreaterThan(0);
      expect((await req(app, 'post', `/book-imports/${id}/commit`)).status).toBe(422);
      expect((await req(app, 'get', '/held-policies')).body.items).toHaveLength(0);
    },
  );
  it('AC-CR001-01 imports HEALTH Office register with seller, provenance, gross and renewal aliases', async () => {
    const row = {
      policyNumber: '199734823',
      insurerName: 'STAR HEALTH',
      productName: 'ASSURE',
      holderName: 'NITISH VATS',
      mobile: '+919953200001',
      bookedOn: '02-07-2026',
      commencementDate: '02-07-2026',
      expiryDate: '01-07-2027',
      category: 'HEALTH',
      familySizeOrModel: 'INDIVIDUAL',
      sumAssured: '1000000',
      premiumGross: '29466',
      mode: 'ANNUAL',
      bookingChannelCode: 'OFFICE M11-DIRECT',
      businessType: 'FRESH',
      policyTerm: '1 YEAR',
      businessSource: 'IN HOUSE',
      referredByName: 'SAURABH',
    };
    const upload = await req(app, 'post', '/book-imports').send({
      format: 'OFFICE_SALES_REGISTER',
      fileChecksum: 'office_health',
      asOf: '2026-10-03',
      rows: [row],
    });
    const id = upload.body.id;
    await req(app, 'put', `/book-imports/${id}/mapping`).send({ mapping: Object.fromEntries(Object.keys(row).map((k) => [k, k])) });
    const committed = await req(app, 'post', `/book-imports/${id}/commit`);
    expect(committed.body.imported).toBe(1);
    const policies = await req(app, 'get', '/held-policies');
    expect(policies.body.items).toHaveLength(1);
    expect(policies.body.items[0]).toMatchObject({
      source: 'IMPORT',
      asOf: '2026-10-03',
      confidence: 'MEDIUM',
      servicingMemberId: 'member_1',
      policyNumber: 'XXXX4823',
      renewalDate: '2027-07-02',
      sumAssuredPaise: 100000000,
      premiumPaise: 2946600,
      commercials: {
        category: 'HEALTH_INDIVIDUAL',
        businessType: 'FRESH',
        bookedOn: '2026-07-02',
        commencementDate: '2026-07-02',
        expiryDate: '2027-07-01',
        policyTermMonths: 12,
        businessSource: 'IN_HOUSE',
        referredBy: { name: 'SAURABH' },
        bookingChannelCode: 'OFFICE M11-DIRECT',
      },
    });
  });
  it('AC-M07-07 AC-M07-08 masks validation rows, commits once and purges raw PII', async () => {
    const r = await req(app, 'post', '/book-imports').send({
      format: 'CSV_TEMPLATE',
      fileChecksum: 'http_import',
      asOf: '2026-10-03',
      rows: [importRow],
    });
    expect(r.status).toBe(201);
    const id = r.body.id;
    expect((await req(app, 'get', `/book-imports/${id}`, { token: zenToken(), host: 'zen.iap.test' })).status).toBe(404);
    const mapped = await req(app, 'put', `/book-imports/${id}/mapping`).send({ mapping });
    expect(mapped.status).toBe(200);
    const rows = await req(app, 'get', `/book-imports/${id}/rows`);
    expect(rows.status).toBe(200);
    expect(JSON.stringify(rows.body)).not.toContain('+919876500888');
    expect(JSON.stringify(rows.body)).not.toContain('1990-02-28');
    expect(rows.body.items[0].problems).toEqual([]);
    const committed = await req(app, 'post', `/book-imports/${id}/commit`);
    expect({ status: committed.status, body: committed.body }).toMatchObject({ status: 200 });
    expect(committed.body.imported).toBe(1);
    const replay = await req(app, 'post', `/book-imports/${id}/commit`);
    expect(replay.body.imported).toBe(0);
    expect(replay.body.skipped).toBe(1);
    const batch = await app.app
      .get<UnitOfWork>(UNIT_OF_WORK)
      .run('ten_acme', (tx) => app.app.get<ImportBatchRepository>(IMPORT_BATCH_REPOSITORY).get(tx, id));
    expect(JSON.stringify(batch?.props)).not.toContain('+919876500888');
    expect(JSON.stringify(batch?.props)).not.toContain('1990-02-28');
  });
});
