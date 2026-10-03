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

  for (const threshold of EXPIRY_THRESHOLDS_DAYS) {
    if (days <= threshold && !alreadyAlerted.includes(threshold)) {
      return threshold;
    }
  }

  return undefined;
}
