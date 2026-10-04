import { generateKeyPairSync, JsonWebKey, KeyObject, sign } from 'crypto';
import { FixedClock } from '../domain/clock';
import { HmacJwtVerifier, signHs256 } from './jwt';
import { JwksTokenVerifier } from './jwks-token-verifier';
import { CompositeTokenVerifier } from './composite-token-verifier';

const NOW = new Date('2026-06-01T10:00:00.000Z');
const nowSec = Math.floor(NOW.getTime() / 1000);
const ISS = 'https://kc.example/realms/iap';
const AUD = 'iap-api';
const SECRET = 'test-secret-32-chars-minimum!!!1';

function newKey(kid: string): { privateKey: KeyObject; jwk: JsonWebKey } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' } };
}

function b64(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function rs256(privateKey: KeyObject, claims: object, header: object = { alg: 'RS256', kid: 'k1' }): string {
  const message = `${b64(header)}.${b64(claims)}`;
  return `${message}.${sign('RSA-SHA256', Buffer.from(message), privateKey).toString('base64url')}`;
}

function baseClaims(extra: object = {}): object {
  return { sub: 'u1', org: 'ten_a', roles: ['crm.agent'], iat: nowSec, exp: nowSec + 600, iss: ISS, aud: AUD, ...extra };
}

describe('JwksTokenVerifier (AC-M00-33)', () => {
  const k1 = newKey('k1');
  const other = newKey('k1');
  let clock: FixedClock;
  let fetchCount: number;
  let keys: JsonWebKey[];
  let verifier: JwksTokenVerifier;

  beforeEach(() => {
    clock = new FixedClock(NOW);
    fetchCount = 0;
    keys = [k1.jwk];
    verifier = new JwksTokenVerifier('https://kc.example/certs', clock, {
      issuer: ISS,
      audience: AUD,
      fetchJwks: async () => {
        fetchCount += 1;
        return { keys };
      },
    });
  });

  it('AC-M00-33 accepts a valid RS256 token and maps sub, org, roles, mid, ou, amr, realm', async () => {
    const token = rs256(k1.privateKey, baseClaims({ mid: 'mem_1', ou: 'ou_1', amr: ['pwd', 'otp'], realm: 'workforce' }));
    const principal = await verifier.verify(token);
    expect(principal).toEqual({
      userRef: 'u1',
      tenantId: 'ten_a',
      memberId: 'mem_1',
      orgUnitId: 'ou_1',
      roles: ['crm.agent'],
      realm: 'workforce',
      amr: ['pwd', 'otp'],
    });
  });

  it('AC-M00-33 rejects a token signed by a different key with the same kid', async () => {
    const token = rs256(other.privateKey, baseClaims());
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('AC-M00-33 rejects an unknown kid after one refetch and does not refetch again within 60 s', async () => {
    const token = rs256(k1.privateKey, baseClaims(), { alg: 'RS256', kid: 'nope' });
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'invalid_token' });
    expect(fetchCount).toBe(1);
    clock.advance(59_000);
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'invalid_token' });
    expect(fetchCount).toBe(1);
    clock.advance(2_000);
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'invalid_token' });
    expect(fetchCount).toBe(2);
  });

  it('AC-M00-33 picks up a rotated key on an unknown kid', async () => {
    const k2 = newKey('k2');
    await verifier.verify(rs256(k1.privateKey, baseClaims()));
    keys = [k1.jwk, k2.jwk];
    clock.advance(61_000);
    const token = rs256(k2.privateKey, baseClaims({ exp: nowSec + 700 }), { alg: 'RS256', kid: 'k2' });
    const principal = await verifier.verify(token);
    expect(principal.userRef).toBe('u1');
    expect(fetchCount).toBe(2);
  });

  it('AC-M00-33 rejects an expired token beyond leeway', async () => {
    const token = rs256(k1.privateKey, baseClaims({ exp: nowSec - 31 }));
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('AC-M00-33 rejects a wrong issuer', async () => {
    const token = rs256(k1.privateKey, baseClaims({ iss: 'https://evil.example' }));
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('AC-M00-33 rejects a wrong string audience', async () => {
    const token = rs256(k1.privateKey, baseClaims({ aud: 'other' }));
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('AC-M00-33 rejects an array audience that does not contain the configured one', async () => {
    const token = rs256(k1.privateKey, baseClaims({ aud: ['a', 'b'] }));
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('AC-M00-33 accepts an array audience that contains the configured one', async () => {
    const token = rs256(k1.privateKey, baseClaims({ aud: ['account', AUD] }));
    const principal = await verifier.verify(token);
    expect(principal.tenantId).toBe('ten_a');
  });

  it('AC-M00-33 rejects a wrong alg', async () => {
    const token = rs256(k1.privateKey, baseClaims(), { alg: 'none', kid: 'k1' });
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('AC-M00-33 rejects a missing kid', async () => {
    const token = rs256(k1.privateKey, baseClaims(), { alg: 'RS256' });
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('AC-M00-33 rejects a malformed token', async () => {
    await expect(verifier.verify('not-a-jwt')).rejects.toMatchObject({ code: 'invalid_token' });
  });

  describe('CompositeTokenVerifier', () => {
    const hmac = (): HmacJwtVerifier => new HmacJwtVerifier(SECRET, new FixedClock(NOW));
    const hsToken = (): string => signHs256({ sub: 'h1', org: 'ten_h', roles: [], iat: nowSec, exp: nowSec + 600 }, SECRET);

    it('AC-M00-33 routes HS256 to the HMAC verifier and RS256 to the JWKS verifier', async () => {
      const composite = new CompositeTokenVerifier({ HS256: hmac(), RS256: verifier });
      const hs = await composite.verify(hsToken());
      const rs = await composite.verify(rs256(k1.privateKey, baseClaims()));
      expect(hs.userRef).toBe('h1');
      expect(rs.userRef).toBe('u1');
    });

    it('AC-M00-33 rejects none and ES256 headers', async () => {
      const composite = new CompositeTokenVerifier({ HS256: hmac(), RS256: verifier });
      for (const alg of ['none', 'ES256']) {
        const token = `${b64({ alg, typ: 'JWT' })}.${b64(baseClaims())}.sig`;
        await expect(composite.verify(token)).rejects.toMatchObject({ code: 'invalid_token' });
      }
    });

    it('AC-M00-33 rejects RS256 when no JWKS verifier is configured', async () => {
      const composite = new CompositeTokenVerifier({ HS256: hmac() });
      await expect(composite.verify(rs256(k1.privateKey, baseClaims()))).rejects.toMatchObject({ code: 'invalid_token' });
    });

    it('AC-M00-33 rejects a malformed token', async () => {
      const composite = new CompositeTokenVerifier({ HS256: hmac() });
      await expect(composite.verify('%%%')).rejects.toMatchObject({ code: 'invalid_token' });
    });
  });
});
