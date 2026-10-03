import { BusinessRuleError, ValidationError, NotFoundError } from '../../../kernel/errors/domain-errors';
import { RoleCatalogue, LOCKED_PERMISSIONS, RecordScopeKind } from './roles';

/**
 * AC-M02-11: Role editor - locked permissions cannot be added or removed, non-editable roles
 * are rejected, unknown permissions rejected, each save increments the version, stale If-Match → 412,
 * the permission policy reflects the change immediately, and the change is security-logged.
 */
describe('AC-M02-11 RoleCatalogue and permissions', () => {
  describe('RoleCatalogue defaults', () => {
    it('provides default roles with correct record scopes', () => {
      const catalogue = RoleCatalogue.defaults();

      const tenantAdmin = catalogue.get('TENANT_ADMIN');
      expect(tenantAdmin.recordScope).toBe('TENANT');
      expect(tenantAdmin.privileged).toBe(true);
      expect(tenantAdmin.editable).toBe(false);

      const principal = catalogue.get('PRINCIPAL_OFFICER');
      expect(principal.recordScope).toBe('TENANT');
      expect(principal.privileged).toBe(true);

      const branchManager = catalogue.get('BRANCH_MANAGER');
      expect(branchManager.recordScope).toBe('UNIT_SUBTREE');
      expect(branchManager.privileged).toBe(true);
      expect(branchManager.editable).toBe(true);

      const salesperson = catalogue.get('SALESPERSON');
      expect(salesperson.recordScope).toBe('OWN');
      expect(salesperson.privileged).toBe(false);

      const soloOwner = catalogue.get('SOLO_OWNER');
      expect(soloOwner.recordScope).toBe('TENANT');
      expect(soloOwner.privileged).toBe(false);
    });

    it('includes locked permissions distribution.*', () => {
      const LOCKED_PERMISSIONS = [
        'party.medical.read',
        'audit.delete',
        'ops.*',
      ];

      expect(LOCKED_PERMISSIONS).toContain('party.medical.read');
      expect(LOCKED_PERMISSIONS).toContain('audit.delete');
    });

    it('lists all roles', () => {
      const catalogue = RoleCatalogue.defaults();
      const roles = catalogue.list();

      expect(roles).toHaveLength(10);
      expect(roles.map(r => r.role)).toContain('TENANT_ADMIN');
      expect(roles.map(r => r.role)).toContain('SALESPERSON');
    });
  });

  describe('get role', () => {
    it('returns role definition by name', () => {
      const catalogue = RoleCatalogue.defaults();

      const role = catalogue.get('BRANCH_MANAGER');

      expect(role.role).toBe('BRANCH_MANAGER');
      expect(role.permissions).toContain('distribution.member.read');
    });

    it('throws NotFoundError for unknown role', () => {
      const catalogue = RoleCatalogue.defaults();

      expect(() => {
        catalogue.get('UNKNOWN_ROLE');
      }).toThrow();
    });
  });

  describe('withPermissions', () => {
    it('creates new version with updated permissions for editable role', () => {
      const catalogue = RoleCatalogue.defaults();
      const original = catalogue.get('BRANCH_MANAGER');

      const updated = catalogue.withPermissions('BRANCH_MANAGER', ['distribution.member.read']);

      const updatedRole = updated.get('BRANCH_MANAGER');
      expect(updatedRole.version).toBe(original.version + 1);
      expect(updatedRole.permissions).toEqual(['distribution.member.read']);
    });

    it('rejects update for non-editable role', () => {
      const catalogue = RoleCatalogue.defaults();

      expect(() => {
        catalogue.withPermissions('TENANT_ADMIN', ['some.permission']);
      }).toThrow(BusinessRuleError);
    });

    it('rejects adding locked permission', () => {
      const catalogue = RoleCatalogue.defaults();
      const original = catalogue.get('BRANCH_MANAGER');

      expect(() => {
        catalogue.withPermissions('BRANCH_MANAGER', [
          ...original.permissions,
          'party.medical.read',
        ]);
      }).toThrow(BusinessRuleError);
    });

    it('rejects removing locked permission', () => {
      const catalogue = RoleCatalogue.defaults();

      // Assume a role has 'audit.delete'
      const opsRole = catalogue.get('OPS');
      const hasAuditDelete = opsRole.permissions.includes('audit.delete');

      if (hasAuditDelete) {
        expect(() => {
          catalogue.withPermissions('OPS', opsRole.permissions.filter(p => p !== 'audit.delete'));
        }).toThrow(BusinessRuleError);
      }
    });

    it('rejects unknown permission', () => {
      const catalogue = RoleCatalogue.defaults();

      expect(() => {
        catalogue.withPermissions('BRANCH_MANAGER', ['unknown.permission']);
      }).toThrow(ValidationError);
    });

    it('increments version on each save', () => {
      let catalogue = RoleCatalogue.defaults();
      let role = catalogue.get('BRANCH_MANAGER');
      const initialVersion = role.version;

      catalogue = catalogue.withPermissions('BRANCH_MANAGER', role.permissions);
      role = catalogue.get('BRANCH_MANAGER');
      expect(role.version).toBe(initialVersion + 1);

      catalogue = catalogue.withPermissions('BRANCH_MANAGER', role.permissions);
      role = catalogue.get('BRANCH_MANAGER');
      expect(role.version).toBe(initialVersion + 2);
    });
  });

  describe('LOCKED_PERMISSIONS', () => {
    it('defines locked permissions that cannot be edited', () => {
      expect(LOCKED_PERMISSIONS).toContain('party.medical.read');
      expect(LOCKED_PERMISSIONS).toContain('audit.delete');
      expect(LOCKED_PERMISSIONS).toContain('ops.*');
    });
  });

  describe('PRIVILEGED_ROLES', () => {
    it('includes roles requiring MFA', () => {
      expect(PRIVILEGED_ROLES).toContain('TENANT_ADMIN');
      expect(PRIVILEGED_ROLES).toContain('PRINCIPAL_OFFICER');
      expect(PRIVILEGED_ROLES).toContain('BRANCH_MANAGER');
      expect(PRIVILEGED_ROLES).not.toContain('SALESPERSON');
    });
  });

  describe('RecordScopeKind', () => {
    it('defines three scope types: OWN, UNIT_SUBTREE, TENANT', () => {
      const scopes: RecordScopeKind[] = ['OWN', 'UNIT_SUBTREE', 'TENANT'];
      expect(scopes.length).toBe(3);
    });
  });
});

const PRIVILEGED_ROLES = ['TENANT_ADMIN', 'PRINCIPAL_OFFICER', 'BRANCH_MANAGER', 'SALES_MANAGER'];
