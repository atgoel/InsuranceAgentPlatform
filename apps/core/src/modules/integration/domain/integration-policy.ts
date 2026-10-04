/** Shared implementation constants for the LLD's elapsed-time and byte boundaries. */
export const integrationPolicy = {
  payloadRetentionMs: 180 * 86400000,
  callRetentionMs: 90 * 86400000,
  submissionLeaseMs: 60000,
  reconciliationBatchSize: 100,
  callbackMaxBytes: 1048576,
} as const;
