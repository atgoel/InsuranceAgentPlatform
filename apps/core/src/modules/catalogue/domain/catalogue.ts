export type LineOfBusiness = 'LIFE' | 'HEALTH' | 'GENERAL';
export type DistributorChannel = 'IMF' | 'BROKER' | 'INDIVIDUAL_AGENT' | 'CORPORATE_AGENT';

export interface Insurer {
  id: string;
  name: string;
  irdaiRegNo: string;
  lines: LineOfBusiness[];
  active: boolean;
}

export interface Product {
  id: string;
  insurerId: string;
  line: LineOfBusiness;
  name: string;
  category: 'TERM' | 'SAVINGS' | 'ULIP' | 'PENSION' | 'CHILD' | 'HEALTH_INDIVIDUAL' | 'HEALTH_FLOATER' | 'STANDARD_HEALTH' | 'MOTOR' | 'OTHER';
}
