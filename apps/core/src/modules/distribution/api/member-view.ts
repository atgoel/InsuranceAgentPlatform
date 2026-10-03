import { Member } from '../domain/member';
import { RoleCatalogue } from '../domain/roles';
import { etagFor } from '../../../kernel/http/if-match';

/** Public representation: contact details only masked (AC-M02-13). */
export function memberView(member: Member, orgUnitName: string | undefined, catalogue: RoleCatalogue) {
  const p = member.props;
  return {
    id: p.id, displayName: p.displayName, phoneMasked: p.phoneMasked, emailMasked: p.emailMasked, roles: p.roles,
    salespersonType: p.salespersonType, orgUnitId: p.orgUnitId, orgUnitName, status: p.status, capacityPerDay: p.capacityPerDay,
    skills: p.skills, languages: p.languages, invitedAt: p.invitedAt, activatedAt: p.activatedAt,
    mfaRequired: p.roles.some((r) => catalogue.list().find((d) => d.role === r)?.privileged), version: p.version, etag: etagFor(p.version),
  };
}
