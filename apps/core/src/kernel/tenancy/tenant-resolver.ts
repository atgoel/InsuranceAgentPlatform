import { ResolvedTenant } from '../config';

export interface TenantResolver {
  resolveByHost(host: string): Promise<ResolvedTenant | undefined>;
}

/**
 * AC-M00-18 (tenancy): StaticTenantResolver
 * Resolves tenants from a static configuration map.
 * Host is lowercased and port is stripped.
 */
export class StaticTenantResolver implements TenantResolver {
  constructor(private readonly map: Record<string, ResolvedTenant>) {}

  async resolveByHost(host: string): Promise<ResolvedTenant | undefined> {
    // Strip port and lowercase
    const hostWithoutPort = host.split(':')[0].toLowerCase();
    return this.map[hostWithoutPort];
  }
}

/**
 * The kernel's TENANT_RESOLVER: guards depend on this stable instance, and the tenancy module (M01)
 * swaps in the directory-backed resolver at startup (Strategy). Until then it uses the static map.
 */
export class DelegatingTenantResolver implements TenantResolver {
  constructor(private delegate: TenantResolver) {}

  delegateTo(resolver: TenantResolver): void {
    this.delegate = resolver;
  }

  resolveByHost(host: string): Promise<ResolvedTenant | undefined> {
    return this.delegate.resolveByHost(host);
  }
}
