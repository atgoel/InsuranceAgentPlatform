import { Transaction } from '../../../kernel/persistence/unit-of-work';
export interface RenewalOpportunityInput {
  heldPolicyId: string; renewalDate: string; partyId: string; ownerMemberId: string; orgUnitId?: string;
  productName: string; line: 'HEALTH' | 'GENERAL'; premiumPaise: number;
}
export interface RenewalOpportunityPort {
  ensure(tx: Transaction, input: RenewalOpportunityInput): Promise<{opportunityId:string;created:boolean}>;
}
export const RENEWAL_OPPORTUNITY_PORT = Symbol('RenewalOpportunityPort');
