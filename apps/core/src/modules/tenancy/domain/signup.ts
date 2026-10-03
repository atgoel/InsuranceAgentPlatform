export function hashOtp(_otp: string, _pepper: string): string {
  throw new Error('Not implemented');
}

export class SoloSignup {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static start(_input: any): SoloSignup {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any;

  id: string = '';

  tenantId?: string;

  attempts: number = 0;

  expiresAt: Date = new Date();

  otpHash: string = '';

  verify(_otpHash: string, _now: Date): void {
    throw new Error('Not implemented');
  }

  attachTenant(_tenantId: string): void {
    throw new Error('Not implemented');
  }
}
