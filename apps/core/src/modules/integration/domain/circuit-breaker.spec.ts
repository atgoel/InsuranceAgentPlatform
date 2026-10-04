import { FixedClock } from '../../../kernel/domain/clock';
import { BreakerPolicy, CircuitBreaker } from './circuit-breaker';

const policy: BreakerPolicy = {
  failureRateThreshold: 0.5,
  minimumCalls: 10,
  windowSize: 20,
  slowCallMs: 1000,
  openForMs: 30_000,
  halfOpenProbes: 3,
};

function opened(clock: FixedClock): CircuitBreaker {
  const breaker = new CircuitBreaker(policy, clock);
  for (let index = 0; index < 5; index += 1) {
    breaker.record('success');
    breaker.record('failure');
  }
  return breaker;
}

describe('AC-M08-02 circuit breaker', () => {
  it('AC-M08-02 requires minimum calls and opens at the exact 50% boundary', () => {
    const breaker = new CircuitBreaker(policy, new FixedClock());
    for (let index = 0; index < 9; index += 1) {
      breaker.record('failure');
    }
    expect(breaker.state()).toBe('CLOSED');
    breaker.record('success');
    expect(breaker.state()).toBe('OPEN');
    expect(breaker.canPass()).toBe(false);
    expect(opened(new FixedClock()).state()).toBe('OPEN');
  });

  it('AC-M08-02 uses only the latest 20 calls and counts slow calls as failures', () => {
    const breaker = new CircuitBreaker(policy, new FixedClock());
    for (let index = 0; index < 30; index += 1) {
      breaker.record('success');
    }
    for (let index = 0; index < 9; index += 1) {
      breaker.record('slow');
    }
    expect(breaker.state()).toBe('CLOSED');
    breaker.record('slow');
    expect(breaker.state()).toBe('OPEN');
  });

  it('AC-M08-02 half-opens exactly at 30 seconds and reserves at most three probes', () => {
    const clock = new FixedClock();
    const breaker = opened(clock);
    clock.advance(29_999);
    expect(breaker.canPass()).toBe(false);
    clock.advance(1);
    expect(breaker.state()).toBe('HALF_OPEN');
    expect(breaker.canPass()).toBe(true);
    expect(breaker.canPass()).toBe(true);
    expect(breaker.canPass()).toBe(true);
    expect(breaker.canPass()).toBe(false);
    breaker.record('success');
    breaker.record('success');
    expect(breaker.state()).toBe('HALF_OPEN');
    breaker.record('success');
    expect(breaker.state()).toBe('CLOSED');
    expect(breaker.canPass()).toBe(true);
  });

  it.each(['failure', 'slow'] as const)('AC-M08-02 any %s probe reopens and ignores late successes', outcome => {
    const clock = new FixedClock();
    const breaker = opened(clock);
    clock.advance(30_000);
    expect(breaker.canPass()).toBe(true);
    expect(breaker.canPass()).toBe(true);
    breaker.record(outcome);
    expect(breaker.state()).toBe('OPEN');
    breaker.record('success');
    expect(breaker.canPass()).toBe(false);
    clock.advance(30_000);
    expect(breaker.state()).toBe('HALF_OPEN');
    breaker.record('success');
    expect(breaker.state()).toBe('HALF_OPEN');
  });

  it('AC-M08-02 closes with a fresh window after three successful probes', () => {
    const clock = new FixedClock();
    const breaker = opened(clock);
    clock.advance(30_000);
    for (let index = 0; index < 3; index += 1) {
      expect(breaker.canPass()).toBe(true);
      breaker.record('success');
    }
    breaker.record('failure');
    expect(breaker.state()).toBe('CLOSED');
  });

  it('AC-M08-02 never admits a fourth half-open probe after an earlier probe succeeds', () => {
    const clock = new FixedClock();
    const breaker = opened(clock);
    clock.advance(30_000);
    for (let index = 0; index < 3; index += 1) {
      expect(breaker.canPass()).toBe(true);
    }
    breaker.record('success');
    expect(breaker.canPass()).toBe(false);
    breaker.record('failure');
    expect(breaker.state()).toBe('OPEN');
    breaker.record('success');
    expect(breaker.canPass()).toBe(false);
  });
});
