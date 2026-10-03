export class FeatureFlagSet {
  static defaults(): FeatureFlagSet {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enable(_key: any): void {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  disable(_key: any): void {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordComplianceReview(_key: any, _reviewRef: string, _at: Date): void {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(_key: any): any {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  list(): any[] {
    throw new Error('Not implemented');
  }
}
