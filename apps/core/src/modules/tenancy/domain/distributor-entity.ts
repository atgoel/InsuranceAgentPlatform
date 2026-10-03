export class DistributorEntity {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static create(_input: any): DistributorEntity {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entityType: any;

  legalName: string = '';

  registrationNo: string = '';

  registrationValidTo: string = '';

  principalOfficerName?: string;

  registrationStatus(_today: Date): 'valid' | 'expiring' | 'expired' {
    throw new Error('Not implemented');
  }

  comparisonScope(): 'MARKET_WIDE' | 'TIED_INSURERS' {
    throw new Error('Not implemented');
  }
}
