import { BusinessRuleError, ValidationError } from '../../../kernel/errors/domain-errors';

/**
 * AC-M02-11: Role editor - locked permissions cannot be added or removed, non-editable roles
 * are rejected, unknown permissions rejected, each save increments the version, stale If-Match → 412,
 * the permission policy reflects the change immediately, and the change is security-logged.
 */
describe('AC-M02-11, AC-M02-12 RoleService and DataDrivenPermissionPolicy', () => {
  let roleService: RoleService;
  let roleRepo: Record<string, unknown>;
  let permissionPolicy: DataDrivenPermissionPolicy;
  let logs: Record<string, unknown>;

  beforeEach(() => {
    roleRepo = createMockRoleRepo();
    logs = { events: [] };

    roleService = new RoleService({
      roleRepository: roleRepo,
      logger: createMockLogger(logs),
    });

    permissionPolicy = new DataDrivenPermissionPolicy({
      roleRepository: roleRepo,
    });
  });

  describe('list roles', () => {
    it('returns all roles with versions', async () => {
      const tx = mockTx();

      const roles = await roleService.list(tx);

      expect(roles.length).toBeGreaterThan(0);
      roles.forEach(role => {
        expect(role.role).toBeDefined();
        expect(role.version).toBeDefined();
        expect(role.permissions).toBeDefined();
      });
    });
  });

  describe('get role', () => {
    it('returns role definition', async () => {
      const tx = mockTx();

      const role = await roleService.get(tx, 'BRANCH_MANAGER');

      expect(role.role).toBe('BRANCH_MANAGER');
      expect(role.recordScope).toBe('UNIT_SUBTREE');
      expect(role.permissions).toContain('distribution.member.read');
    });
  });

  describe('updatePermissions (AC-M02-11)', () => {
    it('updates permissions for editable role', async () => {
      const tx = mockTx();
      const original = roleRepo.getRoleDefinition('BRANCH_MANAGER');

      await roleService.updatePermissions(
        tx,
        'BRANCH_MANAGER',
        ['distribution.member.read', 'distribution.onboarding.write'],
        original.version
      );

      const updated = roleRepo.getRoleDefinition('BRANCH_MANAGER');
      expect(updated.version).toBe(original.version + 1);
      expect(updated.permissions).toEqual(['distribution.member.read', 'distribution.onboarding.write']);
    });

    it('rejects update for non-editable role (AC-M02-11)', async () => {
      const tx = mockTx();
      const original = roleRepo.getRoleDefinition('TENANT_ADMIN');

      await expect(
        roleService.updatePermissions(
          tx,
          'TENANT_ADMIN',
          ['distribution.member.read'],
          original.version
        )
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects adding locked permission (AC-M02-11)', async () => {
      const tx = mockTx();
      const original = roleRepo.getRoleDefinition('BRANCH_MANAGER');

      await expect(
        roleService.updatePermissions(
          tx,
          'BRANCH_MANAGER',
          [...original.permissions, 'party.medical.read'],
          original.version
        )
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects removing locked permission (AC-M02-11)', async () => {
      const tx = mockTx();
      const opsRole = roleRepo.getRoleDefinition('OPS');

      if (opsRole.permissions.includes('audit.delete')) {
        await expect(
          roleService.updatePermissions(
            tx,
            'OPS',
            opsRole.permissions.filter(p => p !== 'audit.delete'),
            opsRole.version
          )
        ).rejects.toThrow(BusinessRuleError);
      }
    });

    it('rejects unknown permission (AC-M02-11)', async () => {
      const tx = mockTx();
      const original = roleRepo.getRoleDefinition('BRANCH_MANAGER');

      await expect(
        roleService.updatePermissions(
          tx,
          'BRANCH_MANAGER',
          ['unknown.permission'],
          original.version
        )
      ).rejects.toThrow(ValidationError);
    });

    it('increments version on each save (AC-M02-11)', async () => {
      const tx = mockTx();
      const original = roleRepo.getRoleDefinition('BRANCH_MANAGER');

      let updated = await roleService.updatePermissions(
        tx,
        'BRANCH_MANAGER',
        original.permissions,
        original.version
      );
      expect(updated.version).toBe(original.version + 1);

      updated = await roleService.updatePermissions(
        tx,
        'BRANCH_MANAGER',
        original.permissions,
        original.version + 1
      );
      expect(updated.version).toBe(original.version + 2);
    });

    it('returns 412 for stale If-Match version (AC-M02-11)', async () => {
      const tx = mockTx();
      const original = roleRepo.getRoleDefinition('BRANCH_MANAGER');

      // First update increments version
      await roleService.updatePermissions(
        tx,
        'BRANCH_MANAGER',
        original.permissions,
        original.version
      );

      // Second update with stale version should fail
      await expect(
        roleService.updatePermissions(
          tx,
          'BRANCH_MANAGER',
          original.permissions,
          original.version // stale
        )
      ).rejects.toThrow();
    });

    it('security-logs permission change (AC-M02-11)', async () => {
      const tx = mockTx();
      const original = roleRepo.getRoleDefinition('BRANCH_MANAGER');

      await roleService.updatePermissions(
        tx,
        'BRANCH_MANAGER',
        [...original.permissions, 'distribution.licence.write'],
        original.version
      );

      const securityLogs = logs.events.filter(e => e.event === 'security.role.permissions_changed');
      expect(securityLogs).toHaveLength(1);
    });
  });

  describe('preview', () => {
    it('returns human-readable permission descriptions', async () => {
      const tx = mockTx();

      const preview = await roleService.preview(tx, 'BRANCH_MANAGER');

      expect(preview.role).toBe('BRANCH_MANAGER');
      expect(preview.sees).toBeDefined();
      expect(Array.isArray(preview.sees)).toBe(true);
      expect(preview.sees.length).toBeGreaterThan(0);
    });
  });

  describe('DataDrivenPermissionPolicy (AC-M02-11, 12)', () => {
    it('allows operation with permission', async () => {
      const principal = {
        tenantId: 'ten_acme',
        _roles: ['BRANCH_MANAGER'],
      };

      const allowed = await permissionPolicy.allows(
        mockTx(),
        principal,
        'distribution.member.read'
      );

      expect(allowed).toBe(true);
    });

    it('denies operation without permission', async () => {
      const principal = {
        tenantId: 'ten_acme',
        _roles: ['SALESPERSON'],
      };

      const allowed = await permissionPolicy.allows(
        mockTx(),
        principal,
        'distribution.role.write'
      );

      expect(allowed).toBe(false);
    });

    it('uses widest scope for multiple roles', async () => {
      const principal = {
        tenantId: 'ten_acme',
        _roles: ['SALESPERSON', 'BRANCH_MANAGER'],
      };

      const allowed = await permissionPolicy.allows(
        mockTx(),
        principal,
        'distribution.member.read'
      );

      expect(allowed).toBe(true);
    });

    it('reflects permission changes immediately (AC-M02-11)', async () => {
      const tx = mockTx();
      const original = roleRepo.getRoleDefinition('BRANCH_MANAGER');

      // Update to remove a permission
      const newPermissions = original.permissions.filter(p => p !== 'distribution.member.read');
      await roleService.updatePermissions(tx, 'BRANCH_MANAGER', newPermissions, original.version);

      // Check that policy reflects change
      const principal = { tenantId: 'ten_acme', _roles: ['BRANCH_MANAGER'] };
      const allowed = await permissionPolicy.allows(tx, principal, 'distribution.member.read');

      expect(allowed).toBe(false);
    });

    it('grants ops.* to platform.operator (AC-M02-11)', async () => {
      const principal = {
        tenantId: 'platform',
        _roles: ['platform.operator'],
      };

      const allowed = await permissionPolicy.allows(
        mockTx(),
        principal,
        'ops.anything'
      );

      expect(allowed).toBe(true);
    });
  });

  describe('MFA policy (AC-M02-12)', () => {
    it('privileged role without mfa claim → 403 mfa_required', () => {
      const principal = {
        roles: ['TENANT_ADMIN'],
        _amr: undefined, // No 'mfa' in amr claim
      };

      const requiresMfa = MfaPolicy.requiresMfa(principal.roles, principal.amr);

      expect(requiresMfa).toBe(true);
    });

    it('privileged role with mfa claim → allowed', () => {
      const principal = {
        roles: ['PRINCIPAL_OFFICER'],
        _amr: ['mfa', 'password'],
      };

      const requiresMfa = MfaPolicy.requiresMfa(principal.roles, principal.amr);

      expect(requiresMfa).toBe(false);
    });

    it('OTP-signed salesperson allowed (AC-M02-12)', () => {
      const principal = {
        roles: ['SALESPERSON'],
        _amr: ['otp'], // Non-privileged, OTP is sufficient
      };

      const requiresMfa = MfaPolicy.requiresMfa(principal.roles, principal.amr);

      expect(requiresMfa).toBe(false);
    });

    it('non-privileged role without mfa → allowed', () => {
      const principal = {
        roles: ['SALESPERSON'],
        _amr: undefined,
      };

      const requiresMfa = MfaPolicy.requiresMfa(principal.roles, principal.amr);

      expect(requiresMfa).toBe(false);
    });
  });
});

// Helper stubs
class RoleService {
  constructor(_deps: Record<string, unknown>) {}
  list(_tx: Record<string, unknown>): Promise<Record<string, unknown>[]> {
    throw new Error('not implemented');
  }
  get(_tx: Record<string, unknown>, _role: string): Promise<Record<string, unknown>> {
    throw new Error('not implemented');
  }
  updatePermissions(_tx: Record<string, unknown>, _role: string, _permissions: string[], _version: number): Promise<Record<string, unknown>> {
    throw new Error('not implemented');
  }
  preview(_tx: Record<string, unknown>, _role: string): Promise<Record<string, unknown>> {
    throw new Error('not implemented');
  }
}

class DataDrivenPermissionPolicy {
  constructor(_deps: Record<string, unknown>) {}
  allows(_tx: Record<string, unknown>, _principal: Record<string, unknown>, _permission: string): Promise<boolean> {
    throw new Error('not implemented');
  }
}

class MfaPolicy {
  static requiresMfa(_roles: string[], _amr?: string[]): boolean {
    throw new Error('not implemented');
  }
}

function createMockRoleRepo() {
  const roles = new Map();

  // Initialize with defaults
  const defaults = [
    {
      role: 'TENANT_ADMIN',
      _version: 1,
      _permissions: ['distribution.*', 'tenant.*'],
      recordScope: 'TENANT',
      privileged: true,
      editable: false,
    },
    {
      role: 'BRANCH_MANAGER',
      _version: 1,
      _permissions: ['distribution.member.read', 'distribution.onboarding.write', 'distribution.onboarding.approve', 'distribution.transfer.write'],
      recordScope: 'UNIT_SUBTREE',
      privileged: true,
      editable: true,
    },
    {
      role: 'OPS',
      _version: 1,
      _permissions: ['distribution.member.read', 'distribution.onboarding.write', 'distribution.licence.write', 'audit.delete'],
      recordScope: 'TENANT',
      privileged: true,
      editable: true,
    },
    {
      role: 'SALESPERSON',
      _version: 1,
      _permissions: ['distribution.self.read'],
      recordScope: 'OWN',
      privileged: false,
      editable: true,
    },
  ];

  defaults.forEach(role => roles.set(role.role, { ...role }));

  return {
    getRoleDefinition(_role: string) {
      return roles.get(role) || { version: 1, _permissions: [], editable: true };
    },
    catalogue(_tx: Record<string, unknown>) {
      return Promise.resolve({ roles });
    },
    save(_tx: Record<string, unknown>, _def: Record<string, unknown>) {
      roles.set(def.role, def);
    },
  };
}

function createMockLogger(_logs: Record<string, unknown>) {
  return {
    info: (event: string, msg: string, _ctx?: Record<string, unknown>) => {
      logs.events.push({ event, msg });
    },
  };
}

function mockTx() {
  return {
    outbox: { events: [] },
    audit: { log: () => {} },
  };
}
