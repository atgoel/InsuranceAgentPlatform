import { Principal } from './principal';
import { TokenVerifier, UnauthenticatedError } from './jwt';

/** AC-M00-33: reads the JWS header alg and delegates; an alg with no verifier is rejected. */
export class CompositeTokenVerifier implements TokenVerifier {
  constructor(private readonly byAlg: { HS256?: TokenVerifier; RS256?: TokenVerifier }) {}

  async verify(token: string): Promise<Principal> {
    const verifier = this.verifierFor(token);
    if (!verifier) throw new UnauthenticatedError('invalid_token', 'Invalid or expired token');
    return verifier.verify(token);
  }

  private verifierFor(token: string): TokenVerifier | undefined {
    try {
      const encodedHeader = token.split('.')[0];
      const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString()) as { alg?: string };
      if (header.alg === 'HS256') return this.byAlg.HS256;
      if (header.alg === 'RS256') return this.byAlg.RS256;
      return undefined;
    } catch {
      return undefined;
    }
  }
}
