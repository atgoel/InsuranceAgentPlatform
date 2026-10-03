import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { Party, PartyStatus } from '../domain/party';
import { ConsentChannel, ConsentLedger, ConsentPurpose, ConsentRecord } from '../domain/consent';
import { Suppression } from '../domain/suppression';
import { Household } from '../domain/household';
import { PartyRoleLink } from '../domain/party-role';
import { ContactabilityDecision } from '../domain/contactability';
import { MergeRecord } from '../domain/merge';
import { Channel } from '../domain/contact-point';
import { RecordScope } from '../../distribution/application/ports';

export type { Transaction, RecordScope };
/** Record scope comes from M02 (published port) — the same token, so DI resolves M02's resolver. */
export { RECORD_SCOPE_PROVIDER } from '../../distribution/application/ports';
export type { RecordScopeProvider } from '../../distribution/application/ports';

export type PreferredChannel = 'WHATSAPP' | 'SMS' | 'EMAIL' | 'CALL';

export interface FieldCipher {
  /** base64(iv | ciphertext | tag) */
  encrypt(tenantId: string, plaintext: string): Promise<string>;
  decrypt(tenantId: string, ciphertext: string): Promise<string>;
  /** HMAC-SHA256 with the tenant lookup key — equal within a tenant, different across tenants. */
  hash(tenantId: string, value: string): string;
}

export interface PartyListFilter {
  scope: RecordScope;
  tag?: string;
  ids?: string[];
  cursor?: string;
  limit: number;
}

export interface PartyRepository {
  get(tx: Transaction, id: string): Promise<Party | undefined>;
  /** Optimistic: the stored version must equal party.props.version; calls party.markSaved(). */
  save(tx: Transaction, p: Party): Promise<void>;
  /** ACTIVE parties only. */
  findByContactHash(tx: Transaction, hash: string): Promise<Party[]>;
  findByPanHash(tx: Transaction, hash: string): Promise<Party[]>;
  searchByName(tx: Transaction, normalisedPrefix: string, limit: number): Promise<Party[]>;
  list(tx: Transaction, filter: PartyListFilter): Promise<{ items: Party[]; nextCursor?: string }>;
}

export interface ConsentRepository {
  ledger(tx: Transaction, partyId: string): Promise<ConsentLedger>;
  append(tx: Transaction, r: ConsentRecord): Promise<void>;
}

export interface SuppressionRepository {
  activeFor(tx: Transaction, contactHash: string, at: Date): Promise<Suppression[]>;
  add(tx: Transaction, s: Suppression): Promise<void>;
}

export interface HouseholdRepository {
  forParty(tx: Transaction, partyId: string): Promise<Household | undefined>;
  get(tx: Transaction, id: string): Promise<Household | undefined>;
  save(tx: Transaction, h: Household): Promise<void>;
}

export interface RoleLinkRepository {
  forParty(tx: Transaction, partyId: string): Promise<PartyRoleLink[]>;
  add(tx: Transaction, l: PartyRoleLink): Promise<void>;
  /** Moves links (all, or only those whose roleLinkKey is listed) to another party; returns the moved keys. */
  repoint(tx: Transaction, fromPartyId: string, toPartyId: string, onlyKeys?: readonly string[]): Promise<string[]>;
}

export interface DuplicateCandidate {
  readonly id: string;
  /** Ordered pair: partyAId < partyBId. */
  readonly partyAId: string;
  readonly partyBId: string;
  readonly score: number;
  readonly rule: string;
  readonly explanation: string;
  readonly status: 'open' | 'merged' | 'dismissed';
  readonly createdAt: string;
}

export interface DuplicateRepository {
  /** Unique on the ordered pair; an existing open candidate keeps its id and takes the higher score. */
  upsertCandidate(tx: Transaction, c: DuplicateCandidate): Promise<void>;
  list(tx: Transaction, filter: { status: 'open'; partyId?: string; cursor?: string; limit: number }): Promise<{ items: DuplicateCandidate[]; nextCursor?: string }>;
  get(tx: Transaction, id: string): Promise<DuplicateCandidate | undefined>;
  setStatus(tx: Transaction, id: string, status: 'open' | 'merged' | 'dismissed'): Promise<void>;
  saveMerge(tx: Transaction, m: MergeRecord): Promise<void>;
  getMerge(tx: Transaction, id: string): Promise<MergeRecord | undefined>;
}

/** Provided by M07 (held policies); the default returns []. */
export interface PolicyNumberLookup {
  partyIdsForPolicyNumber(tx: Transaction, policyNumber: string): Promise<string[]>;
}

export interface ConsentInput {
  purpose: ConsentPurpose;
  channel: ConsentChannel;
  granted: boolean;
  noticeVersion: string;
  source: ConsentRecord['source'];
  evidenceRef?: string;
}

export interface CreatePartyInput {
  readonly kind: 'PERSON' | 'ORGANISATION';
  readonly displayName: string;
  readonly contacts: Array<{ channel: Channel; value: string; isPrimary?: boolean }>;
  readonly dateOfBirth?: string;
  readonly pan?: string;
  readonly preferredLanguage?: string;
  readonly preferredChannel?: PreferredChannel;
  readonly tags?: string[];
  readonly consent?: ConsentInput[];
  readonly source?: Party['props']['source'];
  readonly ownerMemberId?: string;
  readonly orgUnitId?: string;
}

export interface PartySummary {
  readonly id: string;
  readonly displayName: string;
  readonly primaryMobileMasked?: string;
  readonly primaryEmailMasked?: string;
  readonly preferredLanguage: string;
  readonly preferredChannel?: string;
  readonly status: PartyStatus;
  readonly ownerMemberId?: string;
}

export interface DuplicateCandidateView {
  readonly id: string;
  readonly partyAId: string;
  readonly partyBId: string;
  readonly score: number;
  readonly rule: string;
  readonly explanation: string;
}

/** Published facade for other modules (Facade pattern) — the only way M04+ touch parties. */
export interface PartyFacade {
  /** 'link' → an existing party with a candidate score ≥ 90 is returned (created false); else create and queue candidates ≥ 60. */
  findOrCreate(tx: Transaction, input: CreatePartyInput & { onDuplicate: 'link' | 'create' }): Promise<{ partyId: string; created: boolean; candidates: DuplicateCandidateView[] }>;
  linkRole(tx: Transaction, link: Omit<PartyRoleLink, 'createdAt'>): Promise<void>;
  contactability(tx: Transaction, partyId: string, channel: Exclude<ConsentChannel, 'ANY'>, purpose: ConsentPurpose, at: Date): Promise<ContactabilityDecision>;
  recordConsent(tx: Transaction, input: Omit<ConsentRecord, 'id' | 'occurredAt'>): Promise<ConsentRecord>;
  summary(tx: Transaction, partyId: string): Promise<PartySummary | undefined>;
  absorb(tx: Transaction, fromPartyId: string, intoPartyId: string): Promise<{ mergeId: string }>;
  candidatesFor(tx: Transaction, partyId: string): Promise<DuplicateCandidateView[]>;
}

export const PARTY_REPOSITORY = Symbol('PartyRepository');
export const CONSENT_REPOSITORY = Symbol('ConsentRepository');
export const SUPPRESSION_REPOSITORY = Symbol('SuppressionRepository');
export const HOUSEHOLD_REPOSITORY = Symbol('HouseholdRepository');
export const ROLE_LINK_REPOSITORY = Symbol('RoleLinkRepository');
export const DUPLICATE_REPOSITORY = Symbol('DuplicateRepository');
export const FIELD_CIPHER = Symbol('FieldCipher');
export const POLICY_NUMBER_LOOKUP = Symbol('PolicyNumberLookup');
export const PARTY_FACADE = Symbol('PartyFacade');
