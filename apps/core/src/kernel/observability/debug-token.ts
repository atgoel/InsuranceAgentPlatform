import { createHmac } from 'crypto';
import { ValidationError } from '../errors/domain-errors';
import { Clock } from '../domain/clock';

export class DebugTokenService {
  constructor(private secret: string, private clock: Clock) {}

  issue(input: { tenantId: string; ttlMinutes: number }): string {
    if (input.ttlMinutes < 1 || input.ttlMinutes > 15) {
      throw new ValidationError('debug_token_ttl_invalid', 'TTL must be between 1 and 15 minutes');
    }

    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + input.ttlMinutes * 60 * 1000);

    const payload = {
      tenantId: input.tenantId,
      expiresAt: expiresAt.toISOString(),
      issuedAt: now.toISOString(),
    };

    const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.secret)
      .update(payloadStr)
      .digest('base64url');

    return `${payloadStr}.${signature}`;
  }

  verify(token: string | undefined, tenantId: string | undefined): boolean {
    if (!token) return false;

    const parts = token.split('.');
    if (parts.length !== 2) return false;

    const [payloadStr, signature] = parts;

    // Verify signature
    const expectedSignature = createHmac('sha256', this.secret)
      .update(payloadStr)
      .digest('base64url');

    if (signature !== expectedSignature) {
      return false;
    }

    // Verify payload
    try {
      const payloadJson = Buffer.from(payloadStr, 'base64url').toString();
      const payload = JSON.parse(payloadJson);

      // Check expiry
      const expiresAt = new Date(payload.expiresAt);
      if (expiresAt < this.clock.now()) {
        return false;
      }

      // Check tenant
      if (tenantId && payload.tenantId !== '*' && payload.tenantId !== tenantId) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }
}
