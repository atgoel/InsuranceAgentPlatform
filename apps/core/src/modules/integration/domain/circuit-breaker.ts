import { Clock } from '../../../kernel/domain/clock';

export interface BreakerPolicy {
  failureRateThreshold: 0.5;
  minimumCalls: 10;
  windowSize: 20;
  slowCallMs: number;
  openForMs: 30_000;
  halfOpenProbes: 3;
}

type State = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
type Sample = 'success' | 'failure' | 'slow';

export class CircuitBreaker {
  private current: State = 'CLOSED';
  private openedAt = 0;
  private samples: Sample[] = [];
  private inFlight = 0;
  private successes = 0;

  constructor(
    private readonly policy: BreakerPolicy,
    private readonly clock: Clock,
  ) {}

  canPass(): boolean {
    const state = this.state();
    if (state === 'OPEN') {
      return false;
    }
    if (state === 'CLOSED') {
      return true;
    }
    if (this.inFlight + this.successes >= this.policy.halfOpenProbes) {
      return false;
    }
    this.inFlight += 1;
    return true;
  }

  record(outcome: Sample): void {
    if (this.current === 'OPEN') {
      return;
    }
    if (this.current === 'HALF_OPEN') {
      this.recordProbe(outcome);
      return;
    }
    this.samples.push(outcome);
    this.samples = this.samples.slice(-this.policy.windowSize);
    if (this.samples.length < this.policy.minimumCalls) {
      return;
    }
    const failures = this.samples.filter(sample => sample !== 'success').length;
    if (failures / this.samples.length >= this.policy.failureRateThreshold) {
      this.open();
    }
  }

  state(): State {
    if (this.current === 'OPEN' && this.clock.now().getTime() - this.openedAt >= this.policy.openForMs) {
      this.current = 'HALF_OPEN';
      this.inFlight = 0;
      this.successes = 0;
    }
    return this.current;
  }

  private recordProbe(outcome: Sample): void {
    if (this.inFlight === 0) {
      return;
    }
    this.inFlight -= 1;
    if (outcome !== 'success') {
      this.open();
      return;
    }
    this.successes += 1;
    if (this.successes >= this.policy.halfOpenProbes) {
      this.current = 'CLOSED';
      this.samples = [];
      this.inFlight = 0;
      this.successes = 0;
    }
  }

  private open(): void {
    this.current = 'OPEN';
    this.openedAt = this.clock.now().getTime();
    this.inFlight = 0;
    this.successes = 0;
  }
}
