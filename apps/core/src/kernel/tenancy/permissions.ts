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
    this.roleMatrix.set(role, permissions);
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
