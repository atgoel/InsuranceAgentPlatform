import { SystemClock } from '../domain/clock';
import {
  signHs256,
  HmacJwtVerifier,
  UnauthenticatedError,
} from './jwt';

describe('jwt (AC-M00-17)', () => {
  describe('HmacJwtVerifier', () => {
    const secret = 'test-secret-32-chars-minimum!!!1';
    const clock = new SystemClock();
    const verifier = new HmacJwtVerifier(secret, clock);

    it('accepts a valid HS256 token and returns the principal', async () => {
      const now = Math.floor(clock.now().getTime() / 1000);
      const token = signHs256(
        {
          sub: 'user_001',
          org: 'ten_acme',
          roles: ['crm.agent'],
          iat: now,
          exp: now + 3600,
        },
        secret,
      );

      const principal = await verifier.verify(token);
      expect(principal.userRef).toBe('user_001');
      expect(principal.tenantId).toBe('ten_acme');
      expect(principal.roles).toEqual(['crm.agent']);
    });

    it('rejects a tampered token with UnauthenticatedError', async () => {
      const now = Math.floor(clock.now().getTime() / 1000);
      const token = signHs256(
        {
          sub: 'user_001',
          org: 'ten_acme',
          roles: ['crm.agent'],
          iat: now,
          exp: now + 3600,
        },
        secret,
      );

      // Tamper with the signature
      const parts = token.split('.');
      const tamperedToken =
        parts[0] + '.' + parts[1] + '.' + 'invalidsignature123456789012';

      await expect(verifier.verify(tamperedToken)).rejects.toThrow(
        UnauthenticatedError,
      );
    });

    it('rejects an expired token', async () => {
      const now = Math.floor(clock.now().getTime() / 1000);
      const token = signHs256(
        {
          sub: 'user_001',
          org: 'ten_acme',
          roles: ['crm.agent'],
          iat: now - 7200,
          exp: now - 3600, // expired 1 hour ago
        },
        secret,
      );

      await expect(verifier.verify(token)).rejects.toThrow(
        UnauthenticatedError,
      );
    });

    it('rejects a token with missing sub claim', async () => {
      const now = Math.floor(clock.now().getTime() / 1000);
      const token = signHs256(
        {
          sub: '',
          org: 'ten_acme',
          roles: ['crm.agent'],
          iat: now,
          exp: now + 3600,
        },
        secret,
      );

      await expect(verifier.verify(token)).rejects.toThrow(
        UnauthenticatedError,
      );
    });

    it('rejects a token with missing org claim', async () => {
      const now = Math.floor(clock.now().getTime() / 1000);
      const token = signHs256(
        {
          sub: 'user_001',
          org: '',
          roles: ['crm.agent'],
          iat: now,
          exp: now + 3600,
        },
        secret,
      );

      await expect(verifier.verify(token)).rejects.toThrow(
        UnauthenticatedError,
      );
    });

    it('rejects a malformed token', async () => {
      const malformedToken = 'not.a.valid.jwt';

      await expect(verifier.verify(malformedToken)).rejects.toThrow(
        UnauthenticatedError,
      );
    });

    it('rejects a token with wrong algorithm', async () => {
      // Create a token with wrong algorithm header
      const payload = Buffer.from(
        JSON.stringify({
          sub: 'user_001',
          org: 'ten_acme',
          roles: ['crm.agent'],
          iat: 1000000000,
          exp: 1000003600,
        }),
      ).toString('base64url');
      const header = Buffer.from(
        JSON.stringify({
          alg: 'RS256', // Wrong algorithm
          typ: 'JWT',
        }),
      ).toString('base64url');
      const signature = 'invalidsignature123456789012';

      const token = `${header}.${payload}.${signature}`;

      await expect(verifier.verify(token)).rejects.toThrow(
        UnauthenticatedError,
      );
    });

    it('includes memberId and orgUnitId when present in token', async () => {
      const now = Math.floor(clock.now().getTime() / 1000);
      const token = signHs256(
        {
          sub: 'user_001',
          org: 'ten_acme',
          roles: ['crm.agent'],
          mid: 'mem_123',
          ou: 'unit_456',
          iat: now,
          exp: now + 3600,
        },
        secret,
      );

      const principal = await verifier.verify(token);
      expect(principal.memberId).toBe('mem_123');
      expect(principal.orgUnitId).toBe('unit_456');
    });

    it('sets realm to customers by default', async () => {
      const now = Math.floor(clock.now().getTime() / 1000);
      const token = signHs256(
        {
          sub: 'user_001',
          org: 'ten_acme',
          roles: ['crm.agent'],
          iat: now,
          exp: now + 3600,
        },
        secret,
      );

      const principal = await verifier.verify(token);
      expect(principal.realm).toBe('customers');
    });
  });
});
