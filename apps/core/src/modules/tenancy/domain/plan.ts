import { NotFoundError } from '../../../kernel/errors/domain-errors';
import { TenantKind, PlanCode } from './tenant';

export type Capability =
  | 'CRM'
  | 'QUOTE_TO_SALE'
  | 'BOOK'
  | 'RESEARCH'
  | 'PRODUCTIVITY'
  | 'AI'
  | 'HIERARCHY'
  | 'CMS_PORTAL'
  | 'MICROSITE'
  | 'COMMISSION'
  | 'WHITE_LABEL_BRAND'
  | 'CUSTOM_DOMAIN'
  | 'DATA_EXPORT';

export type UsageMetric = 'seats' | 'customers' | 'ai_credits' | 'messages';

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
  capabilities: ReadonlySet<Capability>;
  limits: PlanLimits;
  alertThresholdPct: number;
  canHidePoweredBy: boolean;
}

const DEFAULT_PLANS: Plan[] = [
  {
    code: 'SOLO',
    name: 'Solo',
    kind: 'SOLO',
    stage: 'L',
    capabilities: new Set([
      'CRM',
      'QUOTE_TO_SALE',
      'BOOK',
      'RESEARCH',
      'PRODUCTIVITY',
      'AI',
      'MICROSITE',
      'COMMISSION',
      'DATA_EXPORT',
    ]),
    limits: {
      seats: 1,
      customers: 500,
      ai_credits: 100,
      messages: 0,
      customFields: 10,
    },
    alertThresholdPct: 75,
    canHidePoweredBy: false,
  },
  {
    code: 'SOLO_PRO',
    name: 'Solo Pro',
    kind: 'SOLO',
    stage: 'L',
    capabilities: new Set([
      'CRM',
      'QUOTE_TO_SALE',
      'BOOK',
      'RESEARCH',
      'PRODUCTIVITY',
      'AI',
      'MICROSITE',
      'COMMISSION',
      'DATA_EXPORT',
    ]),
    limits: {
      seats: 1,
      customers: null,
      ai_credits: 1000,
      messages: 500,
      customFields: 10,
    },
    alertThresholdPct: 75,
    canHidePoweredBy: false,
  },
  {
    code: 'TEAM',
    name: 'Team',
    kind: 'ORGANISATION',
    stage: 'L',
    capabilities: new Set([
      'CRM',
      'QUOTE_TO_SALE',
      'BOOK',
      'RESEARCH',
      'PRODUCTIVITY',
      'AI',
      'HIERARCHY',
      'MICROSITE',
      'COMMISSION',
      'DATA_EXPORT',
    ]),
    limits: {
      seats: 25,
      customers: null,
      ai_credits: 2000,
      messages: 5000,
      customFields: 20,
    },
    alertThresholdPct: 75,
    canHidePoweredBy: false,
  },
  {
    code: 'BUSINESS',
    name: 'Business',
    kind: 'ORGANISATION',
    stage: 'L',
    capabilities: new Set([
      'CRM',
      'QUOTE_TO_SALE',
      'BOOK',
      'RESEARCH',
      'PRODUCTIVITY',
      'AI',
      'HIERARCHY',
      'CMS_PORTAL',
      'MICROSITE',
      'COMMISSION',
      'CUSTOM_DOMAIN',
      'DATA_EXPORT',
    ]),
    limits: {
      seats: 200,
      customers: null,
      ai_credits: 10000,
      messages: 25000,
      customFields: 50,
    },
    alertThresholdPct: 90,
    canHidePoweredBy: false,
  },
  {
    code: 'WHITE_LABEL',
    name: 'White Label',
    kind: 'ORGANISATION',
    stage: 'L',
    capabilities: new Set([
      'CRM',
      'QUOTE_TO_SALE',
      'BOOK',
      'RESEARCH',
      'PRODUCTIVITY',
      'AI',
      'HIERARCHY',
      'CMS_PORTAL',
      'MICROSITE',
      'COMMISSION',
      'WHITE_LABEL_BRAND',
      'CUSTOM_DOMAIN',
      'DATA_EXPORT',
    ]),
    limits: {
      seats: 500,
      customers: null,
      ai_credits: 20000,
      messages: 50000,
      customFields: 100,
    },
    alertThresholdPct: 90,
    canHidePoweredBy: true,
  },
  {
    code: 'DEDICATED',
    name: 'Dedicated',
    kind: 'ORGANISATION',
    stage: 'L',
    capabilities: new Set([
      'CRM',
      'QUOTE_TO_SALE',
      'BOOK',
      'RESEARCH',
      'PRODUCTIVITY',
      'AI',
      'HIERARCHY',
      'CMS_PORTAL',
      'MICROSITE',
      'COMMISSION',
      'WHITE_LABEL_BRAND',
      'CUSTOM_DOMAIN',
      'DATA_EXPORT',
    ]),
    limits: {
      seats: null,
      customers: null,
      ai_credits: null,
      messages: null,
      customFields: 200,
    },
    alertThresholdPct: 90,
    canHidePoweredBy: true,
  },
];

export class PlanCatalogue {
  private plans: Map<PlanCode, Plan>;

  constructor(plans: Plan[]) {
    this.plans = new Map();
    for (const plan of plans) {
      this.plans.set(plan.code, plan);
    }
  }

  get(code: PlanCode): Plan {
    const plan = this.plans.get(code);
    if (!plan) {
      throw new NotFoundError('plan');
    }
    return plan;
  }

  list(): Plan[] {
    return Array.from(this.plans.values());
  }

  static default(): PlanCatalogue {
    return new PlanCatalogue(DEFAULT_PLANS);
  }
}
