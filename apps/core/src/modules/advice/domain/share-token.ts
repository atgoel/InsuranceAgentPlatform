import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SharePayload {
  quoteRequestId: string;
  tenantId: string;
  /** Expiry, epoch seconds. */
  exp: number;
}

export type ShareTokenRejection = 'malformed' | 'bad_signature' | 'expired' | 'tenant_mismatch';

export const SHARE_TOKEN_VALIDITY_DAYS = 7;

/** Signed, expiring, read-only quote comparison link: base64url(payload).base64url(HMAC-SHA256). */
export class ShareToken {
  constructor(private readonly secret: string) {
    if (!secret) throw new Error('Share token secret is required');
  }

  issue(quoteRequestId: string, tenantId: string, now: Date, validityDays = SHARE_TOKEN_VALIDITY_DAYS): { token: string; expiresAt: Date } {
    const exp = Math.floor(now.getTime() / 1000) + validityDays * 86_400;
    const body = Buffer.from(JSON.stringify({ quoteRequestId, tenantId, exp } satisfies SharePayload)).toString('base64url');
    return { token: `${body}.${this.sign(body)}`, expiresAt: new Date(exp * 1000) };
  }

  /** Verifies signature (timing-safe), expiry and that the token's tenant matches the verified host tenant. */
  verify(token: string, hostTenantId: string, now: Date): { ok: true; payload: SharePayload } | { ok: false; reason: ShareTokenRejection } {
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
    const [body, signature] = parts;
    const expected = Buffer.from(this.sign(body));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: 'bad_signature' };
    const payload = parse(body);
    if (!payload) return { ok: false, reason: 'malformed' };
    if (payload.exp * 1000 <= now.getTime()) return { ok: false, reason: 'expired' };
    if (payload.tenantId !== hostTenantId) return { ok: false, reason: 'tenant_mismatch' };
    return { ok: true, payload };
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}

function parse(body: string): SharePayload | undefined {
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<SharePayload>;
    if (typeof p.quoteRequestId !== 'string' || typeof p.tenantId !== 'string' || typeof p.exp !== 'number') return undefined;
    return { quoteRequestId: p.quoteRequestId, tenantId: p.tenantId, exp: p.exp };
  } catch {
    return undefined;
  }
}
