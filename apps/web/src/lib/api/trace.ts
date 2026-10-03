// W3C Traceparent generation for client-side tracing
// Format: 00-<traceId>-<spanId>-<flags>

export interface TraceParent {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

/**
 * Generate a new trace ID (32 lowercase hex characters)
 */
export function newTraceId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a new span ID (16 lowercase hex characters)
 */
export function newSpanId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Format traceparent header value
 * Format: 00-<traceId>-<spanId>-<flags>
 */
export function formatTraceparent(traceId: string, spanId: string, sampled = true): string {
  const flags = sampled ? '01' : '00';
  return `00-${traceId}-${spanId}-${flags}`;
}

/**
 * Parse traceparent header
 */
export function parseTraceparent(header: string | undefined): TraceParent | undefined {
  if (!header) return undefined;

  const parts = header.split('-');
  if (parts.length !== 4) return undefined;

  const [version, traceId, spanId, flags] = parts;
  if (version !== '00') return undefined;
  if (traceId.length !== 32 || spanId.length !== 16 || flags.length !== 2) return undefined;
  if (traceId === '0'.repeat(32) || spanId === '0'.repeat(16)) return undefined;

  return {
    traceId,
    spanId,
    sampled: flags === '01',
  };
}
