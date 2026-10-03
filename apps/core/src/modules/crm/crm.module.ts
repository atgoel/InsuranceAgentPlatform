import { Inject, Module, OnModuleInit, Provider } from '@nestjs/common';
import { Pool } from 'pg';
import { APP_POOL, EVENT_BUS, KERNEL_OPTIONS, PERMISSION_POLICY } from '../../kernel/tokens';
import { KernelConfig } from '../../kernel/config';
import { EventBus } from '../../kernel/outbox/event-bus';
import { DomainEvent } from '../../kernel/domain/domain-event';
import { RolePermissionMatrix } from '../../kernel/tenancy/permissions';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DistributionModule } from '../distribution/distribution.module';
import { PartyModule } from '../party/party.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { StageRuleSet } from './domain/stage-rules';
import { DefaultCadencePolicy } from './domain/cadence';
import {
  ACTIVITY_REPOSITORY, ActivityRepository, CADENCE_POLICY, CRM_PORT_FACTORY, LEAD_IMPORT_REPOSITORY, LEAD_REPOSITORY, LeadImportRepository, LeadRepository, MY_WORK_CONTRIBUTORS,
  OPPORTUNITY_REPOSITORY, OpportunityRepository, PARTY_FACADE, POS_ELIGIBILITY, PUBLIC_LEAD_GUARD, PartyFacade, PublicLeadGuard, ROUTING_RULE_REPOSITORY, RoutingRuleRepository, STAGE_RULES, TASK_REPOSITORY,
  TaskRepository,
} from './application/ports';
import { CrmContext } from './application/crm-context';
import { DefaultCrmPortFactory } from './application/crm-port';
import { CataloguePosEligibility, RoutingService } from './application/routing.service';
import { LeadAssignment } from './application/lead-assignment';
import { LeadCaptureService } from './application/lead-capture.service';
import { LeadViews } from './application/lead-views';
import { LeadDeps, LeadService } from './application/lead.service';
import { ActivityService } from './application/activity.service';
import { TaskService } from './application/task.service';
import { ConversionService } from './application/conversion.service';
import { OpportunityService } from './application/opportunity.service';
import { MyWorkService, defaultContributors } from './application/my-work.service';
import { LeadImportService } from './application/lead-import.service';
import { CrmSubscribers, SlaSweepJob } from './application/subscribers';
import { CrmSyncWorker } from './application/crm-sync.worker';
import { SyncRecordSource } from './application/sync-record.source';
import { TwentyOwnerChange } from './application/twenty-owner-change';
import { TwentyWebhookService } from './application/twenty-webhook.service';
import { SYNC_REQUESTED } from './application/crm-port';
import { CRM_SYNC_STATE_REPOSITORY, CrmSyncStateRepository, SyncObject, TWENTY_CLIENT, TWENTY_WORKSPACE_DIRECTORY } from './application/twenty-sync.ports';
import { InMemoryCrmSyncStateRepository } from './infrastructure/twenty/in-memory-sync-state.repository';
import { DerivedTwentyWorkspaceDirectory } from './infrastructure/twenty/derived-workspace.directory';
import { FakeTwentyClient } from './infrastructure/twenty/fake-twenty.client';
import { TwentyWebhookController } from './api/twenty-webhook.controller';
import {
  InMemoryActivityRepository, InMemoryLeadImportRepository, InMemoryLeadRepository, InMemoryOpportunityRepository, InMemoryPublicLeadGuard,
  InMemoryRoutingRuleRepository, InMemoryTaskRepository,
} from './infrastructure/in-memory-crm.repositories';
import {
  PgActivityRepository, PgCrmSyncStateRepository, PgLeadImportRepository, PgLeadRepository, PgOpportunityRepository, PgPublicLeadGuard, PgRoutingRuleRepository, PgTaskRepository,
} from './infrastructure/pg-crm.repositories';
import { LeadsController } from './api/leads.controller';
import { PublicLeadsController } from './api/public-leads.controller';
import { LeadImportsController, MyWorkController, OpportunitiesController, RoutingController, TasksController } from './api/engagement.controllers';

const SELLER = ['crm.lead.read', 'crm.lead.write', 'crm.lead.convert', 'crm.activity.write', 'crm.task.*', 'crm.opportunity.read', 'crm.opportunity.write'];
const MANAGER = [...SELLER, 'crm.lead.assign', 'crm.routing.read', 'crm.import'];

/** Role → permission rows contributed by M04 (M04 §6). */
export const CRM_PERMISSIONS: Record<string, string[]> = {
  SALESPERSON: SELLER,
  SOLO_OWNER: [...SELLER, 'crm.import'],
  BRANCH_MANAGER: MANAGER,
  SALES_MANAGER: MANAGER,
  TENANT_ADMIN: ['crm.*'],
  OPS: ['crm.lead.read', 'crm.lead.assign', 'crm.import', 'crm.task.*'],
};

/** In-memory by default; PERSISTENCE=pg selects the Postgres adapters (they run in the caller's RLS-scoped transaction). */
function pick<T>(provide: symbol, memory: () => T, pgImpl: () => T): Provider {
  return {
    provide,
    useFactory: (config: KernelConfig, app?: Pool) => (config.persistence === 'pg' && app ? pgImpl() : memory()),
    inject: [KERNEL_OPTIONS, APP_POOL],
  };
}

const adapters: Provider[] = [
  pick<LeadRepository>(LEAD_REPOSITORY, () => new InMemoryLeadRepository(), () => new PgLeadRepository()),
  pick<ActivityRepository>(ACTIVITY_REPOSITORY, () => new InMemoryActivityRepository(), () => new PgActivityRepository()),
  pick<TaskRepository>(TASK_REPOSITORY, () => new InMemoryTaskRepository(), () => new PgTaskRepository()),
  pick<OpportunityRepository>(OPPORTUNITY_REPOSITORY, () => new InMemoryOpportunityRepository(), () => new PgOpportunityRepository()),
  pick<RoutingRuleRepository>(ROUTING_RULE_REPOSITORY, () => new InMemoryRoutingRuleRepository(), () => new PgRoutingRuleRepository()),
  pick<LeadImportRepository>(LEAD_IMPORT_REPOSITORY, () => new InMemoryLeadImportRepository(), () => new PgLeadImportRepository()),
  pick<PublicLeadGuard>(PUBLIC_LEAD_GUARD, () => new InMemoryPublicLeadGuard(), () => new PgPublicLeadGuard()),
  pick<CrmSyncStateRepository>(CRM_SYNC_STATE_REPOSITORY, () => new InMemoryCrmSyncStateRepository(), () => new PgCrmSyncStateRepository()),
  { provide: TWENTY_WORKSPACE_DIRECTORY, useClass: DerivedTwentyWorkspaceDirectory },
  // The HTTP client (infrastructure/twenty/http-twenty.client.ts) is wired once Twenty hosting and the secret manager exist.
  FakeTwentyClient,
  { provide: TWENTY_CLIENT, useExisting: FakeTwentyClient },
];

const policies: Provider[] = [
  { provide: STAGE_RULES, useFactory: () => StageRuleSet.defaults() },
  { provide: CADENCE_POLICY, useClass: DefaultCadencePolicy },
  { provide: POS_ELIGIBILITY, useClass: CataloguePosEligibility },
  { provide: CRM_PORT_FACTORY, useClass: DefaultCrmPortFactory },
  {
    provide: MY_WORK_CONTRIBUTORS,
    useFactory: (tasks: TaskRepository, leads: LeadRepository, parties: PartyFacade) => defaultContributors(tasks, leads, parties),
    inject: [TASK_REPOSITORY, LEAD_REPOSITORY, PARTY_FACADE],
  },
];

const services: Provider[] = [
  CrmContext, RoutingService, LeadAssignment, LeadCaptureService, LeadViews, LeadDeps, LeadService, ActivityService, TaskService,
  ConversionService, OpportunityService, MyWorkService, LeadImportService, CrmSubscribers, SlaSweepJob, CrmSyncWorker, SyncRecordSource, TwentyWebhookService, TwentyOwnerChange,
];

/**
 * M04a CRM Engagement. Leads, routing, activities, tasks, pipeline and my-work, behind the CRM Port
 * (solo-lite tables, or the same tables projected to Twenty in M04b).
 */
@Module({
  imports: [TenancyModule, DistributionModule, PartyModule, CatalogueModule],
  controllers: [LeadsController, PublicLeadsController, OpportunitiesController, TasksController, RoutingController, MyWorkController, LeadImportsController, TwentyWebhookController],
  providers: [...adapters, ...policies, ...services],
  exports: [SlaSweepJob, TaskService],
})
export class CrmModule implements OnModuleInit {
  constructor(
    @Inject(PERMISSION_POLICY) private readonly permissions: RolePermissionMatrix,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly subscribers: CrmSubscribers,
    private readonly syncWorker: CrmSyncWorker,
  ) {}

  onModuleInit(): void {
    for (const [role, perms] of Object.entries(CRM_PERMISSIONS)) this.permissions.grant(role, perms);
    const on = <T>(type: string, handler: (e: DomainEvent<T>) => Promise<boolean>) =>
      this.bus.subscribe(type, async (e) => void (await handler(e as DomainEvent<T>)), `crm:${type}`);
    on('distribution.member.exited', (e) => this.subscribers.onMemberExited(e as DomainEvent<{ memberId?: string; transferToMemberId?: string | null }>));
    on('party.party.merged', (e) => this.subscribers.onPartyMerged(e as DomainEvent<{ survivorId: string; mergedId: string }>));
    // Rethrows on failure so the outbox relay retries the sync (dead-letter after 3 attempts).
    on(SYNC_REQUESTED, (e) => this.syncWorker.handle(e as DomainEvent<{ object: SyncObject; id: string }>));
    on('proposal.policy.issued', (e) => this.subscribers.onPolicyIssued(e as DomainEvent<{ proposalId: string; opportunityId?: string; policySaleId: string }>));
  }
}
