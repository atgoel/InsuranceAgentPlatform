export type PartyRole = 'PROPOSER' | 'INSURED' | 'PAYER' | 'NOMINEE' | 'LIFE_ASSURED';

export interface PartyRoleLink {
  readonly partyId: string;
  readonly role: PartyRole;
  readonly subjectType: 'HELD_POLICY' | 'PROPOSAL';
  readonly subjectId: string;
  readonly label?: string;
  readonly createdAt: string;
}

export function roleLinkKey(l: Pick<PartyRoleLink, 'role' | 'subjectType' | 'subjectId'>): string {
  return `${l.role}|${l.subjectType}|${l.subjectId}`;
}
