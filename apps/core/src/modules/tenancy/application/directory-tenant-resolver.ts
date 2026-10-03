import { TenantResolver } from '../../../kernel/tenancy/tenant-resolver';
import { ResolvedTenant } from '../../../kernel/config';
import { Clock } from '../../../kernel/domain/clock';
import { MetricsRegistry } from '../../../kernel/observability/metrics';
import { TenantDirectory } from './ports';

/** Resolves the tenant from the verified host only (HLD "tenant from trust"; G1/K3). */
export class DirectoryTenantResolver implements TenantResolver {
  constructor(private readonly directory: TenantDirectory) {}

  async resolveByHost(host: string): Promise<ResolvedTenant | undefined> {
    const found = await this.directory.findByHost(normaliseHost(host));
    if (!found?.host.verifiedAt) return undefined; // an unverified custom domain never resolves
    return { tenantId: found.tenant.props.id, status: found.tenant.props.status };
  }
}

/** Decorator: TTL cache in front of the directory; invalidated on status changes so suspension bites immediately. */
export class CachingTenantResolver implements TenantResolver {
  private readonly cache = new Map<string, { value: ResolvedTenant | undefined; expiresAt: number }>();

  constructor(
    private readonly inner: TenantResolver,
    private readonly clock: Clock,
    private readonly ttlMs: number,
    private readonly metrics?: MetricsRegistry,
  ) {}

  async resolveByHost(host: string): Promise<ResolvedTenant | undefined> {
    const key = normaliseHost(host);
    const now = this.clock.now().getTime();
    const cached = this.cache.get(key);
    if (cached && now < cached.expiresAt) {
      this.count('hit');
      return cached.value;
    }
    this.count('miss');
    const value = await this.inner.resolveByHost(key);
    this.cache.set(key, { value, expiresAt: now + this.ttlMs });
    return value;
  }

  invalidate(host?: string): void {
    if (host) this.cache.delete(normaliseHost(host));
    else this.cache.clear();
  }

  private count(result: 'hit' | 'miss'): void {
    this.metrics?.counter('tenancy_resolver_cache_total', 'Tenant resolver cache lookups', ['result']).inc({ result });
  }
}

export function normaliseHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, '');
}
