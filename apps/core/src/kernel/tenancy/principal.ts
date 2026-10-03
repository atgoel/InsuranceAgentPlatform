export interface Principal {
  userRef: string;
  tenantId: string;
  memberId?: string;
  orgUnitId?: string;
  roles: string[];
  realm: 'customers' | 'workforce';
  /** Authentication methods from the IdP (e.g. ['otp'], ['pwd','mfa']); privileged roles need 'mfa' (M02 §3.5). */
  amr?: string[];
}
