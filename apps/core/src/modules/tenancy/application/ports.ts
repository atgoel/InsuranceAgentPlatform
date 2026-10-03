import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { TenantKind } from '../domain/tenant';
import { LineOfBusiness } from '../domain/tie-up';
import { TenantStatus } from '../domain/tenant';
import { Tenant } from '../domain/tenant';
import { DistributorEntity } from '../domain/distributor-entity';
import { TieUpSet } from '../domain/tie-up';
import { FeatureFlagSet } from '../domain/feature-flags';
import { BrandKit } from '../domain/brand-kit';
import { UsageCounter } from '../domain/usage';
import { SoloSignup } from '../domain/signup';
import { CrmMode } from '../domain/tenant';
import { Capability, UsageMetric } from '../domain/plan';
import { FeatureFlagKey } from '../domain/feature-flags';
import { PhoneNumber } from '../../../kernel/domain/phone-number';

export const TENANT_DIRECTORY = Symbol('TENANT_DIRECTORY');
export const TENANT_SETTINGS_REPOSITORY = Symbol('TENANT_SETTINGS_REPOSITORY');
export const PROVISIONING_STATE_REPOSITORY = Symbol('PROVISIONING_STATE_REPOSITORY');
export const SIGNUP_REPOSITORY = Symbol('SIGNUP_REPOSITORY');
export const IDENTITY_PROVISIONER = Symbol('IDENTITY_PROVISIONER');
export const CRM_PROVISIONER = Symbol('CRM_PROVISIONER');
export const CONTENT_PROVISIONER = Symbol('CONTENT_PROVISIONER');
export const OTP_SENDER = Symbol('OTP_SENDER');
export const OTP_GENERATOR = Symbol('OTP_GENERATOR');
export const PLAN_CATALOGUE = Symbol('PLAN_CATALOGUE');
export const TIE_UP_LIMIT_POLICY = Symbol('TIE_UP_LIMIT_POLICY');
export const TIE_UP_READER = Symbol('TIE_UP_READER');
export const ENTITLEMENT_CHECKER = Symbol('ENTITLEMENT_CHECKER');
export const TENANCY_OPTIONS = Symbol('TENANCY_OPTIONS');
export const PROVISIONING_SAGA = Symbol('PROVISIONING_SAGA');

export interface TenantHostRecord {
  tenantId: string;
  host: string;
  kind: 'platform_subdomain' | 'custom';
  verificationToken?: string;
  verifiedAt?: string;
}

export interface TenantDirectory {
  findById(id: string): Promise<Tenant | undefined>;
  findBySlug(slug: string): Promise<Tenant | undefined>;
  findByHost(host: string): Promise<{ tenant: Tenant; host: TenantHostRecord } | undefined>;
  list(filter: { status?: TenantStatus; kind?: TenantKind; cursor?: string; limit: number }): Promise<{ items: Tenant[]; nextCursor?: string }>;
  save(tenant: Tenant): Promise<void>;
  addHost(record: TenantHostRecord): Promise<void>;
  listHosts(tenantId: string): Promise<TenantHostRecord[]>;
}

export interface TenantSettingsRepository {
  getEntity(tx: Transaction): Promise<DistributorEntity | undefined>;
  saveEntity(tx: Transaction, e: DistributorEntity): Promise<void>;
  getTieUps(tx: Transaction): Promise<TieUpSet>;
  replaceTieUps(tx: Transaction, set: TieUpSet): Promise<void>;
  getFlags(tx: Transaction): Promise<FeatureFlagSet>;
  saveFlags(tx: Transaction, flags: FeatureFlagSet): Promise<void>;
  getBrandKit(tx: Transaction): Promise<BrandKit | undefined>;
  saveBrandKit(tx: Transaction, kit: BrandKit): Promise<void>;
  getUsage(tx: Transaction, metric: UsageMetric, period: string): Promise<UsageCounter | undefined>;
  saveUsage(tx: Transaction, counter: UsageCounter): Promise<void>;
}

export interface ProvisioningStateRepository {
  completedSteps(tenantId: string): Promise<string[]>;
  markCompleted(tenantId: string, step: string): Promise<void>;
  markFailed(tenantId: string, step: string, error: string): Promise<void>;
}

export interface SignupRepository {
  get(id: string): Promise<SoloSignup | undefined>;
  save(s: SoloSignup): Promise<void>;
  /** Signups started for this phone since the given time (rate limiting). */
  countStartedSince(phoneE164: string, since: Date): Promise<number>;
}

export interface IdentityProvisioner {
  ensureOrganisation(tenantId: string, slug: string): Promise<void>;
  ensureAdmin(tenantId: string, admin: { name: string; phone?: string; email?: string }): Promise<string>;
}

export interface CrmProvisioner {
  ensureWorkspace(tenantId: string, mode: CrmMode): Promise<{ workspaceRef?: string }>;
}

export interface ContentProvisioner {
  ensureTenantScope(tenantId: string): Promise<void>;
}

export interface OtpSender {
  send(phone: PhoneNumber, otp: string): Promise<void>;
}

export interface OtpGenerator {
  generate(): string;
}

export interface TieUpReader {
  activeInsurers(tenantId: string, line: LineOfBusiness, date: string): Promise<string[]>;
}

export interface EntitlementChecker {
  hasCapability(tenantId: string, capability: Capability): Promise<boolean>;
  isFeatureEnabled(tenantId: string, key: FeatureFlagKey): Promise<boolean>;
  consume(tenantId: string, metric: UsageMetric, amount: number): Promise<void>;
  limitFor(tenantId: string, metric: UsageMetric): Promise<number | null>;
}

export interface TenancyOptions {
  platformDomain: string;
  otpPepper: string;
  cacheTtlMs: number;
}
