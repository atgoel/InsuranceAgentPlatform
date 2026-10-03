import { ApiClient } from '../../lib/api/api-client';

// Types from spec §3
export type TenantKind = 'ORGANISATION' | 'SOLO';
export type TenantStatus = 'provisioning' | 'active' | 'suspended' | 'offboarded';
export type PlanCode = 'SOLO' | 'SOLO_PRO' | 'TEAM' | 'BUSINESS' | 'WHITE_LABEL' | 'DEDICATED';
export type EntityType = 'IMF' | 'BROKER' | 'INDIVIDUAL_AGENT' | 'CORPORATE_AGENT';
export type LineOfBusiness = 'LIFE' | 'HEALTH' | 'GENERAL';
export type FeatureFlagKey = 'online_purchase' | 'referral_rewards' | 'ai_skills' | 'whatsapp_api' | 'book_import_ai' | 'twenty_ui';
export type Capability = 'CRM' | 'QUOTE_TO_SALE' | 'BOOK' | 'RESEARCH' | 'PRODUCTIVITY' | 'AI' | 'HIERARCHY' | 'CMS_PORTAL' | 'MICROSITE' | 'COMMISSION' | 'WHITE_LABEL_BRAND' | 'CUSTOM_DOMAIN' | 'DATA_EXPORT';

export interface TieUp {
  insurerId: string;
  line: LineOfBusiness;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface FeatureFlag {
  key: FeatureFlagKey;
  enabled: boolean;
  gate?: {
    kind: 'COMPLIANCE_REVIEW' | 'LEGAL_LOCK';
    reason: string;
    reviewRef?: string;
    reviewedAt?: string;
  };
}

export interface BrandKitProps {
  brandName: string;
  primary: string;
  secondary: string;
  typeface: 'IBM Plex Sans' | 'Noto Sans' | 'Mukta';
  logoRef?: string;
  poweredByVisible: boolean;
}

export interface BrandKitResponse extends BrandKitProps {
  contrastRatio: number;
}

export interface PlanLimits {
  seats: number | null;
  customers: number | null;
  ai_credits: number | null;
  messages: number | null;
  customFields: number;
}

export interface Plan {
  code: PlanCode;
  name: string;
  kind: TenantKind;
  stage: 'L' | 'L_BETA' | 'N';
  capabilities: string[];
  limits: PlanLimits;
  alertThresholdPct: number;
  canHidePoweredBy: boolean;
}

export interface UsageCounter {
  metric: 'seats' | 'customers' | 'ai_credits' | 'messages';
  period: string; // YYYY-MM
  used: number;
  limit: number | null;
  percentUsed?: number;
  alertedAt?: string;
}

export interface TenantProfile {
  id: string;
  slug: string;
  displayName: string;
  kind: TenantKind;
  status: TenantStatus;
  planCode: PlanCode;
  trialEndsAt?: string;
  crmMode: string;
  entity?: {
    entityType: EntityType;
    legalName: string;
    registrationNo: string;
    registrationValidTo: string;
    principalOfficerName?: string;
    registrationStatus: 'valid' | 'expiring' | 'expired';
    comparisonScope: 'MARKET_WIDE' | 'TIED_INSURERS';
  };
  hosts: Array<{ host: string; kind: string }>;
}

export interface EntitlementsResponse {
  plan: {
    code: PlanCode;
    name: string;
    capabilities: string[];
    limits: PlanLimits;
    alertThresholdPct: number;
  };
  usage: Array<UsageCounter & { percentUsed?: number }>;
  flags: FeatureFlag[];
}

export interface TieUpsResponse {
  entityType: EntityType;
  comparisonScope: 'MARKET_WIDE' | 'TIED_INSURERS';
  lines: Array<{
    line: LineOfBusiness;
    max: number | null;
    active: TieUp[];
  }>;
}

export interface TenantSummary {
  id: string;
  slug: string;
  displayName: string;
  kind: TenantKind;
  status: TenantStatus;
  planCode: PlanCode;
  cell: string;
  entityType?: EntityType;
  createdAt: string;
}

export interface ProvisionTenantInput {
  slug: string;
  displayName: string;
  kind: TenantKind;
  planCode: PlanCode;
  entity: {
    entityType: EntityType;
    legalName: string;
    registrationNo: string;
    registrationValidTo: string;
    principalOfficerName?: string;
  };
  admin: {
    name: string;
    phone?: string;
    email?: string;
  };
}

export interface ProvisionTenantResponse {
  tenantId: string;
  status: TenantStatus;
  host: string;
  failedStep?: string;
}

export interface TenantConfigResponse {
  displayName: string;
  brand: {
    brandName: string;
    primary: string;
    secondary: string;
    typeface: string;
    logoRef?: string;
    poweredByVisible: boolean;
  };
  languages: string[];
}

export interface SoloSignupStartRequest {
  phone: string;
  displayName: string;
  licence: {
    insurerName: string;
    line: LineOfBusiness;
    licenceNo: string;
  };
  consent: {
    noticeVersion: string;
    accepted: boolean;
  };
}

export interface SoloSignupStartResponse {
  signupId: string;
  expiresAt: string;
}

export interface SoloSignupVerifyRequest {
  otp: string;
}

export interface SoloSignupVerifyResponse {
  tenantId: string;
  host: string;
  status: TenantStatus;
  licenceStatus: string;
}

// API functions using spec §6

const newIdempotencyKey = () => {
  // Generate a simple UUID v4-like string
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export function createTenancyApi(apiClient: ApiClient) {
  return {
    // Tenant routes
    async getTenantProfile(): Promise<TenantProfile> {
      return apiClient.get('/api/v1/tenant');
    },

    async getEntitlements(): Promise<EntitlementsResponse> {
      return apiClient.get('/api/v1/tenant/entitlements');
    },

    async getTieUps(): Promise<TieUpsResponse> {
      return apiClient.get('/api/v1/tenant/tie-ups');
    },

    async updateTieUps(tieUps: TieUp[]): Promise<TieUpsResponse> {
      return apiClient.put('/api/v1/tenant/tie-ups', { tieUps });
    },

    async getFeatureFlags(): Promise<{ items: FeatureFlag[] }> {
      return apiClient.get('/api/v1/tenant/feature-flags');
    },

    async recordComplianceReview(key: FeatureFlagKey, reviewRef: string): Promise<FeatureFlag> {
      return apiClient.post(
        `/api/v1/tenant/feature-flags/${key}/compliance-reviews`,
        { reviewRef },
        { idempotencyKey: newIdempotencyKey() }
      );
    },

    async updateFeatureFlag(key: FeatureFlagKey, enabled: boolean): Promise<FeatureFlag> {
      return apiClient.put(`/api/v1/tenant/feature-flags/${key}`, { enabled });
    },

    async getBrandKit(): Promise<BrandKitResponse> {
      return apiClient.get('/api/v1/tenant/brand-kit');
    },

    async updateBrandKit(props: BrandKitProps): Promise<BrandKitResponse> {
      return apiClient.put('/api/v1/tenant/brand-kit', props);
    },

    async startTrial(): Promise<TenantProfile> {
      return apiClient.post(
        '/api/v1/tenant/trials',
        { planCode: 'SOLO_PRO' },
        { idempotencyKey: newIdempotencyKey() }
      );
    },

    // Operator routes
    async provisionTenant(input: ProvisionTenantInput): Promise<ProvisionTenantResponse> {
      return apiClient.post(
        '/api/v1/ops/tenants',
        input,
        { idempotencyKey: newIdempotencyKey() }
      );
    },

    async listTenants(filter?: {
      status?: TenantStatus;
      kind?: TenantKind;
      limit?: number;
      cursor?: string;
    }): Promise<{ items: TenantSummary[]; nextCursor?: string }> {
      return apiClient.get('/api/v1/ops/tenants', {
        query: {
          status: filter?.status,
          kind: filter?.kind,
          limit: filter?.limit,
          cursor: filter?.cursor,
        },
      });
    },

    async resumeProvisioning(tenantId: string): Promise<ProvisionTenantResponse> {
      return apiClient.post(
        `/api/v1/ops/tenants/${tenantId}/provisioning-resumptions`,
        {},
        { idempotencyKey: newIdempotencyKey() }
      );
    },

    async transitionTenantStatus(
      tenantId: string,
      to: 'suspended' | 'active' | 'offboarded',
      reason: string
    ): Promise<TenantSummary> {
      return apiClient.post(
        `/api/v1/ops/tenants/${tenantId}/status-transitions`,
        { to, reason },
        { idempotencyKey: newIdempotencyKey() }
      );
    },

    async changePlanCode(
      tenantId: string,
      planCode: PlanCode,
      ifMatch: string
    ): Promise<TenantSummary> {
      return apiClient.patch(
        `/api/v1/ops/tenants/${tenantId}`,
        { planCode },
        { ifMatch }
      );
    },

    async listPlans(): Promise<{ items: Plan[] }> {
      return apiClient.get('/api/v1/ops/plans');
    },

    // Public routes
    async getTenantConfig(host?: string): Promise<TenantConfigResponse> {
      const query: Record<string, string | undefined> = {};
      if (host) query.host = host;
      return apiClient.get('/api/v1/public/tenant-config', { query });
    },

    async startSoloSignup(input: SoloSignupStartRequest): Promise<SoloSignupStartResponse> {
      return apiClient.post(
        '/api/v1/public/solo-signups',
        input,
        { idempotencyKey: newIdempotencyKey() }
      );
    },

    async verifySoloSignup(
      signupId: string,
      input: SoloSignupVerifyRequest
    ): Promise<SoloSignupVerifyResponse> {
      return apiClient.post(
        `/api/v1/public/solo-signups/${signupId}/verifications`,
        input,
        { idempotencyKey: newIdempotencyKey() }
      );
    },
  };
}

export type TenancyApi = ReturnType<typeof createTenancyApi>;
