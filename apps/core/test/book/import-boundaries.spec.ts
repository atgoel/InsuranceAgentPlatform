import { BookModule } from '../../src/modules/book/book.module';
import { createTestApp, TestApp } from '../support/test-app';
import { req, register, party, importRow, ownerToken } from './fixtures';
import { FixedDefinitionReader } from '../support/custom-field-defs';
import { CustomFieldDefinition } from '../../src/kernel/custom-fields';
import { CUSTOM_FIELD_DEFINITIONS, UNIT_OF_WORK, OUTBOX, AUDIT_LOG, PERMISSION_POLICY } from '../../src/kernel/tokens';
import { UnitOfWork } from '../../src/kernel/persistence/unit-of-work';
import { InMemoryOutbox } from '../../src/kernel/outbox/outbox';
import { InMemoryAuditLog } from '../../src/kernel/audit/audit-log';
import { RolePermissionMatrix } from '../../src/kernel/tenancy/permissions';
import { IMPORT_BATCH_REPOSITORY, ImportBatchRepository, HELD_POLICY_REPOSITORY, HeldPolicyRepository } from '../../src/modules/book/application/ports';
import { ImportBatch } from '../../src/modules/book/domain/book-import';
import { HeldPolicy } from '../../src/modules/book/domain/held-policy';
import { policy } from '../../src/modules/book/domain/test-fixture';
import { FIELD_CIPHER, FieldCipher } from '../../src/modules/party/application/ports';
import { MEMBER_REPOSITORY, MemberRepository, INSURER_CODE_REPOSITORY, InsurerCodeRepository } from '../../src/modules/distribution/application/ports';
import { Member } from '../../src/modules/distribution/domain/member';
import { tokenFor } from '../support/tokens';

const defs: CustomFieldDefinition[] = [
  { key: 'count', type: 'number', piiClass: 'P0' },
  { key: 'amount', type: 'money', piiClass: 'P2' },
  { key: 'date', type: 'date', piiClass: 'P0' },
  { key: 'flag', type: 'boolean', piiClass: 'P0' },
  { key: 'tag', type: 'text', piiClass: 'P0' },
].map((field, i) => ({ ...field, id: `field_${i}`, entity: 'held_policy', label: { en: field.key }, required: false,
  reportable: field.piiClass === 'P0', active: true, version: 1, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' })) as CustomFieldDefinition[];

describe('AC-M07-07 AC-M07-08 import review boundaries', () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp({ imports: [BookModule], overrides: [{ token: CUSTOM_FIELD_DEFINITIONS, value: new FixedDefinitionReader(defs) }] });
    app.clock.set(new Date('2026-10-03T00:00:00Z'));
  });
  afterEach(async () => { await app.close(); });

  it('AC-M07-02 commercial corrections replace and clear booking channel projections', async () => {
    const original = await register(app);
    const first = await req(app, 'get', `/held-policies/${original.id}`);
    const changed = await req(app, 'patch', `/held-policies/${original.id}`)
      .set('If-Match', `"v${first.body.version}"`)
      .send({ commercials: { ...first.body.commercials, bookingChannelCode: 'NEW_CODE' } });
    expect(changed.status).toBe(200);
    expect(changed.body.bookingChannel).toEqual({ code: 'NEW_CODE' });
    const { bookingChannelCode: removed, ...commercials } = changed.body.commercials;
    expect(removed).toBe('NEW_CODE');
    const cleared = await req(app, 'patch', `/held-policies/${original.id}`)
      .set('If-Match', `"v${changed.body.version}"`).send({ commercials });
    expect(cleared.status).toBe(200);
    expect(cleared.body.bookingChannel).toBeUndefined();
  });

  it('AC-CR001-04 reassignment recalculates the exact member insurer code reference', async () => {
    await member('member_1', 'Original', 'org_1');
    await member('replacement', 'Replacement', 'org_1');
    await app.app.get<UnitOfWork>(UNIT_OF_WORK).run('ten_acme', async tx => {
      const codes = app.app.get<InsurerCodeRepository>(INSURER_CODE_REPOSITORY);
      await codes.put(tx, 'member_1', 'ins_hdfc', 'SHARED_CODE');
      await codes.put(tx, 'replacement', 'ins_hdfc', 'SHARED_CODE_2');
    });
    const original = await register(app, { insurerId: 'ins_hdfc' });
    const first = await req(app, 'get', `/held-policies/${original.id}`);
    const coded = await req(app, 'patch', `/held-policies/${original.id}`)
      .set('If-Match', `"v${first.body.version}"`)
      .send({ commercials: { ...first.body.commercials, bookingChannelCode: 'SHARED_CODE' } });
    expect(coded.body.bookingChannel).toEqual({ code: 'SHARED_CODE', insurerCodeId: 'member_1:ins_hdfc' });
    const reassigned = await req(app, 'patch', `/held-policies/${original.id}`)
      .set('If-Match', `"v${coded.body.version}"`).send({ servicingMemberId: 'replacement', orgUnitId: 'org_1' });
    expect(reassigned.status).toBe(200);
    expect(reassigned.body.bookingChannel).toEqual({ code: 'SHARED_CODE' });
    const matched = await req(app, 'patch', `/held-policies/${original.id}`)
      .set('If-Match', `"v${reassigned.body.version}"`)
      .send({ commercials: { ...reassigned.body.commercials, bookingChannelCode: 'SHARED_CODE_2' } });
    expect(matched.body.bookingChannel).toEqual({ code: 'SHARED_CODE_2', insurerCodeId: 'replacement:ins_hdfc' });
  });

  async function upload(row: Record<string, string>, checksum = 'boundary_file', auth = ownerToken()) {
    const uploaded = await req(app, 'post', '/book-imports', auth).send({ format: 'CSV_TEMPLATE', fileChecksum: checksum, asOf: '2026-10-03', rows: [row] });
    expect(uploaded.status).toBe(201);
    const id = String(uploaded.body.id);
    const mapped = await req(app, 'put', `/book-imports/${id}/mapping`, auth).send({ mapping: Object.fromEntries(Object.keys(row).map(key => [key, key])) });
    expect(mapped.status).toBe(200);
    return id;
  }

  async function member(id: string, displayName: string, orgUnitId = 'ou_root') {
    await app.app.get<UnitOfWork>(UNIT_OF_WORK).run('ten_acme', tx => app.app.get<MemberRepository>(MEMBER_REPOSITORY).save(tx,
      Member.restore({ id, displayName, contactHash: `contact_${id}`, roles: ['SALESPERSON'], salespersonType: 'EMPLOYEE', orgUnitId,
        status: 'active', capacityPerDay: 25, skills: [], languages: ['en'], invitedAt: '2026-01-01T00:00:00Z',
        inviteExpiresAt: '2026-01-08T00:00:00Z', version: 0 })));
  }

  it('AC-CR001-04 converts custom field types, masks P2 amounts in review and persists validated values', async () => {
    const id = await upload({ ...importRow, 'custom:count': '3', 'custom:amount': '₹ 99.01', 'custom:date': '02/10/2026', 'custom:flag': 'yes', 'custom:tag': 'VIP' });
    const reviewed = await req(app, 'get', `/book-imports/${id}/rows`);
    expect(reviewed.body.items[0].problems).toEqual([]);
    expect(reviewed.body.items[0].parsed.customFields).toEqual({ count: 3, amount: '****', date: '2026-10-02', flag: true, tag: 'VIP' });
    expect((await req(app, 'post', `/book-imports/${id}/commit`)).body).toMatchObject({ imported: 1 });
    const stored = await app.app.get<UnitOfWork>(UNIT_OF_WORK).run('ten_acme', tx => app.app.get<HeldPolicyRepository>(HELD_POLICY_REPOSITORY).all(tx));
    expect(stored[0].props.customFields).toEqual({ count: 3, amount: 9901, date: '2026-10-02', flag: true, tag: 'VIP' });
  });

  it('AC-CR001-04 reports invalid custom money/date/boolean values and allows explicit skipping', async () => {
    const id = await upload({ ...importRow, 'custom:amount': '1 lakh', 'custom:date': 'nonsense', 'custom:flag': 'perhaps' });
    const reviewed = await req(app, 'get', `/book-imports/${id}/rows?filter=problems`);
    expect(reviewed.body.items[0].problems).toEqual(expect.arrayContaining(['invalid_custom_fields', 'invalid_type:customFields.amount', 'invalid_date:customFields.date', 'invalid_type:customFields.flag']));
    expect((await req(app, 'post', `/book-imports/${id}/commit`)).status).toBe(422);
    expect((await req(app, 'put', `/book-imports/${id}/rows/1/decision`).send({ decision: 'SKIP' })).status).toBe(200);
    const committed = await req(app, 'post', `/book-imports/${id}/commit`);
    expect(committed.status).toBe(200);
    expect(committed.body).toEqual({ imported: 0, updated: 0, skipped: 1, parties: { created: 0, linked: 0 } });
    expect((await req(app, 'get', '/held-policies')).body.items).toEqual([]);
  });

  it('AC-CR001-04 omits empty optional custom values and converts a false boolean without masking it', async () => {
    const id = await upload({ ...importRow, 'custom:count': '', 'custom:amount': '', 'custom:date': '', 'custom:flag': 'false', 'custom:tag': '' });
    const rows = await req(app, 'get', `/book-imports/${id}/rows`);
    expect(rows.body.items[0].problems).toEqual([]);
    expect(rows.body.items[0].parsed.customFields).toEqual({ flag: false });
  });

  it('AC-M07-07 resolves an exact known LIFE product to its insurer/version/category without inventing line matches', async () => {
    const id = await upload({ ...importRow, insurerName: ' hDfC  Life ', productName: 'Click 2 Protect Supreme', category: 'LIFE' });
    const rows = await req(app, 'get', `/book-imports/${id}/rows`);
    expect(rows.body.items[0].problems).toEqual([]);
    expect(rows.body.items[0].parsed).toMatchObject({ insurerId: 'ins_hdfc_life', productVersionId: 'pv_hdfc_term_v1', commercials: { category: 'TERM', line: 'LIFE' } });
    const wrongLine = await upload({ ...importRow, insurerName: 'HDFC Life', productName: 'Click 2 Protect Supreme', category: 'HEALTH_INDIVIDUAL' }, 'wrong_line');
    const unmatched = await req(app, 'get', `/book-imports/${wrongLine}/rows`);
    expect(unmatched.body.items[0].parsed).not.toHaveProperty('insurerId');
    expect(unmatched.body.items[0].parsed.commercials.line).toBe('HEALTH');
  });

  it('AC-M07-08 updates a newer existing policy and skips an older duplicate without changing its provenance', async () => {
    const existing = await register(app, { asOf: '2026-09-01' });
    const id = await upload({ ...importRow, policyNumber: 'POL9001234', premium: '2000', status: 'GRACE', bookingChannelCode: 'IMPORT_CODE' });
    const rows = await req(app, 'get', `/book-imports/${id}/rows`);
    expect(rows.body.items[0]).toMatchObject({ match: { kind: 'UPDATE', heldPolicyId: existing.id }, decision: 'UPDATE' });
    const committed = await req(app, 'post', `/book-imports/${id}/commit`);
    expect(committed.status).toBe(200);
    expect(committed.body).toEqual({ imported: 0, updated: 1, skipped: 0, parties: { created: 0, linked: 0 } });
    const detail = await req(app, 'get', `/held-policies/${existing.id}`);
    expect(detail.body).toMatchObject({ status: 'GRACE', source: 'IMPORT', asOf: '2026-10-03', premiumPaise: 200000 });
    expect(detail.body.bookingChannel).toEqual({ code: 'IMPORT_CODE' });
    const duplicate = await upload({ ...importRow, policyNumber: 'POL9001234' }, 'same_asof');
    const duplicates = await req(app, 'get', `/book-imports/${duplicate}/rows?filter=duplicates`);
    expect(duplicates.body.items[0]).toMatchObject({ match: { kind: 'DUPLICATE_IN_BOOK', heldPolicyId: existing.id }, decision: 'SKIP' });
    expect((await req(app, 'post', `/book-imports/${duplicate}/commit`)).body).toMatchObject({ imported: 0, updated: 0, skipped: 1 });
    expect((await req(app, 'get', `/held-policies/${existing.id}`)).body.version).toBe(detail.body.version);
  });

  it('AC-CR001-06 confirms only exact-name member suggestions within OWN scope', async () => {
    await member('member_1', 'SAURABH');
    await member('outside', 'SAURABH');
    app.app.get<RolePermissionMatrix>(PERMISSION_POLICY).grant('SALESPERSON', ['book.import']);
    const auth = tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId: 'member_1', orgUnitId: 'ou_root' });
    const id = await upload({ ...importRow, referredByName: 'SAURABH' }, 'own_referrer', auth);
    const rows = await req(app, 'get', `/book-imports/${id}/rows`, auth);
    expect(rows.body.items[0].referrerSuggestions).toEqual([{ memberId: 'member_1', name: 'SAURABH' }]);
    expect((await req(app, 'put', `/book-imports/${id}/rows/1/referrer`, auth).send({ memberId: 'outside' })).status).toBe(403);
    expect((await req(app, 'put', `/book-imports/${id}/rows/1/referrer`, auth).send({ memberId: 'member_1' })).status).toBe(200);
    expect((await req(app, 'get', `/book-imports/${id}/rows`, auth)).body.items[0].parsed.commercials.referredBy).toEqual({ name: 'SAURABH', memberId: 'member_1' });
    const missingName = await upload(importRow, 'no_referrer');
    expect((await req(app, 'put', `/book-imports/${missingName}/rows/1/referrer`).send({ memberId: 'member_1' })).status).toBe(403);
  });

  it('AC-M07-13 limits manager referrer suggestions to the manager subtree', async () => {
    await member('in_unit', 'SAURABH', 'ou_root');
    await member('out_unit', 'SAURABH', 'outside_unit');
    const auth = tokenFor({ tenantId: 'ten_acme', roles: ['BRANCH_MANAGER'], memberId: 'manager', orgUnitId: 'ou_root' });
    const id = await upload({ ...importRow, referredByName: 'SAURABH' }, 'subtree_referrer', auth);
    const rows = await req(app, 'get', `/book-imports/${id}/rows`, auth);
    expect(rows.body.items[0].referrerSuggestions).toEqual([{ memberId: 'in_unit', name: 'SAURABH' }]);
  });

  it('AC-M07-08 rejects unknown batches, invalid review rows and edits to a committed import', async () => {
    expect((await req(app, 'get', '/book-imports/unknown')).status).toBe(404);
    expect((await req(app, 'get', '/book-imports/unknown/rows')).status).toBe(404);
    expect((await req(app, 'post', '/book-imports/unknown/commit')).status).toBe(404);
    const id = await upload(importRow);
    expect((await req(app, 'put', `/book-imports/${id}/rows/99/decision`).send({ decision: 'IMPORT' })).status).toBe(400);
    expect((await req(app, 'post', `/book-imports/${id}/commit`)).status).toBe(200);
    expect((await req(app, 'put', `/book-imports/${id}/mapping`).send({ mapping: {} })).status).toBe(422);
    expect((await req(app, 'put', `/book-imports/${id}/rows/1/decision`).send({ decision: 'SKIP' })).status).toBe(422);
    expect((await req(app, 'get', `/book-imports/${id}/rows`)).body.items).toEqual([]);
  });

  it('AC-M07-08 renders uploaded rows without parsed PII and refuses committing discarded state', async () => {
    const uploaded = await req(app, 'post', '/book-imports').send({ format: 'CSV_TEMPLATE', fileChecksum: 'discarded_file', asOf: '2026-10-03', rows: [importRow] });
    const id = String(uploaded.body.id);
    const rows = await req(app, 'get', `/book-imports/${id}/rows`);
    expect(rows.body.items[0]).toEqual({ rowNo: 1, problems: [] });
    const uow = app.app.get<UnitOfWork>(UNIT_OF_WORK);
    const batches = app.app.get<ImportBatchRepository>(IMPORT_BATCH_REPOSITORY);
    await uow.run('ten_acme', async tx => {
      const batch = await batches.get(tx, id);
      if (!batch) throw new Error('Fixture import missing');
      batch.discard();
      await batches.save(tx, batch);
    });
    expect((await req(app, 'get', `/book-imports/${id}`)).body.state).toBe('DISCARDED');
    expect((await req(app, 'post', `/book-imports/${id}/commit`)).status).toBe(422);
    expect((await req(app, 'get', `/book-imports/${id}/rows`)).body.items).toEqual([]);
  });

  it('AC-CR001-03 keeps a long file checksum commission replay key bounded and supports administrators without a member identity', async () => {
    const auth = tokenFor({ tenantId: 'ten_acme', roles: ['TENANT_ADMIN'] });
    const id = await upload({ ...importRow, premiumNet: '900', premiumTax: '100', commissionAmount: '135', invoiceNo: 'GST-99', email: 'asha@example.test' }, 'x'.repeat(200), auth);
    const committed = await req(app, 'post', `/book-imports/${id}/commit`, auth);
    expect(committed.status).toBe(200);
    expect(committed.body).toMatchObject({ imported: 1 });
    expect((await req(app, 'post', `/book-imports/${id}/commit`, auth)).body).toMatchObject({ imported: 0, skipped: 1 });
    expect(app.app.get<InMemoryAuditLog>(AUDIT_LOG).events.filter(event => event.action === 'commission.received_recorded')).toHaveLength(1);
    const policies = await req(app, 'get', '/held-policies');
    expect(policies.body.items[0]).not.toHaveProperty('servicingMemberId');
  });

  it('AC-M07-08 resumes durable partial progress without reopening review or recreating completed rows', async () => {
    const partyId = await party(app);
    const first = { ...importRow, policyNumber: 'PROGRESS1111' };
    const second = { ...importRow, policyNumber: 'PROGRESS2222' };
    const batch = ImportBatch.upload({ id: 'partial_batch', format: 'CSV_TEMPLATE', fileChecksum: 'partial_file', asOf: '2026-10-03',
      rows: [first, second], ownerMemberId: 'member_1', orgUnitId: 'org_1', now: app.clock.now() });
    batch.map(Object.fromEntries(Object.keys(first).map(key => [key, key])));
    await batch.validate({ validate: () => [] }, { match: async () => ({ kind: 'NEW' }) });
    batch.finishRows([1], { imported: 1, updated: 0, skipped: 0, parties: { created: 1, linked: 0 } });
    await app.app.get<UnitOfWork>(UNIT_OF_WORK).run('ten_acme', async tx => {
      const cipher = app.app.get<FieldCipher>(FIELD_CIPHER);
      const registered = HeldPolicy.restore(policy({ id: 'completed_policy', proposerPartyId: partyId, source: 'IMPORT',
        servicingMemberId: 'member_1', orgUnitId: 'org_1', policyNumberEnc: await cipher.encrypt(tx.tenantId, first.policyNumber),
        policyNumberHash: cipher.hash(tx.tenantId, first.policyNumber), policyNumberLast4: '1111' }));
      await app.app.get<HeldPolicyRepository>(HELD_POLICY_REPOSITORY).save(tx, registered);
      await app.app.get<ImportBatchRepository>(IMPORT_BATCH_REPOSITORY).save(tx, batch);
    });
    expect((await req(app, 'put', '/book-imports/partial_batch/rows/2/decision').send({ decision: 'SKIP' })).status).toBe(422);
    const committed = await req(app, 'post', '/book-imports/partial_batch/commit');
    expect(committed.status).toBe(200);
    expect(committed.body).toMatchObject({ imported: 2, updated: 0, skipped: 0 });
    expect((await req(app, 'get', '/held-policies')).body.items).toHaveLength(2);
    expect(app.app.get<InMemoryOutbox>(OUTBOX).events.filter(event => event.type === 'book.policy.registered')).toHaveLength(1);
    expect((await req(app, 'post', '/book-imports/partial_batch/commit')).body).toMatchObject({ imported: 0, skipped: 2 });
  });
});
