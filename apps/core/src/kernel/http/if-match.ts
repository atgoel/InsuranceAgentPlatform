import { PreconditionFailedError, ValidationError } from '../errors/domain-errors';

/** ETag for optimistic concurrency (04-api: `ETag: "v<version>"`, `If-Match` required on PATCH). */
export function etagFor(version: number): string {
  return `"v${version}"`;
}

/** Parses `If-Match: "v<n>"` (quotes optional). Missing → 400; malformed → 412. */
export function parseIfMatch(header: string | undefined): number {
  if (!header) throw new ValidationError('if_match_required', 'An If-Match header with the resource version is required');
  const match = /^"?v(\d+)"?$/.exec(header.trim());
  if (!match) throw new PreconditionFailedError('version_mismatch', 'If-Match does not name a known version');
  return Number(match[1]);
}
