import { Logger } from '../../../kernel/observability/logger';
import { Tenant } from '../domain/tenant';
import { ContentProvisioner, CrmProvisioner, IdentityProvisioner, ProvisioningStateRepository, TenantDirectory } from './ports';

export interface AdminContact {
  name: string;
  phone?: string;
  email?: string;
}

export interface ProvisioningContext {
  tenant: Tenant;
  admin: AdminContact;
  host: string;
}

/** Command: one idempotent, resumable provisioning step (HLD §10 provisioning saga). */
export interface ProvisioningStep {
  readonly name: string;
  execute(ctx: ProvisioningContext): Promise<void>;
}

export class IdentityOrganisationStep implements ProvisioningStep {
  readonly name = 'identity.organisation';
  constructor(private readonly identity: IdentityProvisioner) {}
  execute(ctx: ProvisioningContext): Promise<void> {
    return this.identity.ensureOrganisation(ctx.tenant.props.id, ctx.tenant.props.slug);
  }
}

export class IdentityAdminStep implements ProvisioningStep {
  readonly name = 'identity.admin';
  constructor(private readonly identity: IdentityProvisioner) {}
  async execute(ctx: ProvisioningContext): Promise<void> {
    await this.identity.ensureAdmin(ctx.tenant.props.id, ctx.admin);
  }
}

export class CrmWorkspaceStep implements ProvisioningStep {
  readonly name = 'crm.workspace';
  constructor(private readonly crm: CrmProvisioner) {}
  async execute(ctx: ProvisioningContext): Promise<void> {
    await this.crm.ensureWorkspace(ctx.tenant.props.id, ctx.tenant.props.crmMode);
  }
}

export class ContentScopeStep implements ProvisioningStep {
  readonly name = 'content.scope';
  constructor(private readonly content: ContentProvisioner) {}
  execute(ctx: ProvisioningContext): Promise<void> {
    return this.content.ensureTenantScope(ctx.tenant.props.id);
  }
}

export class SmokeCheckStep implements ProvisioningStep {
  readonly name = 'smoke.check';
  constructor(private readonly directory: TenantDirectory) {}
  async execute(ctx: ProvisioningContext): Promise<void> {
    const resolved = await this.directory.findByHost(ctx.host);
    if (resolved?.tenant.props.id !== ctx.tenant.props.id) throw new Error(`Host ${ctx.host} does not resolve to the tenant`);
  }
}

export type SagaOutcome = { ok: true } | { ok: false; failedStep: string };

/** Runs steps in order, skipping those already completed; stops at the first failure so it can be resumed. */
export class ProvisioningSaga {
  constructor(
    private readonly steps: ProvisioningStep[],
    private readonly state: ProvisioningStateRepository,
    private readonly logger: Logger,
  ) {}

  async run(ctx: ProvisioningContext): Promise<SagaOutcome> {
    const done = new Set(await this.state.completedSteps(ctx.tenant.props.id));
    for (const step of this.steps) {
      if (done.has(step.name)) continue;
      try {
        await step.execute(ctx);
        await this.state.markCompleted(ctx.tenant.props.id, step.name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.state.markFailed(ctx.tenant.props.id, step.name, message);
        this.logger.warn('tenant.provisioning.step_failed', 'Provisioning step failed', { tenantId: ctx.tenant.props.id, step: step.name });
        return { ok: false, failedStep: step.name };
      }
    }
    return { ok: true };
  }
}
