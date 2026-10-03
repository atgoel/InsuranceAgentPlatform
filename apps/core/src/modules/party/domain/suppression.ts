import { ConsentChannel } from './consent';

export type SuppressionReason = 'DND' | 'OPT_OUT' | 'BOUNCE' | 'DSR' | 'COMPLAINT';

export interface Suppression {
  readonly id: string;
  readonly contactHash: string;
  readonly channel: ConsentChannel;
  readonly reason: SuppressionReason;
  readonly from: string;
  readonly to?: string;
  readonly createdBy: string;
}

export function isActive(s: Suppression, at: Date): boolean {
  const atTime = at.getTime();
  const fromTime = new Date(s.from).getTime();

  if (atTime < fromTime) {
    return false;
  }

  if (s.to !== undefined) {
    const toTime = new Date(s.to).getTime();
    return atTime < toTime;
  }

  return true;
}
