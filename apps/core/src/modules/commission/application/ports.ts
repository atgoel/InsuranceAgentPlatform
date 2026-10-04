import { Transaction } from '../../../kernel/persistence/unit-of-work';
export interface CommissionReceivedInput {
  heldPolicyId: string; insurerId?: string; sellerMemberId: string; amountPaise: number; ratePct?: number;
  reason?: string; invoiceNo?: string; occurredOn: string; importKey: string;
}
export interface CommissionImportPort {
  recordReceived(tx: Transaction, input: CommissionReceivedInput): Promise<{id:string;created:boolean}>;
}
export const COMMISSION_IMPORT_PORT = Symbol('CommissionImportPort');
