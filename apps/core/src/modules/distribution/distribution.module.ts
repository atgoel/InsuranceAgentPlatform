import { Inject, Module, OnModuleInit, Provider } from '@nestjs/common';
import { KERNEL_OPTIONS, LOGGER, MFA_POLICY, PERMISSION_POLICY, TENANT_PERMISSION_POLICY } from '../../kernel/tokens';
import { KernelConfig } from '../../kernel/config';
import { Logger } from '../../kernel/observability/logger';
import { DelegatingMfaPolicy, DelegatingPermissionPolicy, RolePermissionMatrix } from '../../kernel/tenancy/permissions';
import { TenancyModule } from '../tenancy/tenancy.module';
import {
  CHECKLIST_REPOSITORY, ChecklistRepository, IDENTITY_ADMIN, INSURER_CODE_REPOSITORY, InsurerCodeRepository, LEAVE_REPOSITORY, LICENCE_REPOSITORY, LeaveRepository,
  LicenceRepository, MEMBER_REPOSITORY, MemberRepository, ORG_UNIT_REPOSITORY, OrgUnitRepository, RECORD_SCOPE_PROVIDER, ROLE_REPOSITORY,
  RoleRepository, SELLER_DIRECTORY,
} from './application/ports';
import { DistributionContext } from './application/distribution-context';
import { OrgUnitService } from './application/org-unit.service';
import { MemberService } from './application/member.service';
import { OnboardingService } from './application/onboarding.service';
import { LicenceExpiryScanner, LicenceService } from './application/licence.service';
import { LeaveService } from './application/leave.service';
import { CatalogueMfaPolicy, DataDrivenPermissionPolicy, RoleCatalogueCache, RoleService } from './application/role.service';
import { RecordScopeResolver } from './application/record-scope.resolver';
import { SellerDirectoryService } from './application/seller-directory';
import {
  InMemoryChecklistRepository, InMemoryInsurerCodeRepository, InMemoryLeaveRepository, InMemoryLicenceRepository, InMemoryMemberRepository,
  InMemoryOrgUnitRepository, InMemoryRoleRepository,
} from './infrastructure/in-memory-distribution.repositories';
import {
  PgChecklistRepository, PgInsurerCodeRepository, PgLeaveRepository, PgLicenceRepository, PgMemberRepository, PgOrgUnitRepository, PgRoleRepository,
} from './infrastructure/pg-distribution.repositories';
import { StubIdentityAdmin } from './infrastructure/stub-identity-admin';
import { OrgUnitsController } from './api/org-units.controller';
import { DistributionQueriesController, MembersController } from './api/members.controller';
import { RolesController } from './api/roles.controller';

/** In-memory adapters by default; Postgres when PERSISTENCE=pg (tenant tables run in the caller's RLS transaction). */
const pick = <T>(provide: symbol, memory: () => T, pgFactory: () => T): Provider => ({
  provide,
  useFactory: (config: KernelConfig) => (config.persistence === 'pg' ? pgFactory() : memory()),
  inject: [KERNEL_OPTIONS],
});

const repositories: Provider[] = [
  pick<OrgUnitRepository>(ORG_UNIT_REPOSITORY, () => new InMemoryOrgUnitRepository(), () => new PgOrgUnitRepository()),
  pick<MemberRepository>(MEMBER_REPOSITORY, () => new InMemoryMemberRepository(), () => new PgMemberRepository()),
  pick<ChecklistRepository>(CHECKLIST_REPOSITORY, () => new InMemoryChecklistRepository(), () => new PgChecklistRepository()),
  pick<LicenceRepository>(LICENCE_REPOSITORY, () => new InMemoryLicenceRepository(), () => new PgLicenceRepository()),
  pick<InsurerCodeRepository>(INSURER_CODE_REPOSITORY, () => new InMemoryInsurerCodeRepository(), () => new PgInsurerCodeRepository()),
  pick<LeaveRepository>(LEAVE_REPOSITORY, () => new InMemoryLeaveRepository(), () => new PgLeaveRepository()),
  pick<RoleRepository>(ROLE_REPOSITORY, () => new InMemoryRoleRepository(), () => new PgRoleRepository()),
  { provide: IDENTITY_ADMIN, useFactory: (l: Logger) => new StubIdentityAdmin(l.child({ module: 'distribution' })), inject: [LOGGER] },
];

const collaborators: Provider[] = [
  {
    provide: SELLER_DIRECTORY,
    useFactory: (m: MemberRepository, l: LicenceRepository, lv: LeaveRepository, c: InsurerCodeRepository, u: OrgUnitRepository) => new SellerDirectoryService(m, l, lv, c, u),
    inject: [MEMBER_REPOSITORY, LICENCE_REPOSITORY, LEAVE_REPOSITORY, INSURER_CODE_REPOSITORY, ORG_UNIT_REPOSITORY],
  },
  { provide: RECORD_SCOPE_PROVIDER, useFactory: (r: RoleRepository, u: OrgUnitRepository) => new RecordScopeResolver(r, u), inject: [ROLE_REPOSITORY, ORG_UNIT_REPOSITORY] },
];

const services: Provider[] = [
  DistributionContext, OrgUnitService, MemberService, OnboardingService, LicenceService, LicenceExpiryScanner, LeaveService, RoleService, RoleCatalogueCache,
];

/**
 * M02 Distribution Network. Owns the org tree, members and role catalogue, and swaps the kernel's
 * permission/MFA policies for data-driven ones backed by the tenant's (editable) role catalogue.
 */
@Module({
  imports: [TenancyModule],
  controllers: [OrgUnitsController, MembersController, DistributionQueriesController, RolesController],
  providers: [...repositories, ...collaborators, ...services],
  exports: [SELLER_DIRECTORY, RECORD_SCOPE_PROVIDER, MemberService, LicenceExpiryScanner],
})
export class DistributionModule implements OnModuleInit {
  constructor(
    @Inject(TENANT_PERMISSION_POLICY) private readonly tenantPolicy: DelegatingPermissionPolicy,
    @Inject(MFA_POLICY) private readonly mfaPolicy: DelegatingMfaPolicy,
    @Inject(PERMISSION_POLICY) private readonly matrix: RolePermissionMatrix,
    private readonly catalogues: RoleCatalogueCache,
  ) {}

  onModuleInit(): void {
    this.tenantPolicy.delegateTo(new DataDrivenPermissionPolicy(this.matrix, this.catalogues));
    this.mfaPolicy.delegateTo(new CatalogueMfaPolicy());
  }
}
