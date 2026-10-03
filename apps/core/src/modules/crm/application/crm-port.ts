import { Inject, Injectable } from '@nestjs/common';
import { Lead } from '../domain/lead';
import { Task } from '../domain/task';
import { Opportunity } from '../domain/opportunity';
import {
  CrmPort, CrmPortFactory, LEAD_REPOSITORY, LeadRepository, OPPORTUNITY_REPOSITORY, OpportunityRepository, TASK_REPOSITORY, TaskRepository,
  TENANT_DIRECTORY, TenantDirectory, Transaction,
} from './ports';
import { CrmContext } from './crm-context';

/** Solo-CRM-lite: Core tables are the system of record (HLD §10). */
export class SoloCrmLiteAdapter implements CrmPort {
  constructor(
    private readonly leads: LeadRepository,
    private readonly tasks: TaskRepository,
    private readonly opportunities: OpportunityRepository,
  ) {}

  saveLead(tx: Transaction, lead: Lead): Promise<void> {
    return this.leads.save(tx, lead);
  }

  saveTask(tx: Transaction, task: Task): Promise<void> {
    return this.tasks.save(tx, task);
  }

  saveOpportunity(tx: Transaction, opportunity: Opportunity): Promise<void> {
    return this.opportunities.save(tx, opportunity);
  }
}

/**
 * Decorator for organisation tenants (crmMode = twenty): same Core writes, plus an outbox
 * 'crm.sync.requested' per change for the M04b sync worker. Selling continues when Twenty is down.
 */
export class TwentyProjectingCrmAdapter implements CrmPort {
  constructor(
    private readonly inner: CrmPort,
    private readonly ctx: CrmContext,
  ) {}

  async saveLead(tx: Transaction, lead: Lead): Promise<void> {
    await this.inner.saveLead(tx, lead);
    await this.requestSync(tx, 'lead', lead.props.id);
  }

  async saveTask(tx: Transaction, task: Task): Promise<void> {
    await this.inner.saveTask(tx, task);
    await this.requestSync(tx, 'task', task.props.id);
  }

  async saveOpportunity(tx: Transaction, opportunity: Opportunity): Promise<void> {
    await this.inner.saveOpportunity(tx, opportunity);
    await this.requestSync(tx, 'opportunity', opportunity.props.id);
  }

  private requestSync(tx: Transaction, object: string, id: string): Promise<void> {
    return this.ctx.recorder.record(tx, {
      event: { type: 'crm.sync.requested', subject: id, data: { object, id } },
      audit: { action: 'crm.sync.requested', entityType: object, entityId: id },
    });
  }
}

/** Factory: picks the adapter from the tenant's crmMode (M01). */
@Injectable()
export class DefaultCrmPortFactory implements CrmPortFactory {
  private readonly solo: SoloCrmLiteAdapter;
  private readonly projecting: TwentyProjectingCrmAdapter;

  constructor(
    @Inject(LEAD_REPOSITORY) leads: LeadRepository,
    @Inject(TASK_REPOSITORY) tasks: TaskRepository,
    @Inject(OPPORTUNITY_REPOSITORY) opportunities: OpportunityRepository,
    @Inject(TENANT_DIRECTORY) private readonly tenants: TenantDirectory,
    ctx: CrmContext,
  ) {
    this.solo = new SoloCrmLiteAdapter(leads, tasks, opportunities);
    this.projecting = new TwentyProjectingCrmAdapter(this.solo, ctx);
  }

  async forTenant(tenantId: string): Promise<CrmPort> {
    const tenant = await this.tenants.findById(tenantId);
    return tenant?.props.crmMode === 'twenty' ? this.projecting : this.solo;
  }

  async isSolo(tenantId: string): Promise<boolean> {
    return (await this.tenants.findById(tenantId))?.props.kind === 'SOLO';
  }
}
