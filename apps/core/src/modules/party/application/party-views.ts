import { Party } from '../domain/party';
import { CustomFieldDefinition, CustomFieldValidator } from '../../../kernel/custom-fields';
import { PartySummary } from './ports';

/** Masked representation: never raw contacts, DOB or PAN (AC-M03-11). */
export function partyView(p: Party, defs: readonly CustomFieldDefinition[] = []) {
  const x = p.props;
  return {
    id: x.id, kind: x.kind, displayName: x.displayName,
    contacts: x.contactPoints.map((c) => ({ channel: c.channel, masked: c.masked, isPrimary: c.isPrimary, verified: !!c.verifiedAt })),
    dobYear: x.dobYear, panLast4: x.panLast4, preferredLanguage: x.preferredLanguage, preferredChannel: x.preferredChannel,
    ownerMemberId: x.ownerMemberId, tags: [...x.tags], source: x.source, status: x.status, createdAt: x.createdAt, version: x.version,
    customFields: CustomFieldValidator.visible(defs, x.customFields),
  };
}
export type PartyView = ReturnType<typeof partyView>;

export function partySummary(p: Party): PartySummary {
  const x = p.props;
  return {
    id: x.id, displayName: x.displayName, primaryMobileMasked: p.primary('MOBILE')?.masked, primaryEmailMasked: p.primary('EMAIL')?.masked,
    preferredLanguage: x.preferredLanguage, preferredChannel: x.preferredChannel, status: x.status, ownerMemberId: x.ownerMemberId, orgUnitId: x.orgUnitId,
  };
}
