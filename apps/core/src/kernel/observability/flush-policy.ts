export type FlushReason = 'error' | 'slow' | 'forced';

export class FlushPolicy {
  private readBudgetMs: number;
  private writeBudgetMs: number;
  private routeBudgets: Record<string, number>;

  constructor(opts?: {
    readBudgetMs?: number;
    writeBudgetMs?: number;
    routeBudgets?: Record<string, number>;
  }) {
    this.readBudgetMs = opts?.readBudgetMs ?? 400;
    this.writeBudgetMs = opts?.writeBudgetMs ?? 800;
    this.routeBudgets = opts?.routeBudgets ?? {};
  }

  decide(input: {
    method: string;
    route: string;
    status: number;
    durationMs: number;
    forced: boolean;
    hasError: boolean;
  }): FlushReason | undefined {
    // Precedence: hasError || status >= 500 → 'error'; forced → 'forced'; durationMs > budget → 'slow'
    if (input.hasError || input.status >= 500) {
      return 'error';
    }

    if (input.forced) {
      return 'forced';
    }

    const budget =
      this.routeBudgets[input.route] ??
      (input.method === 'GET' || input.method === 'HEAD'
        ? this.readBudgetMs
        : this.writeBudgetMs);

    if (input.durationMs > budget) {
      return 'slow';
    }

    return undefined;
  }
}
