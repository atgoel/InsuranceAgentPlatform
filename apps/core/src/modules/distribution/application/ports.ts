import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { OrgTree, OrgUnit } from '../domain/org-unit';
import { Member, MemberStatus, SalespersonType } from '../domain/member';
import { OnboardingChecklist } from '../domain/onboarding';
import { Licence } from '../domain/licence';
import { RecordScope, RoleCatalogue, RoleDefinition } from '../domain/roles';
import { Principal } from '../../../kernel/tenancy/principal';
import { SellingScope } from '../domain/selling-scope';

export const ORG_UNIT_REPOSITORY = Symbol('OrgUnitRepository');
export const MEMBER_REPOSITORY = Symbol('MemberRepository');
export const CHECKLIST_REPOSITORY = Symbol('ChecklistRepository');
export const LICENCE_REPOSITORY = Symbol('LicenceRepository');
export const INSURER_CODE_REPOSITORY = Symbol('InsurerCodeRepository');
export const LEAVE_REPOSITORY = Symbol('LeaveRepository');
export const ROLE_REPOSITORY = Symbol('RoleRepository');
export const IDENTITY_ADMIN = Symbol('IdentityAdmin');
export const SELLER_DIRECTORY = Symbol('SellerDirectory');
export const RECORD_SCOPE_PROVIDER = Symbol('RecordScopeProvider');

/** Well-known id of every tenant's HEAD_OFFICE root (M02 §3.1). */
export const ROOT_ORG_UNIT_ID = 'ou_root';

export interface OrgUnitRepository {
  tree(tx: Transaction): Promise<OrgTree>;
  save(tx: Transaction, unit: OrgUnit): Promise<void>;
  saveAll(tx: Transaction, units: OrgUnit[]): Promise<void>;
}

export interface MemberFilter {
  status?: MemberStatus;
  role?: string;
  orgUnitIds?: string[];
  memberId?: string;
  salespersonType?: SalespersonType;
  q?: string;
  cursor?: string;
  limit: number;
}

export interface MemberRepository {
  get(tx: Transaction, id: string): Promise<Member | undefined>;
  findByContactHash(tx: Transaction, hash: string): Promise<Member | undefined>;
  findByUserRef(tx: Transaction, userRef: string): Promise<Member | undefined>;
  list(tx: Transaction, filter: MemberFilter): Promise<{ items: Member[]; nextCursor?: string }>;
  countSeats(tx: Transaction): Promise<number>;
  countByOrgUnit(tx: Transaction): Promise<Record<string, number>>;
  save(tx: Transaction, member: Member): Promise<void>;
}

export interface ChecklistRepository {
  get(tx: Transaction, memberId: string): Promise<OnboardingChecklist | undefined>;
  save(tx: Transaction, memberId: string, checklist: OnboardingChecklist): Promise<void>;
}

export interface LicenceRepository {
  listForMember(tx: Transaction, memberId: string): Promise<Licence[]>;
  save(tx: Transaction, licence: Licence): Promise<void>;
  all(tx: Transaction): Promise<Licence[]>;
  alertedThresholds(tx: Transaction, licenceId: string): Promise<number[]>;
  recordAlert(tx: Transaction, licenceId: string, threshold: number): Promise<void>;
}

export interface InsurerCodeRepository {
  list(tx: Transaction, memberId: string): Promise<Array<{ insurerId: string; code: string }>>;
  /** Duplicate code for the same insurer within the tenant → ConflictError('insurer_code_taken'). */
  put(tx: Transaction, memberId: string, insurerId: string, code: string): Promise<void>;
}

export interface LeaveRepository {
  isOnLeave(tx: Transaction, memberId: string, at: Date): Promise<boolean>;
  add(tx: Transaction, memberId: string, from: string, to: string): Promise<void>;
}

export interface RoleRepository {
  catalogue(tx: Transaction): Promise<RoleCatalogue>;
  save(tx: Transaction, def: RoleDefinition): Promise<void>;
}

/** Keycloak admin operations (HLD K7). */
export interface IdentityAdmin {
  invite(tenantId: string, member: { memberId: string; contact: { phone?: string; email?: string }; roles: string[] }): Promise<void>;
  updateRoles(tenantId: string, userRef: string, roles: string[]): Promise<void>;
  revokeSessions(tenantId: string, userRef: string): Promise<void>;
  disable(tenantId: string, userRef: string): Promise<void>;
}

export interface EligibleSeller {
  memberId: string;
  displayName: string;
  orgUnitId: string;
  salespersonType: SalespersonType;
  capacityPerDay: number;
  skills: string[];
  languages: string[];
  /** Pincode prefixes of the seller's org unit (routing territory). */
  territoryCodes: string[];
}

export interface SellerCriteria {
  orgUnitIds?: string[];
  /** Sellers in this unit or any unit below it (a routing pool). */
  withinOrgUnitId?: string;
  line?: 'LIFE' | 'HEALTH' | 'GENERAL';
  posEligibleProduct?: boolean;
  language?: string;
  at: Date;
}

/** Published for M04 routing and M05 comparison scope. */
export interface SellerDirectory {
  eligibleSellers(tx: Transaction, criteria: SellerCriteria): Promise<EligibleSeller[]>;
  sellingScope(tx: Transaction, memberId: string, at: Date): Promise<SellingScope | undefined>;
  /** Display names for owner columns (any status). */
  displayNames(tx: Transaction, memberIds: readonly string[]): Promise<Record<string, string>>;
}

export type { RecordScope };

/** Published for M03+: which records a principal may see (implemented by RecordScopeResolver). */
export interface RecordScopeProvider {
  resolve(tx: Transaction, principal: Principal): Promise<RecordScope>;
}
