import { Inject, Injectable } from '@nestjs/common';
import { CATALOGUE_QUERY, CatalogueQueryFacade } from '../../catalogue/application/ports';
import { MEMBER_REPOSITORY, MemberRepository } from '../../distribution/application/ports';
import { inScope } from '../../crm/application/crm-scope';
import { Principal } from '../../../kernel/tenancy/principal';
import { lineOfCategory, PolicyCategory } from '../../../kernel/insurance/policy-commercials';
import { ParsedPolicy, ImportRow } from '../domain/book-import';
import { BookScope } from './book-scope';
import { Transaction } from './ports';

@Injectable()
export class BookImportLookups {
  constructor(
    @Inject(CATALOGUE_QUERY) private readonly catalogue: CatalogueQueryFacade,
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    private readonly scope: BookScope,
  ) {}

  async enrichProduct(parsed: ParsedPolicy, asOf: string): Promise<void> {
    const found = await this.catalogue.findProduct(parsed.insurerName, parsed.productName, asOf);
    if (!found || found.line !== parsed.commercials.line) return;
    parsed.insurerId = found.insurerId;
    parsed.productVersionId = found.versionId;
    const category = found.category as PolicyCategory;
    if (parsed.commercials.category === 'OTHER' && lineOfCategory(category) === found.line) parsed.commercials.category = category;
  }

  async suggestions(tx: Transaction, principal: Principal, name: string): Promise<NonNullable<ImportRow['referrerSuggestions']>> {
    const scope = await this.scope.scopes.resolve(tx, principal);
    const members = await this.members.list(tx, {
      q: name,
      limit: 100,
      orgUnitIds: scope.kind === 'UNIT_SUBTREE' ? scope.orgUnitIds : undefined,
      memberId: scope.kind === 'OWN' ? scope.memberId : undefined,
    });
    const normalized = name.trim().toLowerCase();
    const result: NonNullable<ImportRow['referrerSuggestions']> = members.items
      .filter((member) => member.props.displayName.trim().toLowerCase() === normalized)
      .map((member) => ({ memberId: member.props.id, name: member.props.displayName }));
    const parties = await this.scope.parties.searchByName(tx, name);
    for (const party of parties) if (inScope(party, scope)) result.push({ partyId: party.id, name: party.displayName });
    return result;
  }
}
