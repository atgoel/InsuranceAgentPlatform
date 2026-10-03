import { Inject, Injectable } from '@nestjs/common';
import { ValidationError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { Activity, ActivityKind, CallOutcome, SensitiveContentGuard } from '../domain/activity';
import { CadencePolicy } from '../domain/cadence';
import { CRM_EVENTS } from '../domain/events';
import { ACTIVITY_REPOSITORY, ActivityRepository, CADENCE_POLICY, CRM_PORT_FACTORY } from './ports';
import { DefaultCrmPortFactory } from './crm-port';
import { CrmContext } from './crm-context';
import { LeadService } from './lead.service';
import { LeadAssignment } from './lead-assignment';

const OUTBOUND: ReadonlySet<ActivityKind> = new Set(['CALL', 'WHATSAPP', 'SMS', 'EMAIL', 'MEETING']);
const MAX_SUMMARY = 1000;

export interface LogActivityInput {
  kind: ActivityKind;
  outcome?: CallOutcome;
  summary?: string;
  occurredAt?: string;
  clientRef?: string;
}

/** Activity log for leads (F10): guard, first response, cadence, offline-replay safety (AC-M04-16). */
@Injectable()
export class ActivityService {
  constructor(
    @Inject(ACTIVITY_REPOSITORY) private readonly activities: ActivityRepository,
    @Inject(CADENCE_POLICY) private readonly cadence: CadencePolicy,
    @Inject(CRM_PORT_FACTORY) private readonly ports: DefaultCrmPortFactory,
    private readonly leads: LeadService,
    private readonly assignment: LeadAssignment,
    private readonly ctx: CrmContext,
  ) {}

  logForLead(principal: Principal, leadId: string, input: LogActivityInput): Promise<{ activity: Activity; duplicate: boolean }> {
    validate(input);
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const lead = await this.leads.requireInScope(tx, principal, leadId);
      const now = this.ctx.clock.now();
      const { duplicate, activity } = await this.activities.add(tx, {
        id: this.ctx.ids.next('act'), subjectType: 'LEAD', subjectId: leadId, kind: input.kind, outcome: input.outcome, summary: input.summary,
        occurredAt: input.occurredAt ?? now.toISOString(), actorMemberId: principal.memberId, clientRef: input.clientRef,
      });
      if (duplicate) return { activity, duplicate }; // offline replay: stored once, no side effects twice
      const port = await this.ports.forTenant(tx.tenantId);
      if (OUTBOUND.has(input.kind) && principal.memberId && principal.memberId === lead.props.ownerMemberId && !lead.props.firstRespondedAt) {
        lead.recordResponse(now);
        this.ctx.metrics.histogram('crm_lead_first_response_minutes', 'Minutes from capture to first owner response', [], [5, 15, 30, 60, 120, 240, 480, 1440])
          .observe((now.getTime() - Date.parse(lead.props.createdAt)) / 60_000);
        await port.saveLead(tx, lead);
      }
      if (input.kind === 'CALL' && input.outcome) {
        const attempts = await this.activities.countCallAttempts(tx, leadId);
        await this.assignment.createTasks(tx, port, this.cadence.onCallOutcome(lead.props, input.outcome, now, attempts));
      }
      await this.ctx.recorder.record(tx, {
        event: { type: CRM_EVENTS.ACTIVITY_LOGGED, subject: leadId, data: { subjectType: 'LEAD', subjectId: leadId, kind: input.kind, outcome: input.outcome ?? null } },
        audit: { action: CRM_EVENTS.ACTIVITY_LOGGED, entityType: 'lead', entityId: leadId, metadata: { kind: input.kind } },
      });
      return { activity, duplicate };
    });
  }
}

function validate(input: LogActivityInput): void {
  if (input.kind === 'CALL' && !input.outcome) throw new ValidationError('outcome_required', 'A call needs an outcome');
  if (input.summary && input.summary.length > MAX_SUMMARY) throw new ValidationError('summary_too_long', `Summary is limited to ${MAX_SUMMARY} characters`);
  if (input.summary) SensitiveContentGuard.check(input.summary);
}
