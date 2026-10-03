import { randomBytes } from 'crypto';

export interface TraceParent {
  traceId: string;
  parentSpanId: string;
  sampled: boolean;
}

export function parseTraceparent(header: string | undefined): TraceParent | undefined {
  if (!header) return undefined;

  const parts = header.split('-');
  if (parts.length !== 4) return undefined;

  const [version, traceId, parentSpanId, tracedFlag] = parts;

  // Version must be 00
  if (version !== '00') return undefined;

  // TraceId must be 32 hex chars and not all zeros
  if (!/^[0-9a-f]{32}$/.test(traceId) || traceId === '00000000000000000000000000000000') {
    return undefined;
  }

  // SpanId must be 16 hex chars and not all zeros
  if (!/^[0-9a-f]{16}$/.test(parentSpanId) || parentSpanId === '0000000000000000') {
    return undefined;
  }

  // TraceFlag must be 0 or 1
  if (tracedFlag !== '00' && tracedFlag !== '01') {
    return undefined;
  }

  return {
    traceId,
    parentSpanId,
    sampled: tracedFlag === '01',
  };
}

export function newTraceId(): string {
  return randomBytes(16).toString('hex');
}

export function newSpanId(): string {
  return randomBytes(8).toString('hex');
}

export function formatTraceparent(
  traceId: string,
  spanId: string,
  sampled?: boolean
): string {
  const flag = sampled === true ? '01' : '00';
  return `00-${traceId}-${spanId}-${flag}`;
}
