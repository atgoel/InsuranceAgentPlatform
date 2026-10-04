export type CallOutcome<T = unknown> = {
  kind: 'success';
  value: T;
} | {
  kind: 'failure';
  retryable: boolean;
  code: string;
  message: string;
} | {
  kind: 'unknown';
  reason: 'timeout' | 'connection_reset' | 'assisted';
};
