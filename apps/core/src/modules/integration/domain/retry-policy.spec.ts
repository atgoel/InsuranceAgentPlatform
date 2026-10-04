import { RetryPolicy } from './retry-policy';

describe('AC-M08-04 retry policy', () => {
  const settings = { maxAttempts: 3, baseMs: 200, capMs: 5000 } as const;

  it('AC-M08-04 uses deterministic full jitter and the specified exponential cap', () => {
    const retry = new RetryPolicy(settings, () => 0.5);
    expect(retry.delayFor(1)).toBe(100);
    expect(retry.delayFor(2)).toBe(200);
    expect(retry.delayFor(3)).toBe(400);
    expect(retry.delayFor(6)).toBe(2500);
    expect(new RetryPolicy(settings, () => 0).delayFor(1)).toBe(0);
    expect(new RetryPolicy(settings, () => 0.999).delayFor(6)).toBe(4995);
  });

  it('AC-M08-04 retries only failures explicitly marked retryable, never unknown or success', () => {
    const retry = new RetryPolicy(settings, () => 0);
    expect(retry.isRetryable({ kind: 'success', value: 'ok' })).toBe(false);
    expect(retry.isRetryable({ kind: 'unknown', reason: 'timeout' })).toBe(false);
    expect(retry.isRetryable({ kind: 'unknown', reason: 'connection_reset' })).toBe(false);
    expect(retry.isRetryable({ kind: 'unknown', reason: 'assisted' })).toBe(false);
    expect(retry.isRetryable({ kind: 'failure', retryable: false, code: 'declined', message: 'Declined' })).toBe(false);
    expect(retry.isRetryable({ kind: 'failure', retryable: true, code: 'network', message: 'Unavailable' })).toBe(true);
  });
});
