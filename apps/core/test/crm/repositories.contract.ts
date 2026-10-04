import { Money } from '../../src/kernel/domain';
import { Transaction } from '../../src/kernel/persistence/unit-of-work';
import { Lead, LeadProps } from '../../src/modules/crm/domain/lead';
import { Task, TaskProps } from '../../src/modules/crm/domain/task';
import { Opportunity, OpportunityProps } from '../../src/modules/crm/domain/opportunity';
import { Activity } from '../../src/modules/crm/domain/activity';
import { RoutingRule } from '../../src/modules/crm/domain/routing/routing-rule';
import {
  ActivityRepository,
  LeadImportRepository,
  LeadRepository,
  OpportunityRepository,
  PublicLeadGuard,
  RoutingRuleRepository,
  TaskRepository,
} from '../../src/modules/crm/application/ports';
import { CrmSyncStateRepository } from '../../src/modules/crm/application/twenty-sync.ports';

export interface ContractHarness {
  repos: {
    leads: LeadRepository;
    activities: ActivityRepository;
    tasks: TaskRepository;
    opportunities: OpportunityRepository;
    rules: RoutingRuleRepository;
    imports: LeadImportRepository;
    guard: PublicLeadGuard;
    sync: CrmSyncStateRepository;
  };
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** A clean tenant (plus three party ids that exist for it) so every test starts from an empty book. */
  newTenant(): Promise<{ tenantId: string; parties: [string, string, string] }>;
  /** Globally unique id for a record (Postgres primary keys are global). */
  uid(label: string): string;
}

const T0 = Date.parse('2026-10-03T06:00:00.000Z');
const at = (offsetMinutes: number): string => new Date(T0 + offsetMinutes * 60_000).toISOString();
const NOW = new Date(at(0));
const DAY = 24 * 60;

const attribution = (source: LeadProps['attribution']['source'] = 'WEB_FORM'): LeadProps['attribution'] => ({
  source,
  campaignId: 'cmp_diwali',
  firstTouch: { channel: 'web', ref: 'lp1', at: at(-3 * DAY) },
  lastTouch: { channel: 'web', at: at(-DAY) },
  micrositeMemberId: 'mem_site',
});

/** Spec for a lead as the aggregate would be restored; new leads start at version 1. */
function leadProps(id: string, partyId: string, o: Partial<LeadProps> = {}): LeadProps {
  return {
    id,
    partyId,
    productInterest: 'TERM_LIFE',
    stage: 'NEW',
    temperature: 'WARM',
    attribution: attribution(),
    qualification: {},
    stageHistory: [{ to: 'NEW', at: at(-60), by: 'system' }],
    customFields: {},
    syncState: 'local',
    createdAt: at(-60),
    updatedAt: at(-60),
    version: 1,
    ...o,
  };
}

const ids = <T extends { props: { id: string } }>(items: T[]): string[] => items.map((i) => i.props.id);

/**
 * Behavioural contract every CRM repository set must satisfy. Run against the in-memory adapters and against Postgres:
 * the two must be indistinguishable to the services.
 */
export function crmRepositoriesContract(label: string, setup: () => Promise<ContractHarness>, teardown?: () => Promise<void>): void {
  describe(`${label} CRM repository contract`, () => {
    let h: ContractHarness;
    beforeAll(async () => {
      h = await setup();
    });
    afterAll(async () => {
      await teardown?.();
    });

    const saveLeads = (tenantId: string, leads: Lead[]) =>
      h.run(tenantId, async (tx) => {
        for (const l of leads) await h.repos.leads.save(tx, l);
      });

    it('AC-M04-21 lead round-trips every field incl. JSON columns, bumps the version and calls markSaved', async () => {
      const { tenantId, parties } = await h.newTenant();
      const id = h.uid('lead');
      const full = leadProps(id, parties[0], {
        pincode: '560001',
        language: 'kn',
        stage: 'QUALIFIED',
        temperature: 'HOT',
        ownerMemberId: 'mem_a',
        orgUnitId: 'ou_blr',
        routedByRuleId: 'rule_1',
        qualification: { need: 'PROTECTION', budgetBand: '15K_30K', timeline: 'THIS_MONTH', existingCover: 'Group cover 5L' },
        slaDueAt: at(-30),
        firstRespondedAt: at(-45),
        slaBreachNotifiedAt: at(-20),
        stageHistory: [
          { to: 'NEW', at: at(-60), by: 'system' },
          { from: 'NEW', to: 'QUALIFIED', at: at(-50), by: 'mem_a' },
        ],
        updatedAt: at(-50),
      });
      const lead = Lead.restore(full);
      await h.run(tenantId, (tx) => h.repos.leads.save(tx, lead));
      expect(lead.props.version).toBe(2);
      const stored = await h.run(tenantId, (tx) => h.repos.leads.get(tx, id));
      expect(stored?.props).toEqual({ ...full, version: 2 });
      expect(await h.run(tenantId, (tx) => h.repos.leads.get(tx, h.uid('missing')))).toBeUndefined();
    });

    it('AC-M04-21 lead save rejects a stale version with version_mismatch and accepts a reloaded one', async () => {
      const { tenantId, parties } = await h.newTenant();
      const id = h.uid('lead');
      await saveLeads(tenantId, [Lead.restore(leadProps(id, parties[0]))]);
      const first = await h.run(tenantId, (tx) => h.repos.leads.get(tx, id));
      const second = await h.run(tenantId, (tx) => h.repos.leads.get(tx, id));
      if (!first || !second) throw new Error('lead missing');
      first.setTemperature('HOT');
      await h.run(tenantId, (tx) => h.repos.leads.save(tx, first));
      second.setTemperature('COLD');
      await expect(h.run(tenantId, (tx) => h.repos.leads.save(tx, second))).rejects.toMatchObject({
        code: 'version_mismatch',
        httpStatus: 412,
      });
      const after = await h.run(tenantId, (tx) => h.repos.leads.get(tx, id));
      expect(after?.props).toMatchObject({ temperature: 'HOT', version: 3 });
    });

    it('AC-M04-21 tenants never see each other’s leads, tasks, opportunities, rules or imports', async () => {
      const a = await h.newTenant();
      const b = await h.newTenant();
      const leadId = h.uid('lead');
      await saveLeads(a.tenantId, [Lead.restore(leadProps(leadId, a.parties[0], { ownerMemberId: 'mem_a', orgUnitId: 'ou_1' }))]);
      const taskId = h.uid('task');
      await h.run(a.tenantId, (tx) =>
        h.repos.tasks.save(
          tx,
          Task.restore({
            id: taskId,
            ownerMemberId: 'mem_a',
            subjectType: 'LEAD',
            subjectId: leadId,
            kind: 'CALL',
            title: 'Call back',
            dueAt: at(10),
            status: 'OPEN',
            source: 'MANUAL',
            createdAt: at(-5),
            version: 1,
          }),
        ),
      );
      await h.run(a.tenantId, (tx) => h.repos.rules.replaceAll(tx, [rule('r1', 1)]));
      await h.run(a.tenantId, (tx) =>
        h.repos.imports.saveBatch(tx, {
          id: h.uid('imp'),
          fileChecksum: 'sum_iso',
          sourceTag: 'x',
          summary: { imported: 1, duplicates: 0, rejected: 0, skippedAlreadyImported: 0 },
          createdAt: at(0),
        }),
      );
      await h.run(a.tenantId, (tx) =>
        h.repos.activities.add(tx, {
          id: h.uid('act'),
          subjectType: 'LEAD',
          subjectId: leadId,
          kind: 'CALL',
          occurredAt: at(1),
          clientRef: 'ref_iso',
        }),
      );

      await h.run(b.tenantId, async (tx) => {
        expect(await h.repos.leads.get(tx, leadId)).toBeUndefined();
        expect((await h.repos.leads.list(tx, { scope: { kind: 'TENANT' }, at: NOW, limit: 10 })).items).toEqual([]);
        expect(await h.repos.leads.forParty(tx, a.parties[0])).toEqual([]);
        expect(await h.repos.leads.openForOwner(tx, 'mem_a')).toEqual([]);
        expect(await h.repos.tasks.get(tx, taskId)).toBeUndefined();
        expect(await h.repos.tasks.openForOwner(tx, 'mem_a')).toEqual([]);
        expect(await h.repos.rules.list(tx)).toEqual([]);
        expect(await h.repos.imports.findBatchByChecksum(tx, 'sum_iso')).toBeUndefined();
        expect(await h.repos.activities.forSubject(tx, 'LEAD', leadId, 10)).toEqual([]);
        expect(
          (
            await h.repos.activities.add(tx, {
              id: h.uid('act'),
              subjectType: 'LEAD',
              subjectId: 'x',
              kind: 'NOTE',
              occurredAt: at(2),
              clientRef: 'ref_iso',
            })
          ).duplicate,
        ).toBe(false);
      });
    });

    it('AC-M04-21 lead list applies OWN, UNIT_SUBTREE and TENANT record scope', async () => {
      const { tenantId, parties } = await h.newTenant();
      const [l1, l2, l3, l4] = [h.uid('l'), h.uid('l'), h.uid('l'), h.uid('l')];
      await saveLeads(tenantId, [
        Lead.restore(leadProps(l1, parties[0], { ownerMemberId: 'mem_1', orgUnitId: 'ou_1', createdAt: at(-40) })),
        Lead.restore(leadProps(l2, parties[1], { ownerMemberId: 'mem_2', orgUnitId: 'ou_1', createdAt: at(-30) })),
        Lead.restore(leadProps(l3, parties[2], { ownerMemberId: 'mem_3', orgUnitId: 'ou_2', createdAt: at(-20) })),
        Lead.restore(leadProps(l4, parties[0], { createdAt: at(-10) })),
      ]);
      const list = (scope: Parameters<LeadRepository['list']>[1]['scope']) =>
        h.run(tenantId, async (tx) => ids((await h.repos.leads.list(tx, { scope, at: NOW, limit: 10 })).items));
      expect(await list({ kind: 'TENANT' })).toEqual([l4, l3, l2, l1]);
      expect(await list({ kind: 'OWN', memberId: 'mem_2' })).toEqual([l2]);
      expect(await list({ kind: 'OWN' })).toEqual([]);
      expect(await list({ kind: 'UNIT_SUBTREE', orgUnitIds: ['ou_1'] })).toEqual([l2, l1]);
      expect(await list({ kind: 'UNIT_SUBTREE', orgUnitIds: ['ou_1', 'ou_2'] })).toEqual([l3, l2, l1]);
      expect(await list({ kind: 'UNIT_SUBTREE', orgUnitIds: [] })).toEqual([]);
    });

    it('AC-M04-02 lead list filters by stage, owner, unassigned, product, source and SLA state', async () => {
      const { tenantId, parties } = await h.newTenant();
      const [a, b, c, d] = [h.uid('l'), h.uid('l'), h.uid('l'), h.uid('l')];
      await saveLeads(tenantId, [
        Lead.restore(leadProps(a, parties[0], { ownerMemberId: 'mem_1', orgUnitId: 'ou_1', createdAt: at(-40), slaDueAt: at(-10) })), // unresponded, overdue -> breached
        Lead.restore(
          leadProps(b, parties[1], {
            ownerMemberId: 'mem_1',
            orgUnitId: 'ou_1',
            stage: 'CONTACTED',
            productInterest: 'HEALTH',
            attribution: attribution('REFERRAL'),
            createdAt: at(-30),
            slaDueAt: at(30),
          }),
        ), // pending
        Lead.restore(
          leadProps(c, parties[2], { stage: 'LOST', lostReason: 'NOT_INTERESTED', productInterest: 'MOTOR', createdAt: at(-20) }),
        ), // unassigned, no sla
        Lead.restore(
          leadProps(d, parties[0], {
            ownerMemberId: 'mem_2',
            orgUnitId: 'ou_1',
            createdAt: at(-10),
            slaDueAt: at(-50),
            firstRespondedAt: at(-40),
          }),
        ), // responded late -> breached
      ]);
      const list = (f: Partial<Parameters<LeadRepository['list']>[1]>) =>
        h.run(tenantId, async (tx) =>
          ids((await h.repos.leads.list(tx, { scope: { kind: 'TENANT' }, at: NOW, limit: 10, sort: 'createdAt', ...f })).items),
        );
      expect(await list({ stage: ['NEW', 'CONTACTED'] })).toEqual([a, b, d]);
      expect(await list({ stage: [] })).toEqual([a, b, c, d]);
      expect(await list({ ownerMemberId: 'mem_1' })).toEqual([a, b]);
      expect(await list({ ownerMemberId: 'unassigned' })).toEqual([c]);
      expect(await list({ productInterest: 'HEALTH' })).toEqual([b]);
      expect(await list({ source: 'REFERRAL' })).toEqual([b]);
      expect(await list({ source: 'WEB_FORM' })).toEqual([a, c, d]);
      expect(await list({ slaState: 'breached' })).toEqual([a, d]);
      expect(await list({ slaState: 'pending' })).toEqual([b]);
      expect(await list({ slaState: 'pending', at: new Date(at(45)) })).toEqual([]);
      expect(await list({ stage: ['NEW'], ownerMemberId: 'mem_1', slaState: 'breached' })).toEqual([a]);
    });

    it('AC-M04-02 lead list orders by createdAt asc/desc and slaDueAt (none last) and pages with a cursor', async () => {
      const { tenantId, parties } = await h.newTenant();
      const [a, b, c, d, e] = [h.uid('l'), h.uid('l'), h.uid('l'), h.uid('l'), h.uid('l')];
      await saveLeads(tenantId, [
        Lead.restore(leadProps(a, parties[0], { createdAt: at(-50), slaDueAt: at(30) })),
        Lead.restore(leadProps(b, parties[0], { createdAt: at(-40) })),
        Lead.restore(leadProps(c, parties[0], { createdAt: at(-30), slaDueAt: at(10) })),
        Lead.restore(leadProps(d, parties[0], { createdAt: at(-20), slaDueAt: at(20) })),
        Lead.restore(leadProps(e, parties[0], { createdAt: at(-10) })),
      ]);
      const first = (sort: 'createdAt' | '-createdAt' | 'slaDueAt' | undefined) =>
        h.run(tenantId, async (tx) => ids((await h.repos.leads.list(tx, { scope: { kind: 'TENANT' }, at: NOW, limit: 10, sort })).items));
      expect(await first('createdAt')).toEqual([a, b, c, d, e]);
      expect(await first('-createdAt')).toEqual([e, d, c, b, a]);
      expect(await first(undefined)).toEqual([e, d, c, b, a]);
      expect((await first('slaDueAt')).slice(0, 3)).toEqual([c, d, a]);

      const p1 = await h.run(tenantId, (tx) => h.repos.leads.list(tx, { scope: { kind: 'TENANT' }, at: NOW, limit: 2, sort: 'createdAt' }));
      expect(ids(p1.items)).toEqual([a, b]);
      expect(p1.nextCursor).toEqual(expect.any(String));
      const p2 = await h.run(tenantId, (tx) =>
        h.repos.leads.list(tx, { scope: { kind: 'TENANT' }, at: NOW, limit: 2, sort: 'createdAt', cursor: p1.nextCursor }),
      );
      expect(ids(p2.items)).toEqual([c, d]);
      const p3 = await h.run(tenantId, (tx) =>
        h.repos.leads.list(tx, { scope: { kind: 'TENANT' }, at: NOW, limit: 2, sort: 'createdAt', cursor: p2.nextCursor }),
      );
      expect(ids(p3.items)).toEqual([e]);
      expect(p3.nextCursor).toBeUndefined();
    });

    it('AC-M04-05 findOpenByParties returns the newest open lead created on or after the cutoff', async () => {
      const { tenantId, parties } = await h.newTenant();
      const [old, closed, recent, newest, other] = [h.uid('l'), h.uid('l'), h.uid('l'), h.uid('l'), h.uid('l')];
      await saveLeads(tenantId, [
        Lead.restore(leadProps(old, parties[0], { createdAt: at(-10 * DAY) })),
        Lead.restore(leadProps(closed, parties[0], { createdAt: at(-30), stage: 'LOST', lostReason: 'OTHER' })),
        Lead.restore(leadProps(recent, parties[0], { createdAt: at(-20) })),
        Lead.restore(leadProps(newest, parties[1], { createdAt: at(-10) })),
        Lead.restore(leadProps(other, parties[2], { createdAt: at(-5) })),
      ]);
      const find = (partyIds: string[], since: Date) =>
        h.run(tenantId, async (tx) => (await h.repos.leads.findOpenByParties(tx, partyIds, since))?.props.id);
      expect(await find([parties[0]], new Date(at(-DAY)))).toBe(recent);
      expect(await find([parties[0], parties[1]], new Date(at(-DAY)))).toBe(newest);
      expect(await find([parties[0]], new Date(at(-20)))).toBe(recent); // inclusive cutoff
      expect(await find([parties[0]], new Date(at(-19)))).toBeUndefined();
      expect(await find([parties[0]], new Date(at(-20 * DAY)))).toBe(recent);
      expect(await find([], new Date(at(-20 * DAY)))).toBeUndefined();
    });

    it('AC-M04-03 countOpenToday counts open leads assigned since the day start, per member, and follows reassignment', async () => {
      const { tenantId, parties } = await h.newTenant();
      const [a, b, c, d, e] = [h.uid('l'), h.uid('l'), h.uid('l'), h.uid('l'), h.uid('l')];
      const dayStart = new Date(at(-120));
      await saveLeads(tenantId, [
        Lead.restore(leadProps(a, parties[0], { ownerMemberId: 'mem_1', orgUnitId: 'ou_1', createdAt: at(-60), updatedAt: at(-60) })),
        Lead.restore(leadProps(b, parties[1], { ownerMemberId: 'mem_1', orgUnitId: 'ou_1', createdAt: at(-50), updatedAt: at(-50) })),
        Lead.restore(
          leadProps(c, parties[2], {
            ownerMemberId: 'mem_1',
            orgUnitId: 'ou_1',
            stage: 'LOST',
            lostReason: 'OTHER',
            createdAt: at(-40),
            updatedAt: at(-40),
          }),
        ), // closed
        Lead.restore(
          leadProps(d, parties[0], { ownerMemberId: 'mem_1', orgUnitId: 'ou_1', createdAt: at(-2 * DAY), updatedAt: at(-2 * DAY) }),
        ), // assigned before the day start
        Lead.restore(leadProps(e, parties[1], { ownerMemberId: 'mem_2', orgUnitId: 'ou_1', createdAt: at(-30), updatedAt: at(-30) })),
      ]);
      const count = (members: string[]) => h.run(tenantId, (tx) => h.repos.leads.countOpenToday(tx, members, dayStart));
      expect(await count(['mem_1', 'mem_2', 'mem_3'])).toEqual({ mem_1: 2, mem_2: 1 });
      expect(await count(['mem_2'])).toEqual({ mem_2: 1 });
      expect(await count([])).toEqual({});
      const lead = await h.run(tenantId, (tx) => h.repos.leads.get(tx, d));
      if (!lead) throw new Error('lead missing');
      lead.assign('mem_3', 'ou_1', 30, new Date(at(-5)));
      await h.run(tenantId, (tx) => h.repos.leads.save(tx, lead));
      expect(await count(['mem_1', 'mem_3'])).toEqual({ mem_1: 2, mem_3: 1 });
    });

    it('AC-M04-12 stats counts open and unassigned leads and the 7-day SLA-met percentage within scope', async () => {
      const { tenantId, parties } = await h.newTenant();
      const own = { ownerMemberId: 'mem_1', orgUnitId: 'ou_1' };
      await saveLeads(tenantId, [
        Lead.restore(
          leadProps(h.uid('l'), parties[0], {
            ...own,
            createdAt: at(-3 * DAY),
            slaDueAt: at(-3 * DAY + 30),
            firstRespondedAt: at(-3 * DAY + 10),
          }),
        ), // met
        Lead.restore(
          leadProps(h.uid('l'), parties[0], {
            ...own,
            createdAt: at(-2 * DAY),
            slaDueAt: at(-2 * DAY + 30),
            firstRespondedAt: at(-2 * DAY + 30),
          }),
        ), // met (on the dot)
        Lead.restore(
          leadProps(h.uid('l'), parties[0], { ...own, createdAt: at(-DAY), slaDueAt: at(-DAY + 30), firstRespondedAt: at(-DAY + 90) }),
        ), // breached (late)
        Lead.restore(leadProps(h.uid('l'), parties[0], { ...own, createdAt: at(-60), slaDueAt: at(-30) })), // breached (unresponded, overdue)
        Lead.restore(leadProps(h.uid('l'), parties[0], { ...own, createdAt: at(-30), slaDueAt: at(30) })), // pending: not counted
        Lead.restore(
          leadProps(h.uid('l'), parties[0], {
            ...own,
            createdAt: at(-9 * DAY),
            slaDueAt: at(-9 * DAY + 30),
            firstRespondedAt: at(-9 * DAY + 5),
          }),
        ), // older than 7 days: not counted
        Lead.restore(leadProps(h.uid('l'), parties[1], { createdAt: at(-20) })), // unassigned, no SLA
        Lead.restore(
          leadProps(h.uid('l'), parties[1], {
            ownerMemberId: 'mem_2',
            orgUnitId: 'ou_2',
            stage: 'CONVERTED',
            createdAt: at(-20),
            slaDueAt: at(-10),
            firstRespondedAt: at(-15),
          }),
        ), // closed, met
      ]);
      const stats = (scope: Parameters<LeadRepository['stats']>[1]) => h.run(tenantId, (tx) => h.repos.leads.stats(tx, scope, NOW));
      expect(await stats({ kind: 'TENANT' })).toEqual({ open: 7, unassigned: 1, slaMetPct7d: 60, leadToIssuedPct90d: null });
      expect(await stats({ kind: 'OWN', memberId: 'mem_1' })).toEqual({
        open: 6,
        unassigned: 0,
        slaMetPct7d: 50,
        leadToIssuedPct90d: null,
      });
      expect(await stats({ kind: 'UNIT_SUBTREE', orgUnitIds: ['ou_2'] })).toEqual({
        open: 0,
        unassigned: 0,
        slaMetPct7d: 100,
        leadToIssuedPct90d: null,
      });
      expect(await stats({ kind: 'OWN', memberId: 'nobody' })).toEqual({
        open: 0,
        unassigned: 0,
        slaMetPct7d: null,
        leadToIssuedPct90d: null,
      });
    });

    it('AC-M04-13 openForOwner, forParty and slaBreachCandidates select the right leads', async () => {
      const { tenantId, parties } = await h.newTenant();
      const [a, b, c, d, e, f] = [h.uid('l'), h.uid('l'), h.uid('l'), h.uid('l'), h.uid('l'), h.uid('l')];
      await saveLeads(tenantId, [
        Lead.restore(leadProps(a, parties[0], { ownerMemberId: 'mem_1', orgUnitId: 'ou_1', createdAt: at(-50), slaDueAt: at(-40) })), // breach candidate
        Lead.restore(
          leadProps(b, parties[0], {
            ownerMemberId: 'mem_1',
            orgUnitId: 'ou_1',
            stage: 'CONTACTED',
            createdAt: at(-45),
            slaDueAt: at(-30),
          }),
        ), // breach candidate
        Lead.restore(
          leadProps(c, parties[1], {
            ownerMemberId: 'mem_1',
            orgUnitId: 'ou_1',
            stage: 'QUALIFIED',
            createdAt: at(-40),
            slaDueAt: at(-30),
          }),
        ), // wrong stage
        Lead.restore(
          leadProps(d, parties[1], {
            ownerMemberId: 'mem_2',
            orgUnitId: 'ou_1',
            createdAt: at(-35),
            slaDueAt: at(-20),
            firstRespondedAt: at(-25),
          }),
        ), // responded
        Lead.restore(
          leadProps(e, parties[2], { ownerMemberId: 'mem_1', orgUnitId: 'ou_1', stage: 'LOST', lostReason: 'OTHER', createdAt: at(-30) }),
        ),
        Lead.restore(leadProps(f, parties[2], { ownerMemberId: 'mem_2', orgUnitId: 'ou_1', createdAt: at(-25), slaDueAt: at(5) })), // not due yet
      ]);
      await h.run(tenantId, async (tx) => {
        expect(ids(await h.repos.leads.openForOwner(tx, 'mem_1')).sort()).toEqual([a, b, c].sort());
        expect(ids(await h.repos.leads.forParty(tx, parties[0])).sort()).toEqual([a, b].sort());
        expect(ids(await h.repos.leads.forParty(tx, parties[2])).sort()).toEqual([e, f].sort());
        expect(ids(await h.repos.leads.slaBreachCandidates(tx, NOW, 10)).sort()).toEqual([a, b].sort());
        expect(await h.repos.leads.slaBreachCandidates(tx, NOW, 1)).toHaveLength(1);
        expect(await h.repos.leads.slaBreachCandidates(tx, new Date(at(-45)), 10)).toEqual([]);
      });
    });

    it('AC-M04-08 activity add stores a clientRef once and a replay returns the stored activity as a duplicate', async () => {
      const { tenantId } = await h.newTenant();
      const leadId = h.uid('lead');
      const original: Activity = {
        id: h.uid('act'),
        subjectType: 'LEAD',
        subjectId: leadId,
        kind: 'CALL',
        outcome: 'NO_ANSWER',
        summary: 'Rang twice',
        occurredAt: at(-5),
        actorMemberId: 'mem_1',
        clientRef: 'ref_1',
      };
      const first = await h.run(tenantId, (tx) => h.repos.activities.add(tx, original));
      expect(first).toEqual({ duplicate: false, activity: original });
      const replay = await h.run(tenantId, (tx) =>
        h.repos.activities.add(tx, { ...original, id: h.uid('act'), summary: 'changed', occurredAt: at(-1) }),
      );
      expect(replay).toEqual({ duplicate: true, activity: original });
      const noRef = { id: h.uid('act'), subjectType: 'LEAD' as const, subjectId: leadId, kind: 'NOTE' as const, occurredAt: at(-4) };
      expect((await h.run(tenantId, (tx) => h.repos.activities.add(tx, noRef))).duplicate).toBe(false);
      expect((await h.run(tenantId, (tx) => h.repos.activities.add(tx, { ...noRef, id: h.uid('act') }))).duplicate).toBe(false);
      expect(await h.run(tenantId, (tx) => h.repos.activities.forSubject(tx, 'LEAD', leadId, 10))).toHaveLength(3);
    });

    it('AC-M04-08 forSubject returns newest first within the limit and countCallAttempts counts only calls on the lead', async () => {
      const { tenantId } = await h.newTenant();
      const leadId = h.uid('lead');
      const other = h.uid('lead');
      const mk = (
        kind: Activity['kind'],
        minutes: number,
        subjectId = leadId,
        subjectType: Activity['subjectType'] = 'LEAD',
      ): Activity => ({ id: h.uid('act'), subjectType, subjectId, kind, occurredAt: at(minutes) });
      const acts = [
        mk('CALL', -50),
        mk('NOTE', -40),
        mk('CALL', -30),
        mk('WHATSAPP', -20),
        mk('CALL', -10, other),
        mk('CALL', -5, leadId, 'PARTY'),
      ];
      await h.run(tenantId, async (tx) => {
        for (const a of acts) await h.repos.activities.add(tx, a);
      });
      await h.run(tenantId, async (tx) => {
        expect((await h.repos.activities.forSubject(tx, 'LEAD', leadId, 10)).map((a) => a.id)).toEqual([
          acts[3].id,
          acts[2].id,
          acts[1].id,
          acts[0].id,
        ]);
        expect((await h.repos.activities.forSubject(tx, 'LEAD', leadId, 2)).map((a) => a.id)).toEqual([acts[3].id, acts[2].id]);
        expect(await h.repos.activities.countCallAttempts(tx, leadId)).toBe(2);
        expect(await h.repos.activities.countCallAttempts(tx, other)).toBe(1);
        expect(await h.repos.activities.countCallAttempts(tx, h.uid('none'))).toBe(0);
      });
    });

    const baseTask = (id: string, o: Partial<TaskProps> = {}): TaskProps => ({
      id,
      ownerMemberId: 'mem_1',
      subjectType: 'LEAD',
      subjectId: 'lead_x',
      kind: 'CALL',
      title: 'Call the lead',
      dueAt: at(60),
      status: 'OPEN',
      source: 'MANUAL',
      createdAt: at(-60),
      version: 1,
      ...o,
    });

    it('AC-M04-09 task round-trips, bumps the version and rejects a stale save', async () => {
      const { tenantId } = await h.newTenant();
      const id = h.uid('task');
      const full = baseTask(id, {
        kind: 'RENEWAL',
        subjectType: 'DUE',
        outcome: 'Promised on Friday',
        source: 'CADENCE',
        escalatedAt: at(-5),
        completedAt: at(-2),
        status: 'DONE',
      });
      const task = Task.restore(full);
      await h.run(tenantId, (tx) => h.repos.tasks.save(tx, task));
      expect(task.props.version).toBe(2);
      const first = await h.run(tenantId, (tx) => h.repos.tasks.get(tx, id));
      const second = await h.run(tenantId, (tx) => h.repos.tasks.get(tx, id));
      if (!first || !second) throw new Error('task missing');
      expect(first.props).toEqual({ ...full, version: 2 });
      first.reschedule(new Date(at(120)));
      await h.run(tenantId, (tx) => h.repos.tasks.save(tx, first));
      second.reschedule(new Date(at(180)));
      await expect(h.run(tenantId, (tx) => h.repos.tasks.save(tx, second))).rejects.toMatchObject({
        code: 'version_mismatch',
        httpStatus: 412,
      });
      expect((await h.run(tenantId, (tx) => h.repos.tasks.get(tx, id)))?.props).toMatchObject({ dueAt: at(120), version: 3 });
      expect(await h.run(tenantId, (tx) => h.repos.tasks.get(tx, h.uid('missing')))).toBeUndefined();
    });

    it('AC-M04-09 task list filters by owner set, status and kind, orders by due date and pages with a cursor', async () => {
      const { tenantId } = await h.newTenant();
      const [t1, t2, t3, t4, t5] = [h.uid('task'), h.uid('task'), h.uid('task'), h.uid('task'), h.uid('task')];
      await h.run(tenantId, async (tx) => {
        for (const p of [
          baseTask(t3, { dueAt: at(30), ownerMemberId: 'mem_2', kind: 'MEETING' }),
          baseTask(t1, { dueAt: at(10) }),
          baseTask(t4, { dueAt: at(40), status: 'DONE' }),
          baseTask(t2, { dueAt: at(20), kind: 'FOLLOW_UP' }),
          baseTask(t5, { dueAt: at(50), ownerMemberId: 'mem_3' }),
        ])
          await h.repos.tasks.save(tx, Task.restore(p));
      });
      const list = (f: Partial<Parameters<TaskRepository['list']>[1]>) =>
        h.run(tenantId, async (tx) => ids((await h.repos.tasks.list(tx, { at: NOW, limit: 10, ...f })).items));
      expect(await list({})).toEqual([t1, t2, t3, t4, t5]);
      expect(await list({ ownerMemberIds: ['mem_1'] })).toEqual([t1, t2, t4]);
      expect(await list({ ownerMemberIds: ['mem_1', 'mem_2'] })).toEqual([t1, t2, t3, t4]);
      expect(await list({ ownerMemberIds: [] })).toEqual([]);
      expect(await list({ status: 'OPEN' })).toEqual([t1, t2, t3, t5]);
      expect(await list({ kind: 'MEETING' })).toEqual([t3]);
      expect(await list({ ownerMemberIds: ['mem_1'], status: 'OPEN', kind: 'FOLLOW_UP' })).toEqual([t2]);
      const p1 = await h.run(tenantId, (tx) => h.repos.tasks.list(tx, { at: NOW, limit: 2 }));
      expect(ids(p1.items)).toEqual([t1, t2]);
      const p2 = await h.run(tenantId, (tx) => h.repos.tasks.list(tx, { at: NOW, limit: 2, cursor: p1.nextCursor }));
      expect(ids(p2.items)).toEqual([t3, t4]);
      const p3 = await h.run(tenantId, (tx) => h.repos.tasks.list(tx, { at: NOW, limit: 2, cursor: p2.nextCursor }));
      expect(ids(p3.items)).toEqual([t5]);
      expect(p3.nextCursor).toBeUndefined();
    });

    it('AC-M04-09 openForSubject, openForOwner and escalationCandidates select open, unescalated, 24h-overdue tasks', async () => {
      const { tenantId } = await h.newTenant();
      const [a, b, c, d, e, f] = [h.uid('task'), h.uid('task'), h.uid('task'), h.uid('task'), h.uid('task'), h.uid('task')];
      await h.run(tenantId, async (tx) => {
        for (const p of [
          baseTask(a, { dueAt: at(-DAY - 1), subjectId: 'lead_s' }), // 24h + 1 min overdue
          baseTask(b, { dueAt: at(-DAY), subjectId: 'lead_s' }), // exactly 24h: not yet
          baseTask(c, { dueAt: at(-2 * DAY), subjectId: 'lead_s', escalatedAt: at(-DAY) }), // already escalated
          baseTask(d, { dueAt: at(-3 * DAY), subjectId: 'lead_s', status: 'DONE' }),
          baseTask(e, { dueAt: at(-2 * DAY), subjectId: 'lead_t', ownerMemberId: 'mem_2', subjectType: 'OPPORTUNITY' }), // escalation candidate for another owner
          baseTask(f, { dueAt: at(5), subjectId: 'lead_s', subjectType: 'PARTY' }),
        ])
          await h.repos.tasks.save(tx, Task.restore(p));
      });
      await h.run(tenantId, async (tx) => {
        expect(ids(await h.repos.tasks.openForSubject(tx, 'LEAD', 'lead_s')).sort()).toEqual([a, b, c].sort());
        expect(ids(await h.repos.tasks.openForSubject(tx, 'OPPORTUNITY', 'lead_t'))).toEqual([e]);
        expect(ids(await h.repos.tasks.openForOwner(tx, 'mem_1')).sort()).toEqual([a, b, c, f].sort());
        expect(ids(await h.repos.tasks.openForOwner(tx, 'mem_2'))).toEqual([e]);
        expect(ids(await h.repos.tasks.escalationCandidates(tx, NOW, 10)).sort()).toEqual([a, e].sort());
        expect(await h.repos.tasks.escalationCandidates(tx, NOW, 1)).toHaveLength(1);
        expect(ids(await h.repos.tasks.escalationCandidates(tx, new Date(at(1)), 10)).sort()).toEqual([a, b, e].sort());
      });
    });

    const baseOpp = (id: string, partyId: string, o: Partial<OpportunityProps> = {}): OpportunityProps => ({
      id,
      partyId,
      productInterest: 'TERM_LIFE',
      title: 'Term plan',
      expectedPremium: Money.ofPaise(1_500_000),
      stage: 'DISCOVERY',
      ownerMemberId: 'mem_1',
      orgUnitId: 'ou_1',
      stageEnteredAt: at(-60),
      createdAt: at(-60),
      customFields: {},
      version: 1,
      ...o,
    });

    it('AC-M04-10 opportunity round-trips exact paise and JSON attribution, and rejects a stale save', async () => {
      const { tenantId, parties } = await h.newTenant();
      const leadId = h.uid('lead');
      await saveLeads(tenantId, [Lead.restore(leadProps(leadId, parties[0]))]);
      const id = h.uid('opp');
      const full = baseOpp(id, parties[0], {
        leadId,
        productInterest: 'HEALTH_FLOATER',
        title: 'Family floater',
        expectedPremium: Money.ofPaise(9_007_199_254_740),
        stage: 'ISSUED',
        attribution: attribution('REFERRAL'),
        insurerName: 'Star Health',
        issuedPolicySaleId: 'sale_77',
        stageEnteredAt: at(-10),
      });
      const opp = Opportunity.restore(full);
      await h.run(tenantId, (tx) => h.repos.opportunities.save(tx, opp));
      expect(opp.props.version).toBe(2);
      const first = await h.run(tenantId, (tx) => h.repos.opportunities.get(tx, id));
      const second = await h.run(tenantId, (tx) => h.repos.opportunities.get(tx, id));
      if (!first || !second) throw new Error('opportunity missing');
      expect(first.props).toEqual({ ...full, version: 2 });
      expect(first.props.expectedPremium.paise).toBe(9_007_199_254_740);
      first.updateExpectedPremium(Money.ofPaise(100));
      await h.run(tenantId, (tx) => h.repos.opportunities.save(tx, first));
      second.updateExpectedPremium(Money.ofPaise(200));
      await expect(h.run(tenantId, (tx) => h.repos.opportunities.save(tx, second))).rejects.toMatchObject({
        code: 'version_mismatch',
        httpStatus: 412,
      });
      expect((await h.run(tenantId, (tx) => h.repos.opportunities.get(tx, id)))?.props.expectedPremium.paise).toBe(100);
      expect(await h.run(tenantId, (tx) => h.repos.opportunities.get(tx, h.uid('missing')))).toBeUndefined();
    });

    it('AC-CR001-08 lead and opportunity custom_fields round-trip, are replaced on save and stay tenant-isolated', async () => {
      const a = await h.newTenant();
      const b = await h.newTenant();
      const leadId = h.uid('lead');
      const oppId = h.uid('opp');
      const leadValues = { source_note: 'Met at expo', budget_paise: 2_500_000, hot: true };
      const oppValues = { riders: 'CRITICAL_ILLNESS', sum_assured_paise: 10_000_000 };
      await h.run(a.tenantId, async (tx) => {
        await h.repos.leads.save(tx, Lead.restore(leadProps(leadId, a.parties[0], { customFields: leadValues })));
        await h.repos.opportunities.save(tx, Opportunity.restore(baseOpp(oppId, a.parties[0], { customFields: oppValues })));
      });
      expect((await h.run(a.tenantId, (tx) => h.repos.leads.get(tx, leadId)))?.props.customFields).toEqual(leadValues);
      expect((await h.run(a.tenantId, (tx) => h.repos.opportunities.get(tx, oppId)))?.props.customFields).toEqual(oppValues);
      await h.run(a.tenantId, async (tx) => {
        const lead = await h.repos.leads.get(tx, leadId);
        const opp = await h.repos.opportunities.get(tx, oppId);
        if (!lead || !opp) throw new Error('missing');
        lead.replaceCustomFields({ budget_paise: 3_000_000 }, NOW);
        opp.replaceCustomFields({});
        await h.repos.leads.save(tx, lead);
        await h.repos.opportunities.save(tx, opp);
      });
      const lead = await h.run(a.tenantId, (tx) => h.repos.leads.get(tx, leadId));
      expect(lead?.props.customFields).toEqual({ budget_paise: 3_000_000 });
      expect(lead?.props.version).toBe(3);
      expect((await h.run(a.tenantId, (tx) => h.repos.opportunities.get(tx, oppId)))?.props.customFields).toEqual({});
      expect(await h.run(b.tenantId, (tx) => h.repos.leads.get(tx, leadId))).toBeUndefined();
    });

    it('AC-M04-10 board applies record scope, owner and product filters and orders by stage entry', async () => {
      const { tenantId, parties } = await h.newTenant();
      const [a, b, c, d] = [h.uid('opp'), h.uid('opp'), h.uid('opp'), h.uid('opp')];
      await h.run(tenantId, async (tx) => {
        for (const p of [
          baseOpp(c, parties[0], { ownerMemberId: 'mem_2', orgUnitId: 'ou_2', productInterest: 'HEALTH', stageEnteredAt: at(-10) }),
          baseOpp(a, parties[0], { stageEnteredAt: at(-40) }),
          baseOpp(d, parties[1], { ownerMemberId: 'mem_3', orgUnitId: 'ou_3', stageEnteredAt: at(-5), stage: 'LOST', lostReason: 'OTHER' }),
          baseOpp(b, parties[1], { stageEnteredAt: at(-20), productInterest: 'HEALTH' }),
        ])
          await h.repos.opportunities.save(tx, Opportunity.restore(p));
      });
      const board = (f: Parameters<OpportunityRepository['board']>[1]) =>
        h.run(tenantId, async (tx) => ids(await h.repos.opportunities.board(tx, f)));
      expect(await board({ scope: { kind: 'TENANT' } })).toEqual([a, b, c, d]);
      expect(await board({ scope: { kind: 'OWN', memberId: 'mem_1' } })).toEqual([a, b]);
      expect(await board({ scope: { kind: 'UNIT_SUBTREE', orgUnitIds: ['ou_2', 'ou_3'] } })).toEqual([c, d]);
      expect(await board({ scope: { kind: 'TENANT' }, ownerMemberId: 'mem_2' })).toEqual([c]);
      expect(await board({ scope: { kind: 'TENANT' }, productInterest: 'HEALTH' })).toEqual([b, c]);
      expect(await board({ scope: { kind: 'OWN', memberId: 'mem_1' }, productInterest: 'HEALTH' })).toEqual([b]);
    });

    it('AC-M04-10 findByProposal, openForOwner and forParty', async () => {
      const { tenantId, parties } = await h.newTenant();
      const [a, b, c] = [h.uid('opp'), h.uid('opp'), h.uid('opp')];
      await h.run(tenantId, async (tx) => {
        for (const p of [
          baseOpp(a, parties[0], { createdAt: at(-30) }),
          baseOpp(b, parties[0], { createdAt: at(-20), stage: 'LOST', lostReason: 'OTHER' }),
          baseOpp(c, parties[1], { createdAt: at(-10), stage: 'ISSUED', issuedPolicySaleId: 'sale_1', ownerMemberId: 'mem_2' }),
        ])
          await h.repos.opportunities.save(tx, Opportunity.restore(p));
      });
      await h.run(tenantId, async (tx) => {
        expect(await h.repos.opportunities.findByProposal(tx, 'prop_unknown')).toBeUndefined();
        expect(ids(await h.repos.opportunities.openForOwner(tx, 'mem_1'))).toEqual([a]);
        expect(await h.repos.opportunities.openForOwner(tx, 'mem_2')).toEqual([]);
        expect(ids(await h.repos.opportunities.forParty(tx, parties[0])).sort()).toEqual([a, b].sort());
        expect(ids(await h.repos.opportunities.forParty(tx, parties[1]))).toEqual([c]);
      });
    });

    const rule = (id: string, priority: number, o: Partial<RoutingRule> = {}): RoutingRule => ({
      id,
      priority,
      name: `Rule ${id}`,
      active: true,
      conditions: [
        { field: 'productInterest', op: 'in', value: ['HEALTH', 'MOTOR'] },
        { field: 'pincodePrefix', op: 'startsWith', value: '560' },
      ],
      method: 'ROUND_ROBIN',
      targetOrgUnitId: 'ou_blr',
      slaMinutes: 30,
      onBreach: 'NOTIFY_THEN_REASSIGN',
      reassignAfterMinutes: 60,
      capacityPerPerson: 25,
      ...o,
    });

    it('AC-M04-04 routing rules are replaced as a set, listed in priority order, and keep their JSON body', async () => {
      const { tenantId } = await h.newTenant();
      expect(await h.run(tenantId, (tx) => h.repos.rules.list(tx))).toEqual([]);
      const r1 = rule('rule_a', 1);
      const r2 = rule('rule_b', 2, {
        conditions: [],
        method: 'DIRECT_OWNER',
        onBreach: undefined,
        reassignAfterMinutes: undefined,
        capacityPerPerson: undefined,
        active: false,
      });
      await h.run(tenantId, (tx) => h.repos.rules.replaceAll(tx, [r1, r2]));
      expect(await h.run(tenantId, (tx) => h.repos.rules.list(tx))).toEqual([r1, r2]);
      const r3 = rule('rule_c', 1, { method: 'LEAST_LOADED' });
      await h.run(tenantId, (tx) => h.repos.rules.replaceAll(tx, [r3]));
      expect(await h.run(tenantId, (tx) => h.repos.rules.list(tx))).toEqual([r3]);
      await h.run(tenantId, (tx) => h.repos.rules.replaceAll(tx, []));
      expect(await h.run(tenantId, (tx) => h.repos.rules.list(tx))).toEqual([]);
    });

    it('AC-M04-04 the round-robin cursor is per rule and per tenant and is overwritten by setCursor', async () => {
      const a = await h.newTenant();
      const b = await h.newTenant();
      await h.run(a.tenantId, async (tx) => {
        expect(await h.repos.rules.cursor(tx, 'rule_a')).toBeUndefined();
        await h.repos.rules.setCursor(tx, 'rule_a', 'mem_1');
        await h.repos.rules.setCursor(tx, 'rule_b', 'mem_9');
      });
      await h.run(a.tenantId, async (tx) => {
        expect(await h.repos.rules.cursor(tx, 'rule_a')).toBe('mem_1');
        await h.repos.rules.setCursor(tx, 'rule_a', 'mem_2');
      });
      await h.run(a.tenantId, async (tx) => {
        expect(await h.repos.rules.cursor(tx, 'rule_a')).toBe('mem_2');
        expect(await h.repos.rules.cursor(tx, 'rule_b')).toBe('mem_9');
      });
      expect(await h.run(b.tenantId, (tx) => h.repos.rules.cursor(tx, 'rule_a'))).toBeUndefined();
    });

    it('AC-M04-20 lead import batches are found by checksum and rows are remembered per tenant', async () => {
      const a = await h.newTenant();
      const b = await h.newTenant();
      const batch = {
        id: h.uid('imp'),
        fileChecksum: `sum_${h.uid('x')}`,
        sourceTag: 'diwali-camp',
        summary: { imported: 8, duplicates: 1, rejected: 1, skippedAlreadyImported: 0 },
        createdAt: at(-15),
      };
      await h.run(a.tenantId, async (tx) => {
        expect(await h.repos.imports.findBatchByChecksum(tx, batch.fileChecksum)).toBeUndefined();
        await h.repos.imports.saveBatch(tx, batch);
        expect(await h.repos.imports.rowSeen(tx, 'row_1')).toBe(false);
        await h.repos.imports.markRow(tx, 'row_1', batch.id);
        await h.repos.imports.markRow(tx, 'row_1', batch.id); // idempotent
      });
      await h.run(a.tenantId, async (tx) => {
        expect(await h.repos.imports.findBatchByChecksum(tx, batch.fileChecksum)).toEqual(batch);
        expect(await h.repos.imports.rowSeen(tx, 'row_1')).toBe(true);
        expect(await h.repos.imports.rowSeen(tx, 'row_2')).toBe(false);
        await h.repos.imports.saveBatch(tx, { ...batch, summary: { ...batch.summary, imported: 9 } }); // saving again replaces by id
      });
      expect((await h.run(a.tenantId, (tx) => h.repos.imports.findBatchByChecksum(tx, batch.fileChecksum)))?.summary.imported).toBe(9);
      await h.run(b.tenantId, async (tx) => {
        expect(await h.repos.imports.findBatchByChecksum(tx, batch.fileChecksum)).toBeUndefined();
        expect(await h.repos.imports.rowSeen(tx, 'row_1')).toBe(false);
      });
    });

    it('AC-M04-01 public lead guard rejects a honeypot hit and rate-limits the 11th hit per IP hash in 10 minutes', async () => {
      const { tenantId } = await h.newTenant();
      const ip = h.uid('ip');
      await expect(h.run(tenantId, (tx) => h.repos.guard.check(tx, { ipHash: ip, honeypot: 'bot', at: NOW }))).rejects.toMatchObject({
        code: 'spam_detected',
        httpStatus: 400,
      });
      for (let i = 0; i < 10; i += 1)
        await h.run(tenantId, (tx) => h.repos.guard.check(tx, { ipHash: ip, honeypot: '', at: new Date(T0 + i * 1000) }));
      const limited = h.run(tenantId, (tx) => h.repos.guard.check(tx, { ipHash: ip, at: new Date(T0 + 11_000) }));
      await expect(limited).rejects.toMatchObject({
        code: 'public_lead_rate_limited',
        httpStatus: 429,
        details: { retryAfterSeconds: 600 },
      });
      await expect(
        h.run(tenantId, (tx) => h.repos.guard.check(tx, { ipHash: h.uid('ip2'), at: new Date(T0 + 11_000) })),
      ).resolves.toBeUndefined();
      // rolling window: after exactly 10 minutes the first hit (T0) is out, so one more is allowed; a millisecond later the window is full again
      await expect(
        h.run(tenantId, (tx) => h.repos.guard.check(tx, { ipHash: ip, at: new Date(T0 + 10 * 60_000) })),
      ).resolves.toBeUndefined();
      await expect(
        h.run(tenantId, (tx) => h.repos.guard.check(tx, { ipHash: ip, at: new Date(T0 + 10 * 60_000 + 1) })),
      ).rejects.toMatchObject({ code: 'public_lead_rate_limited' });
    });

    it('AC-M04-01 the public lead rate window is per tenant', async () => {
      const a = await h.newTenant();
      const b = await h.newTenant();
      const ip = h.uid('ip');
      for (let i = 0; i < 10; i += 1) await h.run(a.tenantId, (tx) => h.repos.guard.check(tx, { ipHash: ip, at: new Date(T0 + i) }));
      await expect(h.run(a.tenantId, (tx) => h.repos.guard.check(tx, { ipHash: ip, at: new Date(T0 + 20) }))).rejects.toMatchObject({
        code: 'public_lead_rate_limited',
      });
      await expect(h.run(b.tenantId, (tx) => h.repos.guard.check(tx, { ipHash: ip, at: new Date(T0 + 20) }))).resolves.toBeUndefined();
    });

    it('AC-M04-18 sync state round-trips per object and id, overwrites, is tenant-scoped and never bumps a record version', async () => {
      const a = await h.newTenant();
      const b = await h.newTenant();
      const leadId = h.uid('lead');
      const lead = Lead.restore(leadProps(leadId, a.parties[0]));
      await h.run(a.tenantId, (tx) => h.repos.leads.save(tx, lead));
      expect(lead.props.version).toBe(2);
      expect(await h.run(a.tenantId, (tx) => h.repos.sync.get(tx, 'lead', leadId))).toBeUndefined();

      const pending = { state: 'pending' as const, attempts: 0, updatedAt: at(1) };
      await h.run(a.tenantId, (tx) => h.repos.sync.set(tx, 'lead', leadId, pending));
      expect(await h.run(a.tenantId, (tx) => h.repos.sync.get(tx, 'lead', leadId))).toEqual(pending);
      const failed = { state: 'failed' as const, externalRef: 'tw_1', attempts: 2, lastError: 'twenty 503', updatedAt: at(2) };
      await h.run(a.tenantId, (tx) => h.repos.sync.set(tx, 'lead', leadId, failed));
      expect(await h.run(a.tenantId, (tx) => h.repos.sync.get(tx, 'lead', leadId))).toEqual(failed);
      const synced = { state: 'synced' as const, externalRef: 'tw_1', attempts: 0, updatedAt: at(3) };
      await h.run(a.tenantId, (tx) => h.repos.sync.set(tx, 'lead', leadId, synced));
      expect(await h.run(a.tenantId, (tx) => h.repos.sync.get(tx, 'lead', leadId))).toEqual(synced);

      expect(await h.run(a.tenantId, (tx) => h.repos.sync.get(tx, 'task', leadId))).toBeUndefined(); // keyed by object too
      await h.run(a.tenantId, (tx) => h.repos.sync.set(tx, 'person', a.parties[0], synced)); // person is keyed by party id
      expect(await h.run(a.tenantId, (tx) => h.repos.sync.get(tx, 'person', a.parties[0]))).toEqual(synced);
      expect(await h.run(b.tenantId, (tx) => h.repos.sync.get(tx, 'lead', leadId))).toBeUndefined();

      // the version is untouched, so a user's If-Match (the aggregate version) still saves
      const reloaded = await h.run(a.tenantId, (tx) => h.repos.leads.get(tx, leadId));
      expect(reloaded?.props.version).toBe(2);
      if (!reloaded) throw new Error('lead missing');
      reloaded.setTemperature('HOT');
      await h.run(a.tenantId, (tx) => h.repos.leads.save(tx, reloaded));
      expect((await h.run(a.tenantId, (tx) => h.repos.leads.get(tx, leadId)))?.props).toMatchObject({
        temperature: 'HOT',
        version: 3,
        syncState: 'local',
      });
      expect(await h.run(a.tenantId, (tx) => h.repos.sync.get(tx, 'lead', leadId))).toEqual(synced); // and saving the lead leaves the sync row alone
    });
  });
}
