import { BufferedEntry } from './debug-buffer';
import { DependencyTiming } from './request-context';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type SampledReason = 'head' | 'tail' | 'forced' | 'always';
export type FlushReason = 'error' | 'slow' | 'forced';

export interface LogRecord {
  ts: string;
  level: LogLevel;
  event: string;
  msg: string;
  traceId?: string;
  spanId?: string;
  tenantId?: string;
  actor?: string;
  module?: string;
  channel?: 'app' | 'security';
  route?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  deps?: Record<string, DependencyTiming>;
  err?: {
    type: string;
    code?: string;
    message: string;
    stack?: string;
    fingerprint: string;
    suppressedSinceLast?: number;
  };
  ctx?: Record<string, unknown>;
  buffered?: BufferedEntry[];
  bufferDropped?: number;
  flushReason?: FlushReason;
  sampled?: SampledReason;
}
