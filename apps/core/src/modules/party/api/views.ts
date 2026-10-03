import { Household } from '../domain/household';
import { ConsentRecord } from '../domain/consent';

export function householdView(h: Household) {
  return { id: h.id, name: h.name, headPartyId: h.headPartyId, members: h.members.map((m) => ({ ...m })) };
}

/** Consent history without the actor pseudonym's internals — ids, enums and versions only. */
export function consentView(r: ConsentRecord) {
  return { id: r.id, purpose: r.purpose, channel: r.channel, granted: r.granted, noticeVersion: r.noticeVersion, source: r.source, evidenceRef: r.evidenceRef, occurredAt: r.occurredAt };
}
