import { Household } from '../domain/household';
import { ConsentRecord } from '../domain/consent';

export function householdView(h: Household) {
  return { id: h.id, name: h.name, headPartyId: h.headPartyId, members: h.members.map((m) => ({ ...m })) };
}

/** Consent evidence: ids, enums, versions and the capturing actor (member id or 'customer'). */
export function consentView(r: ConsentRecord) {
  return {
    id: r.id,
    purpose: r.purpose,
    channel: r.channel,
    granted: r.granted,
    noticeVersion: r.noticeVersion,
    source: r.source,
    evidenceRef: r.evidenceRef,
    capturedBy: r.capturedBy,
    occurredAt: r.occurredAt,
  };
}
