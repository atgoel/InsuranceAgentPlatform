export class UsageMeter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static consume(_counter: any, _amount: number, _alertThresholdPct: number, _now: Date): any {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static percentUsed(_counter: any): number | null {
    throw new Error('Not implemented');
  }
}
