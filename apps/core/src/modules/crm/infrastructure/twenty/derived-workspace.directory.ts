import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { KERNEL_OPTIONS } from '../../../../kernel/tokens';
import { KernelConfig } from '../../../../kernel/config';
import { TENANT_DIRECTORY, TenantDirectory } from '../../application/ports';
import { TwentyWorkspaceDirectory, WorkspaceRef } from '../../application/twenty-sync.ports';

const PREFIX = 'ws_';

/**
 * Development/test workspace directory: the provisioner creates workspace `ws_<tenantId>` for crmMode = twenty
 * (M01 stub provisioner), and the webhook secret is derived per workspace with a domain-separated HMAC.
 * Production replaces this with the provisioned workspace record and a secret-manager lookup (HLD G6).
 */
@Injectable()
export class DerivedTwentyWorkspaceDirectory implements TwentyWorkspaceDirectory {
  constructor(
    @Inject(TENANT_DIRECTORY) private readonly tenants: TenantDirectory,
    @Inject(KERNEL_OPTIONS) private readonly config: KernelConfig,
  ) {}

  async forTenant(tenantId: string): Promise<WorkspaceRef | undefined> {
    const tenant = await this.tenants.findById(tenantId);
    if (tenant?.props.crmMode !== 'twenty') return undefined;
    const workspaceId = `${PREFIX}${tenantId}`;
    return { tenantId, workspaceId, apiKeySecretRef: `secret://twenty/${workspaceId}/api-key` };
  }

  async byWorkspace(workspaceId: string): Promise<{ ref: WorkspaceRef; webhookSecret: string } | undefined> {
    if (!workspaceId.startsWith(PREFIX)) return undefined;
    const ref = await this.forTenant(workspaceId.slice(PREFIX.length));
    return ref && { ref, webhookSecret: this.webhookSecret(workspaceId) };
  }

  webhookSecret(workspaceId: string): string {
    return createHmac('sha256', this.config.tokenSecret).update(`twenty-webhook:${workspaceId}`).digest('hex');
  }
}
