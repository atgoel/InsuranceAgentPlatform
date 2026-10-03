import { SalespersonType } from './member';

export interface SellingScope {
  memberId: string;
  salespersonType: SalespersonType;
  posEligibleOnly: boolean;
  lines: Array<'LIFE' | 'HEALTH' | 'GENERAL'>;
  insurerCodes: Record<string, string>;
}
