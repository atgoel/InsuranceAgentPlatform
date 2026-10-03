export class TieUpSet {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(_tieUps: any[]) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validate(_entityType: any, _policy: any): void {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeOn(_date: string, _line?: any): any[] {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insurersFor(_line: any, _date: string): string[] {
    throw new Error('Not implemented');
  }
}

export class TieUpLimitPolicy {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(_limits: any[]) {}

  static default(): TieUpLimitPolicy {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  maxFor(_entityType: any, _line: any): number | null {
    throw new Error('Not implemented');
  }
}
