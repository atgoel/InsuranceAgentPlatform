import { FlushPolicy } from './flush-policy';

describe('AC-M00-16 FlushPolicy', () => {
  it('flushes on error (5xx)', () => {
    const policy = new FlushPolicy();
    const reason = policy.decide({ method: 'GET', route: '/test', status: 500, durationMs: 10, forced: false, hasError: true });
    expect(reason).toBe('error');
  });

  it('flushes on forced', () => {
    const policy = new FlushPolicy();
    const reason = policy.decide({ method: 'GET', route: '/test', status: 200, durationMs: 10, forced: true, hasError: false });
    expect(reason).toBe('forced');
  });

  it('flushes on slow', () => {
    const policy = new FlushPolicy();
    const reason = policy.decide({ method: 'GET', route: '/test', status: 200, durationMs: 500, forced: false, hasError: false });
    expect(reason).toBe('slow');
  });

  it('respects read budget for GET', () => {
    const policy = new FlushPolicy({ readBudgetMs: 100 });
    const reason = policy.decide({ method: 'GET', route: '/test', status: 200, durationMs: 150, forced: false, hasError: false });
    expect(reason).toBe('slow');
  });

  it('respects write budget for POST', () => {
    const policy = new FlushPolicy({ writeBudgetMs: 200 });
    const reason = policy.decide({ method: 'POST', route: '/test', status: 200, durationMs: 250, forced: false, hasError: false });
    expect(reason).toBe('slow');
  });

  it('respects route budgets', () => {
    const policy = new FlushPolicy({ routeBudgets: { '/special': 50 } });
    const reason = policy.decide({ method: 'GET', route: '/special', status: 200, durationMs: 100, forced: false, hasError: false });
    expect(reason).toBe('slow');
  });
});
