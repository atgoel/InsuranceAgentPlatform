import { NotFoundError, BusinessRuleError, ValidationError } from '../../../kernel/errors/domain-errors';

export type RecordScopeKind = 'OWN' | 'UNIT_SUBTREE' | 'TENANT';

export interface RoleDefinition {
  role: string;
  version: number;
  permissions: string[];
  recordScope: RecordScopeKind;
  privileged: boolean;
  editable: boolean;
}

export interface RecordScope {
  kind: RecordScopeKind;
  memberId?: string;
  orgUnitIds?: string[];
}

export const LOCKED_PERMISSIONS: readonly string[] = ['party.medical.read', 'audit.delete', 'ops.*'];

const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  TENANT_ADMIN: ['distribution.*', 'tenant.*'],
  PRINCIPAL_OFFICER: ['distribution.member.read', 'distribution.member.write', 'distribution.onboarding.approve', 'distribution.role.read'],
  BRANCH_MANAGER: ['distribution.member.read', 'distribution.onboarding.write', 'distribution.onboarding.approve', 'distribution.transfer.write'],
  SALES_MANAGER: ['distribution.member.read', 'distribution.onboarding.write'],
  SALESPERSON: ['distribution.self.read'],
  SOLO_OWNER: ['distribution.self.read', 'distribution.licence.write'],
  OPS: ['distribution.member.read', 'distribution.onboarding.write', 'distribution.licence.write'],
  FINANCE: ['distribution.member.read'],
  COMPLIANCE: ['distribution.member.read', 'distribution.licence.read'],
  CMS_AUTHOR: [],
  CMS_PUBLISHER: [],
};

const DEFAULT_SCOPES: Record<string, RecordScopeKind> = {
  CMS_PUBLISHER: 'TENANT',
  TENANT_ADMIN: 'TENANT',
  PRINCIPAL_OFFICER: 'TENANT',
  BRANCH_MANAGER: 'UNIT_SUBTREE',
  SALES_MANAGER: 'UNIT_SUBTREE',
  SALESPERSON: 'OWN',
  SOLO_OWNER: 'TENANT',
  OPS: 'TENANT',
  FINANCE: 'TENANT',
  COMPLIANCE: 'TENANT',
  CMS_AUTHOR: 'OWN',
};

const PRIVILEGED_ROLES = [
  'TENANT_ADMIN',
  'PRINCIPAL_OFFICER',
  'BRANCH_MANAGER',
  'SALES_MANAGER',
  'OPS',
  'FINANCE',
  'COMPLIANCE',
  'CMS_PUBLISHER',
];

const NON_EDITABLE_ROLES = ['TENANT_ADMIN', 'PRINCIPAL_OFFICER', 'SOLO_OWNER', 'CMS_AUTHOR'];

export const PERMISSION_REGISTRY: ReadonlySet<string> = new Set([
  'me.read',
  'telemetry.write',
  'tenant.*',
  'distribution.*',
  'distribution.member.read',
  'distribution.member.write',
  'distribution.onboarding.write',
  'distribution.onboarding.approve',
  'distribution.transfer.write',
  'distribution.self.read',
  'distribution.licence.write',
  'distribution.licence.read',
  'distribution.org.write',
  'distribution.role.read',
  'distribution.role.write',
  'party.*',
  'party.read',
  'party.write',
  'party.consent.write',
  'party.merge',
  'party.sensitive.read',
  'party.suppression.write',
  'crm.*',
  'crm.lead.read',
  'crm.lead.write',
  'crm.lead.convert',
  'crm.lead.assign',
  'crm.activity.write',
  'crm.task.*',
  'crm.task.read',
  'crm.task.write',
  'crm.opportunity.read',
  'crm.opportunity.write',
  'crm.routing.read',
  'crm.routing.write',
  'crm.import',
  'catalogue.read',
  'party.medical.read',
  'audit.delete',
  'ops.*',
]);

export class RoleCatalogue {
  private roles: Map<string, RoleDefinition>;

  static defaults(): RoleCatalogue {
    const roles = new Map<string, RoleDefinition>();

    for (const [roleName, permissions] of Object.entries(DEFAULT_PERMISSIONS)) {
      roles.set(roleName, {
        role: roleName,
        version: 1,
        permissions,
        recordScope: DEFAULT_SCOPES[roleName],
        privileged: PRIVILEGED_ROLES.includes(roleName),
        editable: !NON_EDITABLE_ROLES.includes(roleName),
      });
    }

    const catalogue = new RoleCatalogue();
    catalogue.roles = roles;
    return catalogue;
  }

  private constructor() {
    this.roles = new Map();
  }

  /** Applies a tenant's stored role versions over the defaults. */
  withOverrides(overrides: RoleDefinition[]): RoleCatalogue {
    const next = new RoleCatalogue();
    next.roles = new Map(this.roles);
    for (const def of overrides) if (next.roles.has(def.role)) next.roles.set(def.role, { ...def, permissions: [...def.permissions] });
    return next;
  }

  get(role: string): RoleDefinition {
    const def = this.roles.get(role);
    if (!def) {
      throw new NotFoundError('role', role);
    }
    return def;
  }

  list(): RoleDefinition[] {
    return Array.from(this.roles.values());
  }

  withPermissions(role: string, permissions: string[]): RoleCatalogue {
    const def = this.get(role);

    if (!def.editable) {
      throw new BusinessRuleError('role_not_editable', `Role ${role} is not editable`);
    }

    for (const perm of permissions) {
      if (LOCKED_PERMISSIONS.includes(perm)) {
        throw new BusinessRuleError('permission_locked', `Permission is locked: ${perm}`, { permission: perm });
      }
    }

    for (const perm of def.permissions) {
      if (LOCKED_PERMISSIONS.includes(perm) && !permissions.includes(perm)) {
        throw new BusinessRuleError('permission_locked', `Locked permission cannot be removed: ${perm}`, { permission: perm });
      }
    }

    for (const perm of permissions) {
      if (!PERMISSION_REGISTRY.has(perm)) {
        throw new ValidationError('unknown_permission', `Unknown permission: ${perm}`);
      }
    }

    const newCatalogue = new RoleCatalogue();
    newCatalogue.roles = new Map(this.roles);

    const updatedDef: RoleDefinition = {
      ...def,
      permissions,
      version: def.version + 1,
    };

    newCatalogue.roles.set(role, updatedDef);
    return newCatalogue;
  }
}

export function inScope(scope: RecordScope, record: { ownerMemberId?: string; orgUnitId?: string }): boolean {
  if (scope.kind === 'TENANT') {
    return true;
  }

  if (scope.kind === 'OWN') {
    return scope.memberId === record.ownerMemberId;
  }

  if (scope.kind === 'UNIT_SUBTREE') {
    return scope.orgUnitIds?.includes(record.orgUnitId || '') || false;
  }

  return false;
}
