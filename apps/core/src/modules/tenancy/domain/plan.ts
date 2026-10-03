export class PlanCatalogue {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(_plans: any[]) {}

  static default(): PlanCatalogue {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(_code: any): any {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  list(): any[] {
    throw new Error('Not implemented');
  }
}
