import { ValidationError, BusinessRuleError } from '../../../kernel/errors/domain-errors';

export type TenantKind = 'ORGANISATION' | 'SOLO';
export type TenantStatus = 'provisioning' | 'active' | 'suspended' | 'offboarded';
export type CrmMode = 'solo_lite' | 'twenty';
export type PlanCode = 'SOLO' | 'SOLO_PRO' | 'TEAM' | 'BUSINESS' | 'WHITE_LABEL' | 'DEDICATED';

export interface TenantProps {
  id: string;
  slug: string;
  displayName: string;
  kind: TenantKind;
  status: TenantStatus;
  planCode: PlanCode;
  trialEndsAt?: string;
  cell: string;
  deploymentMode: 'pooled' | 'dedicated';
  crmMode: CrmMode;
  createdAt: string;
  version: number;
}

export class Tenant {
  private state: TenantProps;

  private constructor(props: TenantProps) {
    this.state = props;
  }

  static create(input: {
    id: string;
    slug: string;
    displayName: string;
    kind: TenantKind;
    planCode: PlanCode;
    cell?: string;
    now: Date;
  }): Tenant {
    // Validate slug format: /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/
    if (!input.slug.match(/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/)) {
      throw new ValidationError('invalid_slug', 'Slug must be lowercase alphanumeric with hyphens');
    }

    // Validate plan ↔ kind
    const validPlansForKind = {
      SOLO: ['SOLO', 'SOLO_PRO'],
      ORGANISATION: ['TEAM', 'BUSINESS', 'WHITE_LABEL', 'DEDICATED'],
    };

    if (!validPlansForKind[input.kind].includes(input.planCode)) {
      throw new BusinessRuleError(
        'plan_not_allowed_for_kind',
        `Plan ${input.planCode} not allowed for kind ${input.kind}`
      );
    }

    // Derive crmMode
    const crmMode: CrmMode = input.kind === 'SOLO' ? 'solo_lite' : 'twenty';

    // Derive deploymentMode
    const deploymentMode: 'pooled' | 'dedicated' = input.planCode === 'DEDICATED' ? 'dedicated' : 'pooled';

    const props: TenantProps = {
      id: input.id,
      slug: input.slug,
      displayName: input.displayName,
      kind: input.kind,
      status: 'provisioning',
      planCode: input.planCode,
      cell: input.cell || 'cell-1',
      deploymentMode,
      crmMode,
      createdAt: input.now.toISOString(),
      version: 1,
    };

    return new Tenant(props);
  }

  static restore(props: TenantProps): Tenant {
    return new Tenant(props);
  }

  get props(): Readonly<TenantProps> {
    return { ...this.state };
  }

  activate(): void {
    const current = this.state.status;
    if (current === 'provisioning' || current === 'suspended') {
      this.state.status = 'active';
    } else {
      throw new BusinessRuleError(
        'illegal_tenant_transition',
        `Cannot transition from ${current} to active`
      );
    }
  }

  suspend(): void {
    const current = this.state.status;
    if (current === 'active') {
      this.state.status = 'suspended';
    } else {
      throw new BusinessRuleError(
        'illegal_tenant_transition',
        `Cannot transition from ${current} to suspended`
      );
    }
  }

  offboard(): void {
    const current = this.state.status;
    if (current === 'active' || current === 'suspended') {
      this.state.status = 'offboarded';
    } else {
      throw new BusinessRuleError(
        'illegal_tenant_transition',
        `Cannot transition from ${current} to offboarded`
      );
    }
  }

  changePlan(plan: PlanCode): void {
    // Validate kind compatibility
    const validPlansForKind = {
      SOLO: ['SOLO', 'SOLO_PRO'],
      ORGANISATION: ['TEAM', 'BUSINESS', 'WHITE_LABEL', 'DEDICATED'],
    };

    if (!validPlansForKind[this.state.kind].includes(plan)) {
      throw new BusinessRuleError(
        'plan_not_allowed_for_kind',
        `Plan ${plan} not allowed for kind ${this.state.kind}`
      );
    }

    // Cannot change plan when offboarded
    if (this.state.status === 'offboarded') {
      throw new BusinessRuleError(
        'illegal_plan_change',
        'Cannot change plan for offboarded tenant'
      );
    }

    this.state.planCode = plan;
  }

  startTrial(plan: 'SOLO_PRO', endsAt: Date): void {
    // Only SOLO tenants on SOLO plan can start trial
    if (this.state.kind !== 'SOLO') {
      throw new BusinessRuleError(
        'trial_not_allowed',
        'Only SOLO tenants can start a trial'
      );
    }

    if (this.state.planCode !== 'SOLO') {
      throw new BusinessRuleError(
        'trial_not_allowed',
        'Can only start trial from SOLO plan'
      );
    }

    this.state.planCode = plan;
    this.state.trialEndsAt = endsAt.toISOString();
  }
}
