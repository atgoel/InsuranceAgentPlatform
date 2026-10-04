import { CallOutcome } from './outcome';

export class RetryPolicy {
  constructor(
    private readonly policy: { maxAttempts: 3; baseMs: 200; capMs: 5000 },
    private readonly random: () => number,
  ) {}

  delayFor(attempt: number): number {
    const ceiling = Math.min(this.policy.capMs, this.policy.baseMs * 2 ** (attempt - 1));
    return Math.floor(this.random() * ceiling);
  }

  isRetryable<T>(outcome: CallOutcome<T>): boolean {
    return outcome.kind === 'failure' && outcome.retryable;
  }
}
