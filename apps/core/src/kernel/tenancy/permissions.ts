/**
 * AC-M00-19 (tenancy): Permissions
 * Role-based permission system with wildcard support.
 * Permissions are matched exactly or by wildcard suffix (e.g., 'crm.*' grants 'crm.lead.read').
 */

export interface PermissionPolicy {
  permissionsFor(roles: readonly string[]): ReadonlySet<string>;
}

export class RolePermissionMatrix implements PermissionPolicy {
  private readonly roleMatrix: Map<string, string[]> = new Map();

  constructor(initial?: Record<string, string[]>) {
    if (initial) {
      for (const [role, permissions] of Object.entries(initial)) {
        this.grant(role, permissions);
      }
    }

    // Always grant platform.operator ops.*
    this.roleMatrix.set('platform.operator', ['ops.*']);
  }

  grant(role: string, permissions: string[]): void {
    if (role === 'platform.operator') {
      return; // platform.operator always has ops.*
    }
    // Additive: several modules contribute rows for the same role (M01 tenant.*, M03 party.*, ...).
    this.roleMatrix.set(role, [...new Set([...(this.roleMatrix.get(role) ?? []), ...permissions])]);
  }

  permissionsFor(roles: readonly string[]): ReadonlySet<string> {
    const permissions = new Set<string>();

    for (const role of roles) {
      // Add role-specific permissions if the role is known
      const rolePermissions = this.roleMatrix.get(role);
      if (rolePermissions) {
        // Every authenticated role gets me.read and telemetry.write
        permissions.add('me.read');
        permissions.add('telemetry.write');

        for (const perm of rolePermissions) {
          permissions.add(perm);
        }
      }
    }

    return permissions;
  }
}

/**
 * AC-M00-19 (tenancy): hasPermission
 * Checks if a permission is granted, with wildcard suffix matching.
 * Examples:
 * - 'crm.*' grants 'crm.lead.read'
 * - 'crm.lead.*' grants 'crm.lead.read' but not 'crm.other.read'
 * - 'ops.*' grants 'ops.log_overrides'
 */
export function hasPermission(granted: ReadonlySet<string>, required: string): boolean {
  if (granted.has(required)) {
    return true;
  }

  // Check for wildcard suffix matching
  for (const permission of granted) {
    if (permission.endsWith('.*')) {
      const prefix = permission.slice(0, -2); // Remove '.*'
      if (required.startsWith(prefix + '.')) {
        return true;
      }
    }
  }

  return false;
}

/** Tenant-aware permission resolution used by guards; modules may make it data-driven (M02 role editor). */
export interface TenantPermissionPolicy {
  permissionsFor(roles: readonly string[], tenantId: string): Promise<ReadonlySet<string>>;
}

/** Default: the static module-registered matrix, identical for every tenant. */
export class StaticTenantPermissionPolicy implements TenantPermissionPolicy {
  constructor(private readonly matrix: PermissionPolicy) {}

  async permissionsFor(roles: readonly string[]): Promise<ReadonlySet<string>> {
    return this.matrix.permissionsFor(roles);
  }
}

/** Stable instance the guards depend on; a module swaps the strategy at startup (Strategy). */
export class DelegatingPermissionPolicy implements TenantPermissionPolicy {
  constructor(private delegate: TenantPermissionPolicy) {}

  delegateTo(policy: TenantPermissionPolicy): void {
    this.delegate = policy;
  }

  permissionsFor(roles: readonly string[], tenantId: string): Promise<ReadonlySet<string>> {
    return this.delegate.permissionsFor(roles, tenantId);
  }
}

/** Which role sets require a multi-factor sign-in (HLD K2; M02 §3.5). */
export interface MfaPolicy {
  requiresMfa(roles: readonly string[]): boolean;
}

export class DelegatingMfaPolicy implements MfaPolicy {
  private delegate: MfaPolicy = { requiresMfa: () => false };

  delegateTo(policy: MfaPolicy): void {
    this.delegate = policy;
  }

  requiresMfa(roles: readonly string[]): boolean {
    return this.delegate.requiresMfa(roles);
  }
}
