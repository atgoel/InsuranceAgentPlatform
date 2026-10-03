import { Injectable, Inject } from '@nestjs/common';
import { TenantResolver } from '../../../kernel/tenancy/tenant-resolver';
import { Clock } from '../../../kernel/domain/clock';
import { TENANT_DIRECTORY, TenantDirectory } from './ports';

interface ResolvedTenant {
  tenantId: string;
  status: 'active' | 'suspended' | 'provisioning' | 'offboarded';
}

@Injectable()
export class DirectoryTenantResolver implements TenantResolver {
  constructor(@Inject(TENANT_DIRECTORY) private directory: TenantDirectory) {}

  async resolveByHost(host: string): Promise<ResolvedTenant | undefined> {
    const result = await this.directory.findByHost(host);
    if (!result) return undefined;

    return {
      tenantId: result.tenant.props.id,
      status: result.tenant.props.status,
    };
  }
}

@Injectable()
export class CachingTenantResolver implements TenantResolver {
  private cache = new Map<string, { tenant: ResolvedTenant | undefined; expiresAt: number }>();

  constructor(private inner: DirectoryTenantResolver, private clock: Clock, private ttlMs: number) {}

  async resolveByHost(host: string): Promise<ResolvedTenant | undefined> {
    const cached = this.cache.get(host);
    if (cached && this.clock.now().getTime() < cached.expiresAt) {
      return cached.tenant;
    }

    const tenant = await this.inner.resolveByHost(host);
    const expiresAt = this.clock.now().getTime() + this.ttlMs;
    this.cache.set(host, { tenant, expiresAt });

    return tenant;
  }

  invalidate(host?: string): void {
    if (host) {
      this.cache.delete(host);
    } else {
      this.cache.clear();
    }
  }
}
