export class HeadSampler {
  private rates: Record<string, number>;
  private excluded: Set<string>;
  private random: () => number;

  constructor(opts?: {
    rates?: Record<string, number>;
    excluded?: string[];
    random?: () => number;
  }) {
    this.rates = opts?.rates ?? {};
    this.excluded = new Set(opts?.excluded ?? ['/health/live', '/health/ready', '/metrics']);
    this.random = opts?.random ?? (() => Math.random());
  }

  decide(route: string, status: number): 'log' | 'skip' | 'exclude' {
    if (this.excluded.has(route)) {
      return 'exclude';
    }

    if (status >= 400) {
      return 'log';
    }

    const rate = this.rates[route] ?? 1;
    return this.random() < rate ? 'log' : 'skip';
  }
}
