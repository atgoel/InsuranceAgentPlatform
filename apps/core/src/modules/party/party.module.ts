import { Inject, Module, OnModuleInit, Provider } from '@nestjs/common';
import { Pool } from 'pg';
import { APP_POOL, KERNEL_OPTIONS, PERMISSION_POLICY } from '../../kernel/tokens';
import { KernelConfig } from '../../kernel/config';
import { RolePermissionMatrix } from '../../kernel/tenancy/permissions';
import { DistributionModule } from '../distribution/distribution.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import {
  CONSENT_REPOSITORY,
  ConsentRepository,
  DUPLICATE_REPOSITORY,
  DuplicateRepository,
  FIELD_CIPHER,
  HouseholdRepository,
  PartyRepository,
  RoleLinkRepository,
  SuppressionRepository,
  HOUSEHOLD_REPOSITORY,
  PARTY_FACADE,
  PARTY_REPOSITORY,
  POLICY_NUMBER_LOOKUP,
  ROLE_LINK_REPOSITORY,
  SUPPRESSION_REPOSITORY,
} from './application/ports';
import { PartyContext } from './application/party-context';
import { DuplicateDetector } from './application/duplicate-detector';
import { PartyWriter } from './application/party-writer';
import { PartyService } from './application/party.service';
import { PartyQueryService } from './application/party-query.service';
import { ConsentService } from './application/consent.service';
import { SensitivePartyAccessor } from './application/sensitive-party.accessor';
import { DuplicateService } from './application/duplicate.service';
import { HouseholdService } from './application/household.service';
import { PartyFacadeService } from './application/party.facade';
import { AesGcmFieldCipher, fieldMasterKey } from '../../kernel/crypto/aes-gcm-field-cipher';
export { fieldMasterKey };
import {
  InMemoryConsentRepository,
  InMemoryDuplicateRepository,
  InMemoryHouseholdRepository,
  InMemoryPartyRepository,
  InMemoryRoleLinkRepository,
  InMemorySuppressionRepository,
  NoPolicyNumberLookup,
} from './infrastructure/in-memory-party.repositories';
import {
  PgConsentRepository,
  PgDuplicateRepository,
  PgHouseholdRepository,
  PgPartyRepository,
  PgRoleLinkRepository,
  PgSuppressionRepository,
} from './infrastructure/pg-party.repositories';
import { PartiesController } from './api/parties.controller';
import { ConsentsController } from './api/consents.controller';
import { DuplicatesController } from './api/duplicates.controller';
import { HouseholdsController } from './api/households.controller';

const BASE = ['party.read', 'party.write', 'party.consent.write'];

/** Role → permission rows contributed by M03 (M03 §6). */
export const PARTY_PERMISSIONS: Record<string, string[]> = {
  SALESPERSON: BASE,
  SOLO_OWNER: [...BASE, 'party.merge', 'party.sensitive.read'],
  BRANCH_MANAGER: [...BASE, 'party.merge'],
  SALES_MANAGER: [...BASE, 'party.merge'],
  OPS: ['party.*'],
  COMPLIANCE: ['party.read', 'party.consent.write', 'party.suppression.write'],
  TENANT_ADMIN: ['party.*'],
  PRINCIPAL_OFFICER: ['party.read'],
};

/** Field master key: FIELD_MASTER_KEY (64 hex chars) is mandatory in production; a fixed dev key elsewhere. */

/** In-memory adapters by default; Postgres when PERSISTENCE=pg. */
function byPersistence(): Provider[] {
  const pick = <T>(provide: symbol, memory: () => T, pgFactory: () => T): Provider => ({
    provide,
    useFactory: (config: KernelConfig, app?: Pool) => (config.persistence === 'pg' && app ? pgFactory() : memory()),
    inject: [KERNEL_OPTIONS, APP_POOL],
  });
  return [
    pick<PartyRepository>(
      PARTY_REPOSITORY,
      () => new InMemoryPartyRepository(),
      () => new PgPartyRepository(),
    ),
    pick<ConsentRepository>(
      CONSENT_REPOSITORY,
      () => new InMemoryConsentRepository(),
      () => new PgConsentRepository(),
    ),
    pick<SuppressionRepository>(
      SUPPRESSION_REPOSITORY,
      () => new InMemorySuppressionRepository(),
      () => new PgSuppressionRepository(),
    ),
    pick<HouseholdRepository>(
      HOUSEHOLD_REPOSITORY,
      () => new InMemoryHouseholdRepository(),
      () => new PgHouseholdRepository(),
    ),
    pick<RoleLinkRepository>(
      ROLE_LINK_REPOSITORY,
      () => new InMemoryRoleLinkRepository(),
      () => new PgRoleLinkRepository(),
    ),
    pick<DuplicateRepository>(
      DUPLICATE_REPOSITORY,
      () => new InMemoryDuplicateRepository(),
      () => new PgDuplicateRepository(),
    ),
  ];
}

const adapters: Provider[] = [
  ...byPersistence(),
  { provide: POLICY_NUMBER_LOOKUP, useClass: NoPolicyNumberLookup },
  { provide: FIELD_CIPHER, useFactory: (c: KernelConfig) => new AesGcmFieldCipher(fieldMasterKey(c)), inject: [KERNEL_OPTIONS] },
];

const services: Provider[] = [
  PartyContext,
  DuplicateDetector,
  PartyWriter,
  PartyService,
  PartyQueryService,
  ConsentService,
  SensitivePartyAccessor,
  DuplicateService,
  HouseholdService,
  PartyFacadeService,
  { provide: PARTY_FACADE, useExisting: PartyFacadeService },
];

/** M03 Party & Consent — system of record for customers, consent ledger and reviewed merges. */
@Module({
  imports: [DistributionModule, TenancyModule],
  controllers: [PartiesController, ConsentsController, DuplicatesController, HouseholdsController],
  providers: [...adapters, ...services],
  exports: [PARTY_FACADE, FIELD_CIPHER],
})
export class PartyModule implements OnModuleInit {
  constructor(@Inject(PERMISSION_POLICY) private readonly permissions: RolePermissionMatrix) {}

  onModuleInit(): void {
    for (const [role, perms] of Object.entries(PARTY_PERMISSIONS)) this.permissions.grant(role, perms);
  }
}
