import { createHash } from 'node:crypto';
import { Inject, Module, OnModuleInit, Provider } from '@nestjs/common';
import { KERNEL_OPTIONS, PERMISSION_POLICY } from '../../kernel/tokens';
import { KernelConfig } from '../../kernel/config';
import { RolePermissionMatrix } from '../../kernel/tenancy/permissions';
import { DistributionModule } from '../distribution/distribution.module';
import {
  CONSENT_REPOSITORY, DUPLICATE_REPOSITORY, FIELD_CIPHER, HOUSEHOLD_REPOSITORY, PARTY_FACADE, PARTY_REPOSITORY, POLICY_NUMBER_LOOKUP,
  ROLE_LINK_REPOSITORY, SUPPRESSION_REPOSITORY,
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
import { AesGcmFieldCipher } from './infrastructure/aes-gcm-field-cipher';
import {
  InMemoryConsentRepository, InMemoryDuplicateRepository, InMemoryHouseholdRepository, InMemoryPartyRepository, InMemoryRoleLinkRepository,
  InMemorySuppressionRepository, NoPolicyNumberLookup,
} from './infrastructure/in-memory-party.repositories';
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
export function fieldMasterKey(config: KernelConfig, env: NodeJS.ProcessEnv = process.env): Buffer {
  const hex = env.FIELD_MASTER_KEY;
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex');
  if (config.env === 'production') throw new Error('FIELD_MASTER_KEY (64 hex chars) is required in production');
  return createHash('sha256').update('iap-development-field-key').digest();
}

const adapters: Provider[] = [
  { provide: PARTY_REPOSITORY, useClass: InMemoryPartyRepository },
  { provide: CONSENT_REPOSITORY, useClass: InMemoryConsentRepository },
  { provide: SUPPRESSION_REPOSITORY, useClass: InMemorySuppressionRepository },
  { provide: HOUSEHOLD_REPOSITORY, useClass: InMemoryHouseholdRepository },
  { provide: ROLE_LINK_REPOSITORY, useClass: InMemoryRoleLinkRepository },
  { provide: DUPLICATE_REPOSITORY, useClass: InMemoryDuplicateRepository },
  { provide: POLICY_NUMBER_LOOKUP, useClass: NoPolicyNumberLookup },
  { provide: FIELD_CIPHER, useFactory: (c: KernelConfig) => new AesGcmFieldCipher(fieldMasterKey(c)), inject: [KERNEL_OPTIONS] },
];

const services: Provider[] = [
  PartyContext, DuplicateDetector, PartyWriter, PartyService, PartyQueryService, ConsentService, SensitivePartyAccessor, DuplicateService,
  HouseholdService, PartyFacadeService, { provide: PARTY_FACADE, useExisting: PartyFacadeService },
];

/** M03 Party & Consent — system of record for customers, consent ledger and reviewed merges. */
@Module({
  imports: [DistributionModule],
  controllers: [PartiesController, ConsentsController, DuplicatesController, HouseholdsController],
  providers: [...adapters, ...services],
  exports: [PARTY_FACADE],
})
export class PartyModule implements OnModuleInit {
  constructor(@Inject(PERMISSION_POLICY) private readonly permissions: RolePermissionMatrix) {}

  onModuleInit(): void {
    for (const [role, perms] of Object.entries(PARTY_PERMISSIONS)) this.permissions.grant(role, perms);
  }
}
