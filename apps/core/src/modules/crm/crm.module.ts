import { Inject, Module, OnModuleInit, Provider } from '@nestjs/common';
import { EVENT_BUS, PERMISSION_POLICY } from '../../kernel/tokens';
import { EventBus } from '../../kernel/outbox/event-bus';
import { DomainEvent } from '../../kernel/domain/domain-event';
import { RolePermissionMatrix } from '../../kernel/tenancy/permissions';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DistributionModule } from '../distribution/distribution.module';
import { PartyModule } from '../party/party.module';
import { StageRuleSet } from './domain/stage-rules';
import { DefaultCadencePolicy } from './domain/cadence';
import {
  ACTIVITY_REPOSITORY, CADENCE_POLICY, CRM_PORT_FACTORY, LEAD_IMPORT_REPOSITORY, LEAD_REPOSITORY, LeadRepository, MY_WORK_CONTRIBUTORS,
  OPPORTUNITY_REPOSITORY, PARTY_FACADE, POS_ELIGIBILITY, PUBLIC_LEAD_GUARD, PartyFacade, ROUTING_RULE_REPOSITORY, STAGE_RULES, TASK_REPOSITORY,
  TaskRepository,
} from './application/ports';
import { CrmContext } from './application/crm-context';
import { DefaultCrmPortFactory } from './application/crm-port';
import { DefaultPosEligibility, RoutingService } from './application/routing.service';
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
import {
  InMemoryActivityRepository, InMemoryLeadImportRepository, InMemoryLeadRepository, InMemoryOpportunityRepository, InMemoryPublicLeadGuard,
  InMemoryRoutingRuleRepository, InMemoryTaskRepository,
} from './infrastructure/in-memory-crm.repositories';
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

const adapters: Provider[] = [
  { provide: LEAD_REPOSITORY, useClass: InMemoryLeadRepository },
  { provide: ACTIVITY_REPOSITORY, useClass: InMemoryActivityRepository },
  { provide: TASK_REPOSITORY, useClass: InMemoryTaskRepository },
  { provide: OPPORTUNITY_REPOSITORY, useClass: InMemoryOpportunityRepository },
  { provide: ROUTING_RULE_REPOSITORY, useClass: InMemoryRoutingRuleRepository },
  { provide: LEAD_IMPORT_REPOSITORY, useClass: InMemoryLeadImportRepository },
  { provide: PUBLIC_LEAD_GUARD, useClass: InMemoryPublicLeadGuard },
];

const policies: Provider[] = [
  { provide: STAGE_RULES, useFactory: () => StageRuleSet.defaults() },
  { provide: CADENCE_POLICY, useClass: DefaultCadencePolicy },
  { provide: POS_ELIGIBILITY, useClass: DefaultPosEligibility },
  { provide: CRM_PORT_FACTORY, useClass: DefaultCrmPortFactory },
  {
    provide: MY_WORK_CONTRIBUTORS,
    useFactory: (tasks: TaskRepository, leads: LeadRepository, parties: PartyFacade) => defaultContributors(tasks, leads, parties),
    inject: [TASK_REPOSITORY, LEAD_REPOSITORY, PARTY_FACADE],
  },
];

const services: Provider[] = [
  CrmContext, RoutingService, LeadAssignment, LeadCaptureService, LeadViews, LeadDeps, LeadService, ActivityService, TaskService,
  ConversionService, OpportunityService, MyWorkService, LeadImportService, CrmSubscribers, SlaSweepJob,
];

/**
 * M04a CRM Engagement. Leads, routing, activities, tasks, pipeline and my-work, behind the CRM Port
 * (solo-lite tables, or the same tables projected to Twenty in M04b).
 */
@Module({
  imports: [TenancyModule, DistributionModule, PartyModule],
  controllers: [LeadsController, PublicLeadsController, OpportunitiesController, TasksController, RoutingController, MyWorkController, LeadImportsController],
  providers: [...adapters, ...policies, ...services],
  exports: [SlaSweepJob, TaskService],
})
export class CrmModule implements OnModuleInit {
  constructor(
    @Inject(PERMISSION_POLICY) private readonly permissions: RolePermissionMatrix,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly subscribers: CrmSubscribers,
  ) {}

  onModuleInit(): void {
    for (const [role, perms] of Object.entries(CRM_PERMISSIONS)) this.permissions.grant(role, perms);
    const on = <T>(type: string, handler: (e: DomainEvent<T>) => Promise<boolean>) =>
      this.bus.subscribe(type, async (e) => void (await handler(e as DomainEvent<T>)), `crm:${type}`);
    on('distribution.member.exited', (e) => this.subscribers.onMemberExited(e as DomainEvent<{ memberId?: string; transferToMemberId?: string | null }>));
    on('party.party.merged', (e) => this.subscribers.onPartyMerged(e as DomainEvent<{ survivorId: string; mergedId: string }>));
    on('proposal.policy.issued', (e) => this.subscribers.onPolicyIssued(e as DomainEvent<{ proposalId: string; opportunityId?: string; policySaleId: string }>));
  }
}
