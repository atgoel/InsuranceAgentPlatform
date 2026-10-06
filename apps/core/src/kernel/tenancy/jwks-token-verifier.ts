import { createPublicKey, JsonWebKey, KeyObject, verify } from 'crypto';
import { Clock } from '../domain/clock';
import { Principal } from './principal';
import { JwtClaims, TokenVerifier, UnauthenticatedError, principalFromClaims, validateClaims } from './jwt';

export type FetchJwks = (url: string) => Promise<{ keys: JsonWebKey[] }>;

export interface JwksVerifierOptions {
  issuer?: string;
  audience?: string;
  leewaySeconds?: number;
  fetchJwks?: FetchJwks;
}

const REFETCH_INTERVAL_MS = 60_000;

async function defaultFetchJwks(url: string): Promise<{ keys: JsonWebKey[] }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  return (await res.json()) as { keys: JsonWebKey[] };
}

interface JwsHeader {
  alg?: string;
  kid?: string;
}

/**
 * AC-M00-33: verifies RS256 tokens (Keycloak) against a JWKS endpoint using node:crypto only.
 * Keys are cached by kid; an unknown kid triggers a refetch at most once per 60 s.
 */
export class JwksTokenVerifier implements TokenVerifier {
  private keys = new Map<string, KeyObject>();
  private lastFetchAt: number | undefined;
  private inflight: Promise<void> | undefined;

  constructor(
    private readonly jwksUrl: string,
    private readonly clock: Clock,
    private readonly opts: JwksVerifierOptions = {},
  ) {}

  async verify(token: string): Promise<Principal> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid token format');
      const [encodedHeader, encodedPayload, signature] = parts;
      const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString()) as JwsHeader;
      if (header.alg !== 'RS256') throw new Error('Invalid algorithm');
      if (!header.kid) throw new Error('Missing kid');
      const key = await this.keyFor(header.kid);
      const message = Buffer.from(`${encodedHeader}.${encodedPayload}`);
      if (!verify('RSA-SHA256', message, key, Buffer.from(signature, 'base64url'))) {
        throw new Error('Invalid signature');
      }
      const claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as JwtClaims;
      validateClaims(claims, this.clock, this.opts);
      return principalFromClaims(claims);
    } catch {
      throw new UnauthenticatedError('invalid_token', 'Invalid or expired token');
    }
  }

  private async keyFor(kid: string): Promise<KeyObject> {
    const cached = this.keys.get(kid);
    if (cached) return cached;
    await this.refetchIfAllowed();
    const key = this.keys.get(kid);
    if (!key) throw new Error('Unknown kid');
    return key;
  }

  private async refetchIfAllowed(): Promise<void> {
    if (this.inflight) {
      await this.inflight;
      return;
    }
    const now = this.clock.now().getTime();
    if (this.lastFetchAt !== undefined && now - this.lastFetchAt < REFETCH_INTERVAL_MS) return;
    this.inflight = this.fetchAndStore(now).finally(() => {
      this.inflight = undefined;
    });
    await this.inflight;
  }

  private async fetchAndStore(startedAt: number): Promise<void> {
    const fetchJwks = this.opts.fetchJwks ?? defaultFetchJwks;
    const jwks = await fetchJwks(this.jwksUrl);
    const next = new Map<string, KeyObject>();
    for (const jwk of jwks.keys) {
      if (jwk.kty === 'RSA' && typeof jwk.kid === 'string') {
        next.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
      }
    }
    this.keys = next;
    this.lastFetchAt = startedAt;
  }
}
