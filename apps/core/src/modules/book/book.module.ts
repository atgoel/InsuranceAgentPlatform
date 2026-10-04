import { Inject, Module, OnModuleInit, Provider } from '@nestjs/common';
import { Pool } from 'pg';
import { APP_POOL, EVENT_BUS, KERNEL_OPTIONS, PERMISSION_POLICY } from '../../kernel/tokens';
import { KernelConfig } from '../../kernel/config';
import { RolePermissionMatrix } from '../../kernel/tenancy/permissions';
import { EventBus } from '../../kernel/outbox/event-bus';
import { DomainEvent } from '../../kernel/domain/domain-event';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DistributionModule } from '../distribution/distribution.module';
import { PartyModule } from '../party/party.module';
import { CrmModule } from '../crm/crm.module';
import { MyWorkService } from '../crm/application/my-work.service';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { CommissionModule } from '../commission/commission.module';
import {
  HELD_POLICY_REPOSITORY,
  HeldPolicyRepository,
  IMPORT_BATCH_REPOSITORY,
  ImportBatchRepository,
  SERVICING_REPOSITORY,
  ServicingRepository,
  ALERT_LEDGER,
  AlertLedger,
  ISSUED_POLICY_READER,
} from './application/ports';
import {
  InMemoryHeldPolicyRepository,
  InMemoryImportBatchRepository,
  InMemoryServicingRepository,
  InMemoryAlertLedger,
} from './infrastructure/in-memory-book.repositories';
import {
  PgHeldPolicyRepository,
  PgImportBatchRepository,
  PgServicingRepository,
  PgAlertLedger,
} from './infrastructure/pg-book.repositories';
import { BookContext, BookRuntime } from './application/book-context';
import { BookScope } from './application/book-scope';
import { HeldPolicyService } from './application/held-policy.service';
import { DueService } from './application/due.service';
import { LifecycleService } from './application/lifecycle.service';
import { BookImportService } from './application/book-import.service';
import { BookImportLookups } from './application/book-import-lookups';
import { BookPolicyResources, BookImportResources } from './application/book-resources';
import { ServicingService } from './application/servicing.service';
import { DueContributor, ServicingContributor } from './application/due-contributor';
import { RenewalOpportunityJob } from './application/renewal-opportunity.job';
import { BookSubscribers, UnavailableIssuedPolicyReader } from './application/subscribers';
import { HeldPoliciesController } from './api/held-policies.controller';
import { DuesController } from './api/dues.controller';
import { BookImportsController } from './api/book-imports.controller';
import { ServicingController } from './api/servicing.controller';
function pick<T>(provide: symbol, memory: () => T, pg: () => T): Provider {
  return {
    provide,
    useFactory: (config: KernelConfig, app?: Pool) => (config.persistence === 'pg' && app ? pg() : memory()),
    inject: [KERNEL_OPTIONS, APP_POOL],
  };
}
const adapters = [
  pick<HeldPolicyRepository>(
    HELD_POLICY_REPOSITORY,
    () => new InMemoryHeldPolicyRepository(),
    () => new PgHeldPolicyRepository(),
  ),
  pick<ImportBatchRepository>(
    IMPORT_BATCH_REPOSITORY,
    () => new InMemoryImportBatchRepository(),
    () => new PgImportBatchRepository(),
  ),
  pick<ServicingRepository>(
    SERVICING_REPOSITORY,
    () => new InMemoryServicingRepository(),
    () => new PgServicingRepository(),
  ),
  pick<AlertLedger>(
    ALERT_LEDGER,
    () => new InMemoryAlertLedger(),
    () => new PgAlertLedger(),
  ),
  { provide: ISSUED_POLICY_READER, useClass: UnavailableIssuedPolicyReader },
];
const seller = ['book.read', 'book.write', 'book.servicing'];
export const BOOK_PERMISSIONS: Record<string, string[]> = {
  SALESPERSON: seller,
  SOLO_OWNER: [...seller, 'book.import'],
  BRANCH_MANAGER: [...seller, 'book.import'],
  SALES_MANAGER: [...seller, 'book.import'],
  OPS: ['book.*'],
  TENANT_ADMIN: ['book.*'],
  COMPLIANCE: ['book.read'],
};
@Module({
  imports: [TenancyModule, DistributionModule, PartyModule, CrmModule, CatalogueModule, CommissionModule],
  controllers: [HeldPoliciesController, DuesController, BookImportsController, ServicingController],
  providers: [
    ...adapters,
    BookRuntime,
    BookContext,
    BookScope,
    BookPolicyResources,
    BookImportResources,
    HeldPolicyService,
    DueService,
    LifecycleService,
    BookImportLookups,
    BookImportService,
    ServicingService,
    DueContributor,
    ServicingContributor,
    RenewalOpportunityJob,
    BookSubscribers,
  ],
  exports: [
    HeldPolicyService,
    DueService,
    LifecycleService,
    BookImportService,
    ServicingService,
    RenewalOpportunityJob,
    HELD_POLICY_REPOSITORY,
    IMPORT_BATCH_REPOSITORY,
    SERVICING_REPOSITORY,
    ALERT_LEDGER,
    ISSUED_POLICY_READER,
  ],
})
export class BookModule implements OnModuleInit {
  constructor(
    @Inject(PERMISSION_POLICY)
    private readonly permissions: RolePermissionMatrix,
    @Inject(EVENT_BUS)
    private readonly bus: EventBus,
    private readonly subscribers: BookSubscribers,
    private readonly work: MyWorkService,
    private readonly dues: DueContributor,
    private readonly servicing: ServicingContributor,
  ) {}
  onModuleInit() {
    for (const [role, permissions] of Object.entries(BOOK_PERMISSIONS)) this.permissions.grant(role, permissions);
    this.work.registerContributor(this.dues);
    this.work.registerContributor(this.servicing);
    for (const type of ['crm.opportunity.issued', 'proposal.policy.issued'])
      this.bus.subscribe(
        type,
        async (event) => {
          await this.subscribers.onPolicyIssued(
            event as DomainEvent<{
              policySaleId: string;
              opportunityId?: string;
            }>,
          );
        },
        `book:${type}`,
      );
    this.bus.subscribe(
      'party.party.merged',
      async (event) => {
        await this.subscribers.onPartyMerged(
          event as DomainEvent<{
            survivorId: string;
            mergedId: string;
          }>,
        );
      },
      'book:party.party.merged',
    );
  }
}
