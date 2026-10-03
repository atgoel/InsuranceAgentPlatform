export type PartyRole = 'PROPOSER' | 'INSURED' | 'PAYER' | 'NOMINEE' | 'LIFE_ASSURED';

export interface PartyRoleLink {
  readonly partyId: string;
  readonly role: PartyRole;
  readonly subjectType: 'HELD_POLICY' | 'PROPOSAL';
  readonly subjectId: string;
  readonly label?: string;
  readonly createdAt: string;
}
