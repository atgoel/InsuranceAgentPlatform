import { ValidationError } from '../../../kernel/errors/domain-errors';
import { UsageMetric } from './plan';

export interface UsageCounter {
  metric: UsageMetric;
  period: string; // YYYY-MM
  used: number;
  limit: number | null;
  alertedAt?: string;
}

export type ConsumeResult =
  | { allowed: true; counter: UsageCounter; crossedThreshold: boolean }
  | { allowed: false; counter: UsageCounter };

export class UsageMeter {
  static consume(counter: UsageCounter, amount: number, alertThresholdPct: number, now: Date): ConsumeResult {
    // Validate amount is positive integer
    if (amount <= 0 || !Number.isInteger(amount)) {
      throw new ValidationError('invalid_amount', 'Amount must be a positive integer');
    }

    // Check if limit exceeded
    if (counter.limit !== null && counter.used + amount > counter.limit) {
      return { allowed: false, counter };
    }

    // Create updated counter
    const newCounter: UsageCounter = {
      ...counter,
      used: counter.used + amount,
    };

    // Check for threshold crossing
    let crossedThreshold = false;
    if (counter.limit !== null) {
      const threshold = (counter.limit * alertThresholdPct) / 100;
      const wasBelowThreshold = counter.used < threshold;
      const isNowAtOrAboveThreshold = newCounter.used >= threshold;

      // Threshold crossed if: was below, now at/above, and not already alerted
      if (wasBelowThreshold && isNowAtOrAboveThreshold && !counter.alertedAt) {
        crossedThreshold = true;
        newCounter.alertedAt = now.toISOString();
      }
    }

    return { allowed: true, counter: newCounter, crossedThreshold };
  }

  static percentUsed(counter: UsageCounter): number | null {
    if (counter.limit === null) {
      return null;
    }

    return Math.round((counter.used / counter.limit) * 100);
  }
}
