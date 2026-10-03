import { Inject, Injectable } from '@nestjs/common';
import { DomainEvent } from '../../../kernel/domain/domain-event';
import { INBOX } from '../../../kernel/tokens';
import { Inbox } from '../../../kernel/outbox/inbox';
import { CRM_EVENTS } from '../domain/events';
import {
  CRM_PORT_FACTORY, LEAD_REPOSITORY, LeadRepository, OPPORTUNITY_REPOSITORY, OpportunityRepository, ROUTING_RULE_REPOSITORY, RoutingRuleRepository,
  TASK_REPOSITORY, TaskRepository, Transaction,
} from './ports';
import { DefaultCrmPortFactory } from './crm-port';
import { CrmContext } from './crm-context';
import { LeadAssignment } from './lead-assignment';
import { OpportunityService, PolicyIssuedEvent } from './opportunity.service';

const CONSUMER = 'crm';

/** Event reactions from other modules; every handler is idempotent through the kernel inbox (M04 §5.2). */
@Injectable()
export class CrmSubscribers {
  constructor(
    @Inject(LEAD_REPOSITORY) private readonly leads: LeadRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(OPPORTUNITY_REPOSITORY) private readonly opportunities: OpportunityRepository,
    @Inject(INBOX) private readonly inbox: Inbox,
    @Inject(CRM_PORT_FACTORY) private readonly ports: DefaultCrmPortFactory,
    private readonly opportunityService: OpportunityService,
    private readonly ctx: CrmContext,
  ) {}

  /** distribution.member.exited → open leads, tasks and opportunities move to the transfer target (F97), else leads unassign. */
  onMemberExited(event: DomainEvent<{ memberId?: string; transferToMemberId?: string | null }>): Promise<boolean> {
    return this.inbox.processOnce(CONSUMER, event.id, () =>
      this.ctx.uow.run(event.tenantId, async (tx) => {
        const from = event.data.memberId ?? event.subject;
        const to = event.data.transferToMemberId ?? undefined;
        const port = await this.ports.forTenant(tx.tenantId);
        for (const lead of await this.leads.openForOwner(tx, from)) {
          if (to) lead.assign(to, lead.props.orgUnitId ?? '', undefined, this.ctx.clock.now());
          else lead.unassign();
          await port.saveLead(tx, lead);
        }
        if (!to) return;
        for (const task of await this.tasks.openForOwner(tx, from)) {
          task.reassign(to);
          await port.saveTask(tx, task);
        }
        for (const opp of await this.opportunities.openForOwner(tx, from)) {
          opp.reassign(to);
          await port.saveOpportunity(tx, opp);
        }
      }),
    );
  }

  /** party.party.merged → leads and opportunities follow the survivor. */
  onPartyMerged(event: DomainEvent<{ survivorId: string; mergedId: string }>): Promise<boolean> {
    return this.inbox.processOnce(CONSUMER, event.id, () =>
      this.ctx.uow.run(event.tenantId, async (tx) => {
        const port = await this.ports.forTenant(tx.tenantId);
        for (const lead of await this.leads.forParty(tx, event.data.mergedId)) {
          lead.relinkParty(event.data.survivorId);
          await port.saveLead(tx, lead);
        }
        for (const opp of await this.opportunities.forParty(tx, event.data.mergedId)) {
          opp.relinkParty(event.data.survivorId);
          await port.saveOpportunity(tx, opp);
        }
      }),
    );
  }

  /** proposal.policy.issued → the linked opportunity becomes ISSUED exactly once. */
  onPolicyIssued(event: DomainEvent<PolicyIssuedEvent>): Promise<boolean> {
    return this.inbox.processOnce(CONSUMER, event.id, () => this.opportunityService.onPolicyIssued(event));
  }
}

/** SLA sweep job: breached first responses are announced; NOTIFY_THEN_REASSIGN rules re-route after their delay. */
@Injectable()
export class SlaSweepJob {
  constructor(
    @Inject(LEAD_REPOSITORY) private readonly leads: LeadRepository,
    @Inject(ROUTING_RULE_REPOSITORY) private readonly rules: RoutingRuleRepository,
    @Inject(CRM_PORT_FACTORY) private readonly ports: DefaultCrmPortFactory,
    private readonly assignment: LeadAssignment,
    private readonly ctx: CrmContext,
  ) {}

  run(tenantId: string, limit = 200): Promise<{ breached: number; rerouted: number }> {
    return this.ctx.uow.run(tenantId, async (tx) => {
      const now = this.ctx.clock.now();
      const rules = new Map((await this.rules.list(tx)).map((r) => [r.id, r]));
      let breached = 0;
      let rerouted = 0;
      for (const lead of await this.leads.slaBreachCandidates(tx, now, limit)) {
        if (lead.slaState(now) !== 'breached') continue;
        const rule = lead.props.routedByRuleId ? rules.get(lead.props.routedByRuleId) : undefined;
        if (!lead.props.slaBreachNotifiedAt) {
          breached += 1;
          lead.markSlaBreachNotified(now);
          await (await this.ports.forTenant(tx.tenantId)).saveLead(tx, lead);
          await this.announce(tx, lead.props.id, lead.props.ownerMemberId);
        }
        const overdueMs = now.getTime() - Date.parse(lead.props.slaDueAt ?? '');
        if (rule?.onBreach === 'NOTIFY_THEN_REASSIGN' && overdueMs >= (rule.reassignAfterMinutes ?? 0) * 60_000) {
          await this.assignment.route(tx, lead, await this.ports.forTenant(tx.tenantId), { solo: false, exclude: lead.props.ownerMemberId });
          rerouted += 1;
        }
      }
      return { breached, rerouted };
    });
  }

  private announce(tx: Transaction, leadId: string, ownerMemberId: string | undefined): Promise<void> {
    return this.ctx.recorder.record(tx, {
      event: { type: CRM_EVENTS.LEAD_SLA_BREACHED, subject: leadId, data: { leadId, ownerMemberId: ownerMemberId ?? null } },
      audit: { action: CRM_EVENTS.LEAD_SLA_BREACHED, entityType: 'lead', entityId: leadId },
    });
  }
}
