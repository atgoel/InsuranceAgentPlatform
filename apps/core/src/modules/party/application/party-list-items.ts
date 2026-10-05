import { Inject, Injectable } from '@nestjs/common';
import { CustomFieldValidator, CustomFieldValues } from '../../../kernel/custom-fields';
import { Party } from '../domain/party';
import { HOUSEHOLD_REPOSITORY, HouseholdRepository, ROLE_LINK_REPOSITORY, RoleLinkRepository, SELLER_DIRECTORY, SellerDirectory, Transaction } from './ports';
import { PartyContext } from './party-context';

export interface PartyListItem {
  id: string;
  displayName: string;
  primaryMobileMasked?: string;
  householdName?: string;
  rolesSummary: string[];
  tags: string[];
  ownerMemberId?: string;
  /** ADR-009: display name from M02; absent when the member is unknown. */
  ownerName?: string;
  /** CR-001: P2 values masked as '****'. */
  customFields: CustomFieldValues;
}

/** Builds customer list items; owner names come from one batched M02 lookup per response (ADR-009). */
@Injectable()
export class PartyListItems {
  constructor(
    @Inject(HOUSEHOLD_REPOSITORY) private readonly households: HouseholdRepository,
    @Inject(ROLE_LINK_REPOSITORY) private readonly roles: RoleLinkRepository,
    @Inject(SELLER_DIRECTORY) private readonly sellers: SellerDirectory,
    private readonly ctx: PartyContext,
  ) {}

  ownerNameOf(tenantId: string, ownerMemberId: string | undefined): Promise<string | undefined> {
    if (!ownerMemberId) return Promise.resolve(undefined);
    return this.ctx.uow.run(tenantId, async (tx) => (await this.sellers.displayNames(tx, [ownerMemberId]))[ownerMemberId]);
  }

  async build(tx: Transaction, parties: Party[]): Promise<PartyListItem[]> {
    const defs = await this.ctx.defs.activeFor(tx, 'party');
    const names = await this.sellers.displayNames(tx, parties.flatMap((p) => (p.props.ownerMemberId ? [p.props.ownerMemberId] : [])));
    return Promise.all(parties.map(async (p) => {
      const [household, roles] = await Promise.all([this.households.forParty(tx, p.props.id), this.roles.forParty(tx, p.props.id)]);
      return {
        id: p.props.id, displayName: p.props.displayName, primaryMobileMasked: p.primary('MOBILE')?.masked, householdName: household?.name,
        rolesSummary: [...new Set(roles.map((r) => (r.label ? `${r.role} · ${r.label}` : r.role)))], tags: [...p.props.tags], ownerMemberId: p.props.ownerMemberId,
        ownerName: p.props.ownerMemberId ? names[p.props.ownerMemberId] : undefined,
        customFields: CustomFieldValidator.mask(defs, p.props.customFields),
      };
    }));
  }
}
