import { Inject, Injectable } from '@nestjs/common';
import { Lead } from '../domain/lead';
import { Task } from '../domain/task';
import { Opportunity } from '../domain/opportunity';
import {
  CrmPort, CrmPortFactory, LEAD_REPOSITORY, LeadRepository, OPPORTUNITY_REPOSITORY, OpportunityRepository, TASK_REPOSITORY, TaskRepository,
  TENANT_DIRECTORY, TenantDirectory, Transaction,
} from './ports';
import { CrmContext } from './crm-context';
import { CRM_SYNC_STATE_REPOSITORY, CrmSyncStateRepository, SyncObject } from './twenty-sync.ports';

export const SYNC_REQUESTED = 'crm.sync.requested';

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
    private readonly sync: CrmSyncStateRepository,
  ) {}

  async saveLead(tx: Transaction, lead: Lead): Promise<void> {
    await this.inner.saveLead(tx, lead);
    if (!(await this.sync.get(tx, 'person', lead.props.partyId))) await this.requestSync(tx, 'person', lead.props.partyId);
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

  private requestSync(tx: Transaction, object: SyncObject, id: string): Promise<void> {
    return enqueueSync(this.ctx, this.sync, tx, object, id);
  }
}

/** Marks a record pending (keeping its Twenty id) and enqueues its sync in the caller's transaction. */
export async function enqueueSync(ctx: CrmContext, sync: CrmSyncStateRepository, tx: Transaction, object: SyncObject, id: string): Promise<void> {
  const previous = await sync.get(tx, object, id);
  await sync.set(tx, object, id, { externalRef: previous?.externalRef, state: 'pending', attempts: 0, updatedAt: ctx.clock.now().toISOString() });
  await ctx.recorder.record(tx, {
    event: { type: SYNC_REQUESTED, subject: id, data: { object, id } },
    audit: { action: SYNC_REQUESTED, entityType: object, entityId: id },
  });
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
    @Inject(CRM_SYNC_STATE_REPOSITORY) sync: CrmSyncStateRepository,
    ctx: CrmContext,
  ) {
    this.solo = new SoloCrmLiteAdapter(leads, tasks, opportunities);
    this.projecting = new TwentyProjectingCrmAdapter(this.solo, ctx, sync);
  }

  async forTenant(tenantId: string): Promise<CrmPort> {
    const tenant = await this.tenants.findById(tenantId);
    return tenant?.props.crmMode === 'twenty' ? this.projecting : this.solo;
  }

  async isSolo(tenantId: string): Promise<boolean> {
    return (await this.tenants.findById(tenantId))?.props.kind === 'SOLO';
  }
}
