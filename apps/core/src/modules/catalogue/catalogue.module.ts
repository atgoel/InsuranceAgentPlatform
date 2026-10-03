import { Inject, Module, OnModuleInit, Provider } from '@nestjs/common';
import { EVENT_BUS, PERMISSION_POLICY } from '../../kernel/tokens';
import { EventBus } from '../../kernel/outbox/event-bus';
import { DomainEvent } from '../../kernel/domain/domain-event';
import { RolePermissionMatrix } from '../../kernel/tenancy/permissions';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DistributionModule } from '../distribution/distribution.module';
import { CATALOGUE_REPOSITORY, COMPARISON_SCOPE_FACADE, POS_CATALOGUE_READER, SCOPE_INPUTS_PROVIDER } from './application/ports';
import { DefaultPosCatalogueReader } from './application/pos-catalogue.reader';
import { CatalogueContext } from './application/catalogue-context';
import { DefaultScopeInputsProvider } from './application/scope-inputs.provider';
import { ComparisonScopeService } from './application/comparison-scope.service';
import { CatalogueQueryService } from './application/catalogue-query.service';
import { CatalogueAdminService } from './application/catalogue-admin.service';
import { ProductVersionLocker } from './application/product-version-locker';
import { InMemoryCatalogueRepository } from './infrastructure/in-memory-catalogue.repository';
import { CatalogueController } from './api/catalogue.controller';
import { OperatorCatalogueController } from './api/operator-catalogue.controller';

/** `catalogue.read` is granted to every customer-realm role (M05 §5). */
export const CATALOGUE_ROLES = [
  'TENANT_ADMIN', 'PRINCIPAL_OFFICER', 'BRANCH_MANAGER', 'SALES_MANAGER', 'SALESPERSON', 'SOLO_OWNER', 'OPS', 'FINANCE', 'COMPLIANCE', 'CMS_AUTHOR', 'CMS_PUBLISHER',
];

const providers: Provider[] = [
  { provide: CATALOGUE_REPOSITORY, useClass: InMemoryCatalogueRepository },
  { provide: SCOPE_INPUTS_PROVIDER, useClass: DefaultScopeInputsProvider },
  ComparisonScopeService,
  { provide: COMPARISON_SCOPE_FACADE, useExisting: ComparisonScopeService },
  { provide: POS_CATALOGUE_READER, useClass: DefaultPosCatalogueReader },
  CatalogueContext, CatalogueQueryService, CatalogueAdminService, ProductVersionLocker,
];

/** M05 Product Catalogue & comparison scope (LA-6). Platform-scope catalogue; tenant scope from M01 tie-ups and M02 selling scope. */
@Module({
  imports: [TenancyModule, DistributionModule],
  controllers: [CatalogueController, OperatorCatalogueController],
  providers,
  exports: [COMPARISON_SCOPE_FACADE, POS_CATALOGUE_READER],
})
export class CatalogueModule implements OnModuleInit {
  constructor(
    @Inject(PERMISSION_POLICY) private readonly permissions: RolePermissionMatrix,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly locker: ProductVersionLocker,
  ) {}

  onModuleInit(): void {
    for (const role of CATALOGUE_ROLES) this.permissions.grant(role, ['catalogue.read']);
    this.bus.subscribe('quote.option.created', async (e) => void (await this.locker.onQuoteOptionCreated(e as DomainEvent<{ versionId?: string }>)), 'catalogue:quote.option.created');
  }
}
