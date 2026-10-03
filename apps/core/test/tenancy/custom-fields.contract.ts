import { Transaction } from '../../src/kernel/persistence/unit-of-work';
import { CustomFieldDefinition } from '../../src/kernel/custom-fields';
import { ConflictError, NotFoundError, PreconditionFailedError } from '../../src/kernel/errors/domain-errors';
import { CustomFieldRepository } from '../../src/modules/tenancy/application/ports';

export interface CustomFieldHarness {
  repo: CustomFieldRepository;
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  tenantA: string;
  tenantB: string;
  /** Unique per run; every id is suffixed with it. */
  suffix: string;
}

const def = (id: string, over: Partial<CustomFieldDefinition> = {}): CustomFieldDefinition => ({
  id, entity: 'party', key: 'branch_code', label: { en: 'Branch code', hi: 'Shakha code' }, type: 'text', required: false, piiClass: 'P0', reportable: true,
  version: 1, active: true, createdAt: '2026-10-03T06:00:00.000Z', updatedAt: '2026-10-03T06:00:00.000Z', ...over,
});

/** AC-CR001-04: what every CustomFieldRepository adapter (in-memory and Postgres) must do. */
export function customFieldRepositoryContract(name: string, setup: () => Promise<CustomFieldHarness>): void {
  describe(name, () => {
    let h: CustomFieldHarness;
    beforeAll(async () => {
      h = await setup();
    });

    it('AC-CR001-04 round-trips a definition including label {en, hi} and enum options', async () => {
      const d = def(`cfd_rt_${h.suffix}`, { key: 'tier', type: 'enum', enumOptions: [{ value: 'GOLD', label: { en: 'Gold', hi: 'Sona' } }, { value: 'SILVER', label: { en: 'Silver' } }] });
      await h.run(h.tenantA, (tx) => h.repo.insert(tx, d));
      expect(await h.run(h.tenantA, (tx) => h.repo.get(tx, d.id))).toEqual(d);
    });

    it('AC-CR001-04 list is ordered by entity then key and includes inactive definitions', async () => {
      await h.run(h.tenantB, async (tx) => {
        await h.repo.insert(tx, def(`cfd_l3_${h.suffix}`, { entity: 'lead', key: 'zeta' }));
        await h.repo.insert(tx, def(`cfd_l2_${h.suffix}`, { entity: 'lead', key: 'alpha', active: false }));
        await h.repo.insert(tx, def(`cfd_l1_${h.suffix}`, { entity: 'held_policy', key: 'mid' }));
      });
      const list = await h.run(h.tenantB, (tx) => h.repo.list(tx));
      expect(list.map((d) => `${d.entity}:${d.key}:${d.active}`)).toEqual(['held_policy:mid:true', 'lead:alpha:false', 'lead:zeta:true']);
    });

    it('AC-CR001-04 activeFor returns only active definitions of the entity', async () => {
      const active = await h.run(h.tenantB, (tx) => h.repo.activeFor(tx, 'lead'));
      expect(active.map((d) => d.key)).toEqual(['zeta']);
    });

    it('AC-CR001-04 a duplicate (entity, key) in the same tenant is ConflictError custom_field_exists', async () => {
      await h.run(h.tenantA, (tx) => h.repo.insert(tx, def(`cfd_d1_${h.suffix}`, { key: 'dup_key' })));
      const error = await h.run(h.tenantA, (tx) => h.repo.insert(tx, def(`cfd_d2_${h.suffix}`, { key: 'dup_key' }))).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect(error).toMatchObject({ code: 'custom_field_exists' });
    });

    it('AC-CR001-04 the same key may exist in two tenants', async () => {
      await h.run(h.tenantB, (tx) => h.repo.insert(tx, def(`cfd_k_${h.suffix}`, { key: 'dup_key' })));
      expect((await h.run(h.tenantB, (tx) => h.repo.get(tx, `cfd_k_${h.suffix}`)))?.key).toBe('dup_key');
    });

    it('AC-CR001-04 update with the expected version persists and a stale version is PreconditionFailedError', async () => {
      const d = def(`cfd_u_${h.suffix}`, { key: 'upd_key' });
      await h.run(h.tenantA, (tx) => h.repo.insert(tx, d));
      const next = { ...d, label: { en: 'Renamed' }, required: true, active: false, version: 2, updatedAt: '2026-10-03T07:00:00.000Z' };
      await h.run(h.tenantA, (tx) => h.repo.update(tx, next, 1));
      expect(await h.run(h.tenantA, (tx) => h.repo.get(tx, d.id))).toEqual(next);
      const stale = await h.run(h.tenantA, (tx) => h.repo.update(tx, { ...next, version: 3 }, 1)).catch((e: unknown) => e);
      expect(stale).toBeInstanceOf(PreconditionFailedError);
    });

    it('AC-CR001-04 a tenant never sees or updates another tenant definition', async () => {
      const id = `cfd_rt_${h.suffix}`;
      expect(await h.run(h.tenantB, (tx) => h.repo.get(tx, id))).toBeUndefined();
      expect((await h.run(h.tenantB, (tx) => h.repo.list(tx))).map((d) => d.id)).not.toContain(id);
      const error = await h.run(h.tenantB, (tx) => h.repo.update(tx, def(id, { version: 2 }), 1)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundError);
    });
  });
}
