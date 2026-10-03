import { Clock } from '../../../kernel/domain/clock';
import { UnitOfWork } from '../../../kernel/persistence/unit-of-work';
import { ResolvedTenant } from '../../../kernel/config';
import { Tenant } from '../domain/tenant';
import { DistributorEntity } from '../domain/distributor-entity';
import { FeatureFlagSet } from '../domain/feature-flags';
import { BrandKit } from '../domain/brand-kit';
import { TenantDirectory, TenantSettingsRepository } from '../application/ports';

/**
 * Development/test only: materialises the kernel's DEV_TENANTS map into the tenant directory so
 * host resolution has one source of truth. Production tenants come from provisioning.
 */
export async function seedStaticTenants(
  staticTenants: Record<string, ResolvedTenant>,
  deps: { directory: TenantDirectory; settings: TenantSettingsRepository; uow: UnitOfWork; clock: Clock },
): Promise<void> {
  const now = deps.clock.now();
  for (const [host, resolved] of Object.entries(staticTenants)) {
    if (await deps.directory.findById(resolved.tenantId)) continue;
    const label = host.split('.')[0] ?? resolved.tenantId;
    await deps.directory.save(
      Tenant.restore({
        id: resolved.tenantId, slug: label, displayName: `${label[0]?.toUpperCase() ?? ''}${label.slice(1)} (demo)`, kind: 'ORGANISATION',
        status: resolved.status, planCode: 'BUSINESS', cell: 'cell-1', deploymentMode: 'pooled', crmMode: 'twenty', createdAt: now.toISOString(), version: 0,
      }),
    );
    await deps.directory.addHost({ tenantId: resolved.tenantId, host, kind: 'platform_subdomain', verifiedAt: now.toISOString() });
    await deps.uow.run(resolved.tenantId, async (tx) => {
      const validTo = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await deps.settings.saveEntity(tx, DistributorEntity.create({ tenantKind: 'ORGANISATION', entityType: 'IMF', legalName: `${label} Insurance Marketing Firm`, registrationNo: `IMF-DEMO-${label.toUpperCase()}`.slice(0, 40), registrationValidTo: validTo, principalOfficerName: 'Demo Principal Officer' }));
      await deps.settings.saveFlags(tx, FeatureFlagSet.defaults());
      await deps.settings.saveBrandKit(tx, BrandKit.platformDefault());
    });
  }
}
