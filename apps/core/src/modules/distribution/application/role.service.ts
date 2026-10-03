import { Inject, Injectable } from '@nestjs/common';
import { PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { MfaPolicy, PermissionPolicy, TenantPermissionPolicy } from '../../../kernel/tenancy/permissions';
import { UnitOfWork } from '../../../kernel/persistence/unit-of-work';
import { RoleCatalogue, RoleDefinition } from '../domain/roles';
import { ROLE_REPOSITORY, RoleRepository } from './ports';
import { DistributionContext } from './distribution-context';

const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  'distribution.member.read': 'See salespeople and staff in their scope',
  'distribution.member.write': 'Invite, update, deactivate and exit members',
  'distribution.onboarding.write': 'Record onboarding evidence and insurer codes',
  'distribution.onboarding.approve': 'Activate salespeople after onboarding',
  'distribution.licence.read': 'See licence validity and expiry alerts',
  'distribution.licence.write': 'Record licences and certificates',
  'distribution.role.read': 'See roles and permissions',
  'distribution.self.read': 'See their own profile and selling scope',
  'distribution.transfer.write': 'Transfer a leaving salesperson’s book',
};


@Injectable()
export class RoleCatalogueCache {
  private readonly cache = new Map<string, { catalogue: RoleCatalogue; expiresAt: number }>();

  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    private readonly ctx: DistributionContext,
  ) {}

  async get(tenantId: string, uow: UnitOfWork = this.ctx.uow): Promise<RoleCatalogue> {
    const now = this.ctx.clock.now().getTime();
    const hit = this.cache.get(tenantId);
    if (hit && now < hit.expiresAt) return hit.catalogue;
    const catalogue = await uow.run(tenantId, (tx) => this.roles.catalogue(tx));
    this.cache.set(tenantId, { catalogue, expiresAt: now + 60_000 });
    return catalogue;
  }

  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }
}

@Injectable()
export class RoleService {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    private readonly ctx: DistributionContext,
    private readonly policyCache: RoleCatalogueCache,
  ) {}

  list(tenantId: string): Promise<RoleDefinition[]> {
    return this.ctx.uow.run(tenantId, async (tx) => (await this.roles.catalogue(tx)).list());
  }

  async preview(tenantId: string, role: string): Promise<{ role: string; sees: string[] }> {
    const def = await this.ctx.uow.run(tenantId, async (tx) => (await this.roles.catalogue(tx)).get(role));
    return { role, sees: def.permissions.map((p) => PERMISSION_DESCRIPTIONS[p] ?? p) };
  }

  updatePermissions(tenantId: string, role: string, permissions: string[], expectedVersion: number): Promise<RoleDefinition> {
    return this.ctx.uow.run(tenantId, async (tx) => {
      const catalogue = await this.roles.catalogue(tx);
      if (catalogue.get(role).version !== expectedVersion) throw new PreconditionFailedError('version_mismatch', 'The role was changed by someone else; reload and retry');
      const updated = catalogue.withPermissions(role, permissions).get(role);
      await this.roles.save(tx, updated);
      this.policyCache.invalidate(tenantId);
      await this.ctx.recorder.record(tx, { audit: { action: 'distribution.role.permissions_changed', entityType: 'role', entityId: role, metadata: { version: updated.version, permissions } } });
      this.ctx.logger.security('security.role.permissions_changed', 'Role permissions changed', { role, version: updated.version });
      return updated;
    });
  }
}
/**
 * Data-driven permissions: for roles in the tenant's catalogue, the catalogue (possibly edited) decides;
 * other roles fall back to the module-registered static matrix. Operators keep ops.* from the matrix.
 */
export class DataDrivenPermissionPolicy implements TenantPermissionPolicy {
  constructor(
    private readonly matrix: PermissionPolicy,
    private readonly catalogues: RoleCatalogueCache,
  ) {}

  async permissionsFor(roles: readonly string[], tenantId: string): Promise<ReadonlySet<string>> {
    const granted = new Set(this.matrix.permissionsFor(roles));
    if (tenantId === 'platform') return granted;
    const catalogue = await this.catalogues.get(tenantId);
    for (const role of roles) {
      const def = catalogue.list().find((d) => d.role === role);
      if (def) def.permissions.forEach((p) => granted.add(p));
    }
    return granted;
  }
}

/** Privileged roles need MFA (W10 sign-in policy). */
export class CatalogueMfaPolicy implements MfaPolicy {
  private readonly privileged = new Set(RoleCatalogue.defaults().list().filter((d) => d.privileged).map((d) => d.role));

  requiresMfa(roles: readonly string[]): boolean {
    return roles.some((r) => this.privileged.has(r));
  }
}
