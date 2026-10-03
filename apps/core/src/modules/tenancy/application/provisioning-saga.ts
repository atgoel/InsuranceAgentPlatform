import { Injectable, Inject } from '@nestjs/common';
import { Logger } from '../../../kernel/observability/logger';
import { Tenant } from '../domain/tenant';
import { IDENTITY_PROVISIONER, CRM_PROVISIONER, CONTENT_PROVISIONER, IdentityProvisioner, CrmProvisioner, ContentProvisioner, TENANT_DIRECTORY, PROVISIONING_STATE_REPOSITORY, ProvisioningStateRepository, TenantDirectory } from './ports';

export interface ProvisioningStep {
  readonly name: string;
  execute(ctx: { tenant: Tenant; admin: { name: string; phone?: string; email?: string } }): Promise<void>;
}

@Injectable()
export class IdentityOrganisationStep implements ProvisioningStep {
  readonly name = 'identity.organisation';

  constructor(@Inject(IDENTITY_PROVISIONER) private provisioner: IdentityProvisioner) {}

  async execute(ctx: { tenant: Tenant }): Promise<void> {
    await this.provisioner.ensureOrganisation(ctx.tenant.props.id, ctx.tenant.props.slug);
  }
}

@Injectable()
export class IdentityAdminStep implements ProvisioningStep {
  readonly name = 'identity.admin';

  constructor(@Inject(IDENTITY_PROVISIONER) private provisioner: IdentityProvisioner) {}

  async execute(ctx: { tenant: Tenant; admin: { name: string; phone?: string; email?: string } }): Promise<void> {
    await this.provisioner.ensureAdmin(ctx.tenant.props.id, ctx.admin);
  }
}

@Injectable()
export class CrmWorkspaceStep implements ProvisioningStep {
  readonly name = 'crm.workspace';

  constructor(@Inject(CRM_PROVISIONER) private provisioner: CrmProvisioner) {}

  async execute(ctx: { tenant: Tenant }): Promise<void> {
    await this.provisioner.ensureWorkspace(ctx.tenant.props.id, ctx.tenant.props.crmMode);
  }
}

@Injectable()
export class ContentScopeStep implements ProvisioningStep {
  readonly name = 'content.scope';

  constructor(private provisioner: any) {} // Placeholder for ContentProvisioner

  async execute(ctx: { tenant: Tenant }): Promise<void> {
    // Implementation would call provisioner.ensureTenantScope
  }
}

@Injectable()
export class SmokeCheckStep implements ProvisioningStep {
  readonly name = 'smoke.check';

  constructor(@Inject(TENANT_DIRECTORY) private directory: TenantDirectory) {}

  async execute(ctx: { tenant: Tenant }): Promise<void> {
    const found = await this.directory.findBySlug(ctx.tenant.props.slug);
    if (!found) throw new Error('Smoke check failed: tenant not found');
  }
}

@Injectable()
export class ProvisioningSaga {
  constructor(
    private steps: ProvisioningStep[],
    @Inject(PROVISIONING_STATE_REPOSITORY) private stateRepo: ProvisioningStateRepository,
    private logger: Logger
  ) {}

  async run(ctx: { tenant: Tenant; admin: { name: string; phone?: string; email?: string } }): Promise<{ ok: true } | { ok: false; failedStep: string }> {
    const completedSteps = await this.stateRepo.completedSteps(ctx.tenant.props.id);

    for (const step of this.steps) {
      if (completedSteps.includes(step.name)) {
        continue; // Skip already completed steps
      }

      try {
        await step.execute(ctx);
        await this.stateRepo.markCompleted(ctx.tenant.props.id, step.name);
      } catch (error) {
        this.logger.warn('tenant.provisioning.step_failed', {}, { step: step.name });
        await this.stateRepo.markFailed(ctx.tenant.props.id, step.name, String(error));
        return { ok: false, failedStep: step.name };
      }
    }

    return { ok: true };
  }
}
