import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { LineOfBusiness } from '../domain/catalogue';
import { ScopeInput } from '../domain/scope-engine';
import { TENANT_SETTINGS_REPOSITORY, TIE_UP_READER, TenantSettingsRepository, TieUpReader } from '../../tenancy/application/ports';
import { SELLER_DIRECTORY, SellerDirectory } from '../../distribution/application/ports';
import { ScopeInputsProvider, Transaction } from './ports';

const LINES: LineOfBusiness[] = ['LIFE', 'HEALTH', 'GENERAL'];
const SELLING_ROLES = new Set(['SALESPERSON', 'SOLO_OWNER']);

const sells = (principal: Principal): boolean => principal.roles.some((r) => SELLING_ROLES.has(r));

/**
 * Scope inputs from verified context only: entity type and tie-ups (M01) and the caller's selling scope (M02).
 * Non-selling roles (admin, ops, compliance) browse the tenant's full permitted catalogue as EMPLOYEE. A selling role
 * without an active selling scope (unknown, inactive or exited member) is licensed for no line, so nothing is in scope.
 */
@Injectable()
export class DefaultScopeInputsProvider implements ScopeInputsProvider {
  constructor(
    @Inject(TENANT_SETTINGS_REPOSITORY) private readonly settings: TenantSettingsRepository,
    @Inject(TIE_UP_READER) private readonly tieUps: TieUpReader,
    @Inject(SELLER_DIRECTORY) private readonly sellers: SellerDirectory,
  ) {}

  async inputsFor(tx: Transaction, principal: Principal, date: string): Promise<Omit<ScopeInput, 'line' | 'category'>> {
    const entity = await this.settings.getEntity(tx);
    if (!entity) throw new ForbiddenError('tenant_not_configured', 'The distributor entity is not set up yet');
    const tied: Partial<Record<LineOfBusiness, string[]>> = {};
    for (const line of LINES) tied[line] = await this.tieUps.activeInsurers(tx.tenantId, line, date);
    const selling = principal.memberId ? await this.sellers.sellingScope(tx, principal.memberId, new Date(`${date}T12:00:00Z`)) : undefined;
    return {
      entityType: entity.entityType,
      comparisonScope: entity.entityType === 'BROKER' ? 'MARKET_WIDE' : 'TIED_INSURERS',
      tiedInsurerIds: tied,
      salesperson: selling ? { type: selling.salespersonType, lines: selling.lines } : { type: 'EMPLOYEE', lines: sells(principal) ? [] : LINES },
      date,
    };
  }
}
