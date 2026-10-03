export interface Principal {
  userRef: string;
  tenantId: string;
  memberId?: string;
  orgUnitId?: string;
  roles: string[];
  realm: 'customers' | 'workforce';
}
