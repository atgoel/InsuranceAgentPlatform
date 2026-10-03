import { Inject, Injectable } from '@nestjs/common';
import { Lead } from '../domain/lead';
import { Task } from '../domain/task';
import { CadencePolicy, TaskDraft } from '../domain/cadence';
import { CRM_EVENTS } from '../domain/events';
import { RoutingDecision } from '../domain/routing/routing-engine';
import { ACTIVITY_REPOSITORY, ActivityRepository, CADENCE_POLICY, CrmPort, Transaction } from './ports';
import { CrmContext } from './crm-context';
import { RoutingService } from './routing.service';

/** Route → assign → first task → events. Shared by capture, import, SLA re-routing and manual assignment. */
@Injectable()
export class LeadAssignment {
  constructor(
    private readonly routing: RoutingService,
    @Inject(CADENCE_POLICY) private readonly cadence: CadencePolicy,
    @Inject(ACTIVITY_REPOSITORY) private readonly activities: ActivityRepository,
    private readonly ctx: CrmContext,
  ) {}

  /** Routes and saves the lead; returns the decision (memberId undefined → unassigned queue). */
  async route(tx: Transaction, lead: Lead, port: CrmPort, opts: { solo: boolean; exclude?: string }): Promise<RoutingDecision> {
    const decision = await this.routing.decide(tx, lead, opts);
    if (decision.memberId && decision.orgUnitId) {
      await this.assign(tx, lead, port, { memberId: decision.memberId, orgUnitId: decision.orgUnitId, slaMinutes: decision.slaMinutes, ruleId: decision.ruleId, by: 'routing' });
      await this.ctx.recorder.record(tx, {
        event: { type: CRM_EVENTS.LEAD_ROUTED, subject: lead.props.id, data: { leadId: lead.props.id, ownerMemberId: decision.memberId, ruleId: decision.ruleId ?? null } },
        audit: { action: CRM_EVENTS.LEAD_ROUTED, entityType: 'lead', entityId: lead.props.id, metadata: { reason: decision.reason } },
      });
    } else {
      if (lead.props.ownerMemberId) lead.unassign();
      await port.saveLead(tx, lead);
      await this.ctx.recorder.record(tx, {
        event: { type: CRM_EVENTS.LEAD_UNASSIGNED, subject: lead.props.id, data: { leadId: lead.props.id } },
        audit: { action: CRM_EVENTS.LEAD_UNASSIGNED, entityType: 'lead', entityId: lead.props.id, metadata: { reason: decision.reason } },
      });
    }
    return decision;
  }

  /** Assigns, saves, logs an ASSIGNMENT activity and creates the cadence's first-call task. */
  async assign(tx: Transaction, lead: Lead, port: CrmPort, a: { memberId: string; orgUnitId: string; slaMinutes?: number; ruleId?: string; by: string }): Promise<void> {
    const now = this.ctx.clock.now();
    lead.assign(a.memberId, a.orgUnitId, a.slaMinutes, now, a.ruleId);
    await port.saveLead(tx, lead);
    await this.activities.add(tx, {
      id: this.ctx.ids.next('act'), subjectType: 'LEAD', subjectId: lead.props.id, kind: 'ASSIGNMENT', occurredAt: now.toISOString(), actorMemberId: a.by === 'routing' ? undefined : a.by,
    });
    await this.createTasks(tx, port, this.cadence.onLeadAssigned(lead.props, now));
  }

  async createTasks(tx: Transaction, port: CrmPort, drafts: TaskDraft[]): Promise<void> {
    const now = this.ctx.clock.now();
    for (const d of drafts) await port.saveTask(tx, Task.create({ ...d, id: this.ctx.ids.next('tsk'), now }));
  }
}
