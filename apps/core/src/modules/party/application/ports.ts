import { Party } from '../domain/party';
import { ConsentRecord, ConsentLedger } from '../domain/consent';
import { Suppression } from '../domain/suppression';
import { Household } from '../domain/household';
import { PartyRoleLink } from '../domain/party-role';
import { ContactabilityDecision, ConsentPurpose } from '../domain/contactability';
import { MergeRecord } from '../domain/merge';

export interface FieldCipher {
  encrypt(tenantId: string, plaintext: string): Promise<string>;
  decrypt(tenantId: string, ciphertext: string): Promise<string>;
  hash(tenantId: string, value: string): string;
}

export interface Transaction {
  readonly tenantId: string;
}

export type RecordScope = { kind: 'PERSONAL' | 'TEAM' | 'BRANCH' | 'ORGANISATION' };

export interface PartyRepository {
  get(tx: Transaction, id: string): Promise<Party | undefined>;
  save(tx: Transaction, p: Party): Promise<void>;
  findByContactHash(tx: Transaction, hash: string): Promise<Party[]>;
  findByPanHash(tx: Transaction, hash: string): Promise<Party[]>;
  searchByName(tx: Transaction, prefix: string, limit: number): Promise<Party[]>;
  list(
    tx: Transaction,
    filter: { scope: RecordScope; tag?: string; householdId?: string; cursor?: string; limit: number }
  ): Promise<{ items: Party[]; nextCursor?: string }>;
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
  repoint(tx: Transaction, fromPartyId: string, toPartyId: string): Promise<number>;
}

export interface DuplicateCandidate {
  readonly id: string;
  readonly partyAId: string;
  readonly partyBId: string;
  readonly score: number;
  readonly rule: string;
  readonly explanation: string;
  readonly status: 'open' | 'merged' | 'dismissed';
  readonly createdAt: string;
}

export interface DuplicateRepository {
  upsertCandidate(tx: Transaction, c: DuplicateCandidate): Promise<void>;
  list(
    tx: Transaction,
    filter: { status: 'open'; cursor?: string; limit: number }
  ): Promise<{ items: DuplicateCandidate[]; nextCursor?: string }>;
  get(tx: Transaction, id: string): Promise<DuplicateCandidate | undefined>;
  setStatus(tx: Transaction, id: string, status: 'merged' | 'dismissed'): Promise<void>;
  saveMerge(tx: Transaction, m: MergeRecord): Promise<void>;
  getMerge(tx: Transaction, id: string): Promise<MergeRecord | undefined>;
}

export interface PolicyNumberLookup {
  partyIdsForPolicyNumber(tx: Transaction, policyNumber: string): Promise<string[]>;
}

export interface Principal {
  readonly id: string;
  readonly role: string;
}

export interface RecordScopeProvider {
  resolve(tx: Transaction, principal: Principal): Promise<RecordScope>;
}

export interface CreatePartyInput {
  readonly kind: 'PERSON' | 'ORGANISATION';
  readonly displayName: string;
  readonly contacts: Array<{ channel: 'MOBILE' | 'EMAIL'; value: string; isPrimary?: boolean }>;
  readonly dateOfBirth?: string;
  readonly pan?: string;
  readonly preferredLanguage?: string;
  readonly preferredChannel?: string;
  readonly tags?: string[];
  readonly consent?: Array<{
    purpose: ConsentPurpose;
    channel: 'WHATSAPP' | 'SMS' | 'EMAIL' | 'CALL' | 'ANY';
    granted: boolean;
    noticeVersion: string;
    source: 'WEB_FORM' | 'ASSISTED' | 'IMPORT' | 'CUSTOMER_LINK' | 'SIGNUP';
    evidenceRef?: string;
  }>;
}

export interface PartySummary {
  readonly id: string;
  readonly displayName: string;
  readonly primaryMobileMasked?: string;
  readonly primaryEmailMasked?: string;
  readonly preferredLanguage: string;
  readonly preferredChannel?: string;
  readonly status: 'ACTIVE' | 'MERGED' | 'ERASED';
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

export interface PartyFacade {
  findOrCreate(
    tx: Transaction,
    input: CreatePartyInput & { onDuplicate: 'link' | 'create' }
  ): Promise<{ partyId: string; created: boolean; candidates: DuplicateCandidateView[] }>;
  linkRole(tx: Transaction, link: Omit<PartyRoleLink, 'createdAt'>): Promise<void>;
  contactability(
    tx: Transaction,
    partyId: string,
    channel: Exclude<ConsentPurpose, 'ANY'>,
    purpose: ConsentPurpose,
    at: Date
  ): Promise<ContactabilityDecision>;
  recordConsent(tx: Transaction, input: Omit<ConsentRecord, 'id' | 'occurredAt'>): Promise<ConsentRecord>;
  summary(tx: Transaction, partyId: string): Promise<PartySummary | undefined>;
  absorb(tx: Transaction, fromPartyId: string, intoPartyId: string): Promise<{ mergeId: string }>;
  candidatesFor(tx: Transaction, partyId: string): Promise<DuplicateCandidateView[]>;
}

export const PARTY_REPOSITORY = Symbol('PARTY_REPOSITORY');
export const CONSENT_REPOSITORY = Symbol('CONSENT_REPOSITORY');
export const SUPPRESSION_REPOSITORY = Symbol('SUPPRESSION_REPOSITORY');
export const HOUSEHOLD_REPOSITORY = Symbol('HOUSEHOLD_REPOSITORY');
export const ROLE_LINK_REPOSITORY = Symbol('ROLE_LINK_REPOSITORY');
export const DUPLICATE_REPOSITORY = Symbol('DUPLICATE_REPOSITORY');
export const FIELD_CIPHER = Symbol('FIELD_CIPHER');
export const POLICY_NUMBER_LOOKUP = Symbol('POLICY_NUMBER_LOOKUP');
export const RECORD_SCOPE_PROVIDER = Symbol('RECORD_SCOPE_PROVIDER');
export const PARTY_FACADE = Symbol('PARTY_FACADE');
