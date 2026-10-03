import { signHs256, JwtClaims } from '../../src/kernel/tenancy/jwt';

const TEST_TOKEN_SECRET = 'test-secret-32-chars-minimum!!!1';

/**
 * AC-M00-* (test support)
 * tokenFor generates an HS256-signed JWT token for testing with the given tenant, roles, and claims.
 * Defaults: sub from userRef, expiresInSeconds 3600 (1 hour).
 */
export function tokenFor(
  input: {
    tenantId: string;
    roles?: string[];
    sub?: string;
    memberId?: string;
    orgUnitId?: string;
    realm?: 'customers' | 'workforce';
    amr?: string[];
    expiresInSeconds?: number;
  },
  secret: string = TEST_TOKEN_SECRET,
): string {
  const now = Math.floor(Date.now() / 1000);
  const expiresInSeconds = input.expiresInSeconds ?? 3600;

  const claims: JwtClaims = {
    sub: input.sub ?? 'user_001',
    org: input.tenantId,
    roles: input.roles ?? [],
    mid: input.memberId,
    ou: input.orgUnitId,
    realm: input.realm ?? 'customers',
    amr: input.amr ?? ['pwd', 'mfa'], // privileged roles need MFA (M02); pass amr: ['pwd'] to test the refusal
    iat: now,
    exp: now + expiresInSeconds,
  };

  return signHs256(claims, secret);
}

/**
 * AC-M00-* (test support)
 * operatorToken returns a token for a workforce realm operator with platform.operator role.
 */
export function operatorToken(secret: string = TEST_TOKEN_SECRET): string {
  return tokenFor(
    {
      tenantId: 'platform',
      roles: ['platform.operator'],
      realm: 'workforce',
      sub: 'operator_001',
    },
    secret,
  );
}
