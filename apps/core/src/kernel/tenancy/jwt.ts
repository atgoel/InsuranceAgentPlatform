import { createHmac } from 'crypto';
import { UnauthenticatedError } from '../errors/domain-errors';
import { Clock } from '../domain/clock';

export { UnauthenticatedError };

export interface JwtClaims {
  sub: string;
  org: string;
  roles: string[];
  mid?: string;
  ou?: string;
  realm?: 'customers' | 'workforce';
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
}

export interface Principal {
  userRef: string;
  tenantId: string;
  memberId?: string;
  orgUnitId?: string;
  roles: string[];
  realm: 'customers' | 'workforce';
}

/**
 * AC-M00-17 (tenancy): signHs256
 * Signs a JWT with HS256 using the provided secret.
 * Returns a compact JWS with header {alg:'HS256',typ:'JWT'}.
 */
export function signHs256(claims: JwtClaims, secret: string): string {
  const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
  const encodedHeader = Buffer.from(header).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const message = `${encodedHeader}.${encodedPayload}`;

  const signature = createHmac('sha256', secret)
    .update(message)
    .digest('base64url');

  return `${message}.${signature}`;
}

/**
 * AC-M00-17 (tenancy): HmacJwtVerifier
 * Verifies HS256 JWT tokens and returns the Principal.
 * Validates:
 * - Algorithm is HS256
 * - Signature is valid (timing-safe compare)
 * - Token is not expired
 * - Required claims (sub, org) are present and non-empty
 * - Issuer and audience if configured
 */
export interface TokenVerifier {
  verify(token: string): Promise<Principal>;
}

export class HmacJwtVerifier implements TokenVerifier {
  constructor(
    private readonly secret: string,
    private readonly clock: Clock,
    private readonly opts?: {
      issuer?: string;
      audience?: string;
      leewaySeconds?: number;
    },
  ) {}

  async verify(token: string): Promise<Principal> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid token format');

      const [encodedHeader, encodedPayload, signature] = parts;
      this.verifySignature(encodedHeader, encodedPayload, signature);

      const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString());
      if (header.alg !== 'HS256') throw new Error('Invalid algorithm');

      const claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as JwtClaims;
      this.validateClaims(claims);

      return this.principalFromClaims(claims);
    } catch {
      throw new UnauthenticatedError('invalid_token', 'Invalid or expired token');
    }
  }

  private verifySignature(encodedHeader: string, encodedPayload: string, signature: string): void {
    const message = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = createHmac('sha256', this.secret)
      .update(message)
      .digest('base64url');
    if (!this.timingSafeEqual(signature, expectedSignature)) {
      throw new Error('Invalid signature');
    }
  }

  private validateClaims(claims: JwtClaims): void {
    this.validateRequiredClaims(claims);
    this.validateExpiration(claims);
    this.validateOptionalClaims(claims);
  }

  private validateRequiredClaims(claims: JwtClaims): void {
    if (!claims.sub || claims.sub === '') throw new Error('Missing or empty sub claim');
    if (!claims.org || claims.org === '') throw new Error('Missing or empty org claim');
  }

  private validateExpiration(claims: JwtClaims): void {
    const now = Math.floor(this.clock.now().getTime() / 1000);
    const leewaySeconds = this.opts?.leewaySeconds ?? 30;
    if (claims.exp < now - leewaySeconds) throw new Error('Token expired');
  }

  private validateOptionalClaims(claims: JwtClaims): void {
    if (this.opts?.issuer && claims.iss && claims.iss !== this.opts.issuer) {
      throw new Error('Invalid issuer');
    }
    if (this.opts?.audience && claims.aud && claims.aud !== this.opts.audience) {
      throw new Error('Invalid audience');
    }
  }

  private principalFromClaims(claims: JwtClaims): Principal {
    return {
      userRef: claims.sub,
      tenantId: claims.org,
      memberId: claims.mid,
      orgUnitId: claims.ou,
      roles: claims.roles || [],
      realm: claims.realm || 'customers',
    };
  }

  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}
