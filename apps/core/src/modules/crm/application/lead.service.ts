import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleError, NotFoundError, PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { CustomFieldValidator } from '../../../kernel/custom-fields';
import { Principal } from '../../../kernel/tenancy/principal';
import { Lead, LeadStage, LostReason, Qualification, Temperature, lineOfBusiness } from '../domain/lead';
import { SensitiveContentGuard } from '../domain/activity';
import { StageRuleSet } from '../domain/stage-rules';
import { CRM_EVENTS } from '../domain/events';
import {
  ACTIVITY_REPOSITORY,
  ActivityRepository,
  CRM_PORT_FACTORY,
  LEAD_REPOSITORY,
  LeadFilter,
  LeadRepository,
  PARTY_FACADE,
  PartyFacade,
  POS_ELIGIBILITY,
  PosEligibilityPolicy,
  RECORD_SCOPE_PROVIDER,
  RecordScopeProvider,
  SELLER_DIRECTORY,
  STAGE_RULES,
  SellerDirectory,
  Transaction,
} from './ports';
import { DefaultCrmPortFactory } from './crm-port';
import { CrmContext } from './crm-context';
import { inScope } from './crm-scope';
import { LeadViews } from './lead-views';
import { LeadAssignment } from './lead-assignment';

/** Collaborators for lead reads/writes, grouped so the service constructor stays small. */
@Injectable()
export class LeadDeps {
  constructor(
    @Inject(LEAD_REPOSITORY) readonly leads: LeadRepository,
    @Inject(ACTIVITY_REPOSITORY) readonly activities: ActivityRepository,
    @Inject(RECORD_SCOPE_PROVIDER) readonly scopes: RecordScopeProvider,
    @Inject(SELLER_DIRECTORY) readonly sellers: SellerDirectory,
    @Inject(PARTY_FACADE) readonly parties: PartyFacade,
    @Inject(POS_ELIGIBILITY) readonly pos: PosEligibilityPolicy,
    @Inject(STAGE_RULES) readonly stageRules: StageRuleSet,
    @Inject(CRM_PORT_FACTORY) readonly ports: DefaultCrmPortFactory,
  ) {}
}

export type LeadListQuery = Omit<LeadFilter, 'scope' | 'at'> & { q?: string };

/** Leads: scoped reads, stage moves with entry rules, qualification, assignment, linking (M04 §5.2). */
@Injectable()
export class LeadService {
  constructor(
    private readonly d: LeadDeps,
    private readonly views: LeadViews,
    private readonly assignment: LeadAssignment,
    private readonly ctx: CrmContext,
  ) {}

  get(principal: Principal, id: string) {
    return this.ctx.uow.run(principal.tenantId, async (tx) => this.views.detail(tx, await this.requireInScope(tx, principal, id)));
  }

  list(principal: Principal, query: LeadListQuery) {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const scope = await this.d.scopes.resolve(tx, principal);
      const { q, ...filter } = query;
      const page = await this.d.leads.list(tx, { ...filter, scope, at: this.ctx.clock.now() });
      const items = await this.views.listItems(tx, page.items);
      // Names live in M03 (encrypted contacts never reach the CRM store), so text search filters the page's views.
      const needle = q?.trim().toLowerCase();
      return { items: needle ? items.filter((i) => i.name.toLowerCase().includes(needle)) : items, nextCursor: page.nextCursor };
    });
  }

  stats(principal: Principal) {
    return this.ctx.uow.run(principal.tenantId, async (tx) =>
      this.d.leads.stats(tx, await this.d.scopes.resolve(tx, principal), this.ctx.clock.now()),
    );
  }

  transition(principal: Principal, id: string, input: { to: Exclude<LeadStage, 'CONVERTED'>; lostReason?: LostReason }) {
    return this.mutate(principal, id, async (tx, lead) => {
      const from = lead.props.stage;
      const [activities, consentRecorded] = await Promise.all([
        this.d.activities.forSubject(tx, 'LEAD', id, 200),
        this.views.consentRecorded(tx, lead.props.partyId),
      ]);
      lead.moveTo(
        input.to,
        this.d.stageRules,
        { activities, lead: lead.props, consentRecorded },
        this.ctx.clock.now(),
        actor(principal),
        input.lostReason,
      );
      await this.d.activities.add(tx, {
        id: this.ctx.ids.next('act'),
        subjectType: 'LEAD',
        subjectId: id,
        kind: 'STAGE_CHANGE',
        summary: `${from} → ${input.to}`,
        occurredAt: this.ctx.clock.now().toISOString(),
        actorMemberId: principal.memberId,
      });
      return { type: CRM_EVENTS.LEAD_STAGE_CHANGED, data: { leadId: id, from, to: input.to } };
    });
  }

  qualify(principal: Principal, id: string, q: Qualification) {
    if (q.existingCover) SensitiveContentGuard.check(q.existingCover);
    return this.mutate(principal, id, async (_tx, lead) => {
      lead.qualify(q);
      return undefined;
    });
  }

  /**
   * Full replace of custom-field values (M04 section 11.1): scope (404), version (412), validate (400), save, audit keys only.
   * Keys of definitions that are no longer active are hidden but preserved. No domain event, no Twenty content.
   */
  replaceCustomFields(principal: Principal, id: string, values: unknown, expectedVersion: number) {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const lead = await this.requireInScope(tx, principal, id);
      if (lead.props.version !== expectedVersion)
        throw new PreconditionFailedError('version_mismatch', 'The lead was changed by someone else; reload and retry');
      const defs = await this.ctx.defs.activeFor(tx, 'lead');
      const validated = CustomFieldValidator.validate(defs, values);
      const active = new Set(defs.map((d) => d.key));
      const preserved = Object.fromEntries(Object.entries(lead.props.customFields).filter(([k]) => !active.has(k)));
      lead.replaceCustomFields({ ...preserved, ...validated }, this.ctx.clock.now());
      await (await this.d.ports.forTenant(tx.tenantId)).saveLead(tx, lead);
      await this.ctx.recorder.record(tx, {
        audit: {
          action: 'crm.custom_fields.replaced',
          entityType: 'lead',
          entityId: id,
          metadata: { subjectType: 'lead', subjectId: id, keys: Object.keys(validated) },
        },
      });
      return this.views.detail(tx, lead);
    });
  }

  setTemperature(principal: Principal, id: string, t: Temperature) {
    return this.mutate(principal, id, async (_tx, lead) => {
      lead.setTemperature(t);
      return undefined;
    });
  }

  assign(principal: Principal, id: string, memberId: string) {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const lead = await this.requireInScope(tx, principal, id);
      const reason = await this.assignOne(tx, lead, memberId, principal);
      if (reason) throw new BusinessRuleError('assignee_ineligible', reason, { memberId });
      return this.views.detail(tx, lead);
    });
  }

  bulkAssign(principal: Principal, leadIds: string[], memberId: string) {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const assigned: string[] = [];
      const skipped: Array<{ leadId: string; reason: string }> = [];
      for (const leadId of leadIds) {
        const lead = await this.findInScope(tx, principal, leadId);
        const reason = lead ? await this.assignOne(tx, lead, memberId, principal) : 'Not found';
        if (reason) skipped.push({ leadId, reason });
        else assigned.push(leadId);
      }
      return { assigned, skipped };
    });
  }

  linkToCustomer(principal: Principal, id: string, existingPartyId: string) {
    return this.mutate(principal, id, async (tx, lead) => {
      const from = lead.props.partyId;
      if (from !== existingPartyId) await this.d.parties.absorb(tx, from, existingPartyId);
      lead.relinkParty(existingPartyId);
      return { type: CRM_EVENTS.LEAD_PARTY_LINKED, data: { leadId: id, fromPartyId: from, toPartyId: existingPartyId } };
    });
  }

  async requireInScope(tx: Transaction, principal: Principal, id: string): Promise<Lead> {
    const lead = await this.findInScope(tx, principal, id);
    if (!lead) throw new NotFoundError('lead', id);
    return lead;
  }

  /** Returns undefined when assigned, else the human-readable skip reason. */
  private async assignOne(tx: Transaction, lead: Lead, memberId: string, principal: Principal): Promise<string | undefined> {
    if (['CONVERTED', 'LOST'].includes(lead.props.stage)) return 'Lead is closed';
    const product = lead.props.productInterest;
    const eligible = await this.d.sellers.eligibleSellers(tx, {
      line: lineOfBusiness(product),
      posEligibleProduct: await this.d.pos.isPosEligible(product),
      at: this.ctx.clock.now(),
    });
    const seller = eligible.find((s) => s.memberId === memberId);
    if (!seller) return 'Ineligible: licence or product scope';
    await this.assignment.assign(tx, lead, await this.d.ports.forTenant(tx.tenantId), {
      memberId,
      orgUnitId: seller.orgUnitId,
      by: actor(principal),
    });
    await this.ctx.recorder.record(tx, {
      event: { type: CRM_EVENTS.LEAD_ASSIGNED, subject: lead.props.id, data: { leadId: lead.props.id, ownerMemberId: memberId } },
      audit: { action: CRM_EVENTS.LEAD_ASSIGNED, entityType: 'lead', entityId: lead.props.id, metadata: { ownerMemberId: memberId } },
    });
    return undefined;
  }

  private async findInScope(tx: Transaction, principal: Principal, id: string): Promise<Lead | undefined> {
    const lead = await this.d.leads.get(tx, id);
    if (!lead) return undefined;
    // Unassigned leads are visible to tenant-wide and unit scopes via the lead's org unit; OWN sees only its own.
    return inScope(lead.props, await this.d.scopes.resolve(tx, principal)) ? lead : undefined;
  }

  private mutate(
    principal: Principal,
    id: string,
    change: (tx: Transaction, lead: Lead) => Promise<{ type: string; data: Record<string, unknown> } | undefined>,
  ) {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const lead = await this.requireInScope(tx, principal, id);
      const event = await change(tx, lead);
      await (await this.d.ports.forTenant(tx.tenantId)).saveLead(tx, lead);
      if (event) {
        await this.ctx.recorder.record(tx, {
          event: { ...event, subject: id },
          audit: { action: event.type, entityType: 'lead', entityId: id, metadata: event.data },
        });
      }
      return this.views.detail(tx, lead);
    });
  }
}

function actor(principal: Principal): string {
  return principal.memberId ?? principal.userRef;
}
