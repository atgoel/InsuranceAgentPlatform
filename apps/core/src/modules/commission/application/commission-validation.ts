import {z} from 'zod';
import {Money} from '../../../kernel/domain/money';
import {SensitiveContentGuard} from '../../../kernel/domain/sensitive-content';
import {ValidationError} from '../../../kernel/errors/domain-errors';
import {CommissionReceivedInput} from './ports';
const schema=z.object({heldPolicyId:z.string().min(1),insurerId:z.string().min(1).optional(),sellerMemberId:z.string().min(1),amountPaise:z.number().int().nonnegative(),ratePct:z.number().min(0).max(100).optional(),reason:z.string().min(1).max(1000).optional(),invoiceNo:z.string().min(1).max(40).optional(),occurredOn:z.string().date(),importKey:z.string().min(1).max(200)});
export function validateCommissionReceived(input:CommissionReceivedInput):void {
 Money.ofPaise(input.amountPaise);
 if(!schema.safeParse(input).success)throw new ValidationError('invalid_commission_entry','Invalid commission received entry');
 for(const text of [input.reason,input.invoiceNo])if(text)SensitiveContentGuard.check(text);
}
