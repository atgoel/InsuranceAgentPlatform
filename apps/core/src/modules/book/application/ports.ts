import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { RecordScope } from '../../distribution/application/ports';
import { HeldPolicy, HeldPolicyProps } from '../domain/held-policy';
import { ImportBatch } from '../domain/book-import';
import { ServicingRequest } from '../domain/servicing';
export type { Transaction, RecordScope };
export interface HeldPolicyFilter {
  scope: RecordScope;
  partyId?: string;
  line?: string;
  status?: string;
  q?: string;
  category?: string;
  businessType?: string;
  businessSource?: string;
  bookedFrom?: string;
  bookedTo?: string;
  referredBy?: string;
  custom?: Record<string, string>;
  cursor?: string;
  limit: number;
}
export interface HeldPolicyRepository {
  get(tx: Transaction, id: string): Promise<HeldPolicy | undefined>;
  save(tx: Transaction, policy: HeldPolicy): Promise<void>;
  findByNumberHash(tx: Transaction, hash: string): Promise<HeldPolicy | undefined>;
  findBySaleRef(tx: Transaction, id: string): Promise<HeldPolicy | undefined>;
  list(
    tx: Transaction,
    filter: HeldPolicyFilter,
  ): Promise<{
    items: HeldPolicy[];
    nextCursor?: string;
  }>;
  forParty(tx: Transaction, partyId: string): Promise<HeldPolicy[]>;
  all(tx: Transaction): Promise<HeldPolicy[]>;
  dueBetween(tx: Transaction, from: string, to: string, scope: RecordScope): Promise<HeldPolicy[]>;
  renewalsBetween(tx: Transaction, from: string, to: string): Promise<HeldPolicy[]>;
  recordPayment(
    tx: Transaction,
    input: {
      policyId: string;
      installmentDue: string;
      paidOn: string;
      id: string;
    },
  ): Promise<boolean>;
  paymentRecorded(tx: Transaction, policyId: string, installmentDue: string): Promise<boolean>;
}
export interface ImportBatchRepository {
  get(tx: Transaction, id: string): Promise<ImportBatch | undefined>;
  save(tx: Transaction, batch: ImportBatch): Promise<void>;
  findByChecksum(tx: Transaction, checksum: string): Promise<ImportBatch | undefined>;
}
export interface ServicingRepository {
  get(tx: Transaction, id: string): Promise<ServicingRequest | undefined>;
  save(tx: Transaction, request: ServicingRequest): Promise<void>;
  forPolicy(tx: Transaction, policyId: string): Promise<ServicingRequest[]>;
  openFollowUpsBefore(tx: Transaction, date: string, memberId?: string): Promise<ServicingRequest[]>;
  all(tx: Transaction): Promise<ServicingRequest[]>;
}
export interface AlertLedger {
  emittedKeys(tx: Transaction, keys: string[]): Promise<Set<string>>;
  record(tx: Transaction, keys: string[]): Promise<void>;
}
export interface IssuedPolicySnapshot {
  insurerConfirmed: boolean;
  policySaleId: string;
  policyNumber: string;
  policy: Omit<
    HeldPolicyProps,
    'policyNumberEnc' | 'policyNumberHash' | 'policyNumberLast4' | 'createdAt' | 'updatedAt' | 'version' | 'source'
  >;
}
export interface IssuedPolicyReader {
  read(tx: Transaction, policySaleId: string): Promise<IssuedPolicySnapshot | undefined>;
}
export const HELD_POLICY_REPOSITORY = Symbol('HeldPolicyRepository');
export const IMPORT_BATCH_REPOSITORY = Symbol('ImportBatchRepository');
export const SERVICING_REPOSITORY = Symbol('ServicingRepository');
export const ALERT_LEDGER = Symbol('AlertLedger');
export const ISSUED_POLICY_READER = Symbol('IssuedPolicyReader');
/** M07 §4: id sets for the M03 customer segments (ADR-M03-customer-segments). */
export interface PartyBookSegmentReader {
  partyIdsWithDues(tx: Transaction, scope: RecordScope, today: string): Promise<string[]>;
  partyIdsWithAnyPolicy(tx: Transaction, scope: RecordScope): Promise<string[]>;
}
export const PARTY_BOOK_SEGMENT_READER = Symbol('PartyBookSegmentReader');
