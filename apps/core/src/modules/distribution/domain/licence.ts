import { ValidationError } from '../../../kernel/errors/domain-errors';

export type LicenceKind = 'POSP_LIFE' | 'POSP_GENERAL' | 'ISP' | 'INDIVIDUAL_AGENT' | 'OTHER';

export interface Licence {
  id: string;
  memberId: string;
  kind: LicenceKind;
  number: string;
  validFrom: string;
  validTo: string;
  verifiedAt?: string;
}

export function createLicence(input: {
  memberId: string;
  kind: LicenceKind;
  number: string;
  validFrom: string;
  validTo: string;
  id?: string;
  verifiedAt?: string;
}): Licence {
  if (input.validFrom > input.validTo) {
    throw new ValidationError('licence_dates_invalid', 'validFrom must be before validTo');
  }

  return {
    id: input.id || 'lic_' + Math.random().toString(36).substr(2, 9),
    memberId: input.memberId,
    kind: input.kind,
    number: input.number,
    validFrom: input.validFrom,
    validTo: input.validTo,
    verifiedAt: input.verifiedAt,
  };
}

export const EXPIRY_THRESHOLDS_DAYS = [60, 30, 7] as const;

export function daysUntil(dateIso: string, today: Date): number {
  const expiryDate = new Date(dateIso);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const expiryStart = new Date(expiryDate.getFullYear(), expiryDate.getMonth(), expiryDate.getDate());

  const diffMs = expiryStart.getTime() - todayStart.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return diffDays;
}

export function dueThreshold(licence: Licence, today: Date, alreadyAlerted: number[]): 60 | 30 | 7 | undefined {
  const days = daysUntil(licence.validTo, today);

  if (days < 0) {
    return undefined;
  }

  if (days >= 60 && !alreadyAlerted.includes(60)) {
    return 60;
  }
  if (days >= 30 && days < 60 && !alreadyAlerted.includes(30)) {
    return 30;
  }
  if (days >= 7 && days < 30 && !alreadyAlerted.includes(7)) {
    return 7;
  }

  return undefined;
}
