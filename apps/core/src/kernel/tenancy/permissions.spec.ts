import { RolePermissionMatrix, hasPermission } from './permissions';

describe('permissions (AC-M00-19)', () => {
  describe('RolePermissionMatrix', () => {
    it('accumulates grants from several modules for the same role', () => {
      const matrix = new RolePermissionMatrix();
      matrix.grant('SALESPERSON', ['tenant.read']);
      matrix.grant('SALESPERSON', ['party.read', 'tenant.read']);
      expect([...matrix.permissionsFor(['SALESPERSON'])].sort()).toEqual(['me.read', 'party.read', 'telemetry.write', 'tenant.read']);
    });

    it('grants permissions for a role', () => {
      const matrix = new RolePermissionMatrix();
      matrix.grant('crm.agent', ['crm.lead.read', 'crm.lead.write']);

      const perms = matrix.permissionsFor(['crm.agent']);
      expect(perms).toContain('crm.lead.read');
      expect(perms).toContain('crm.lead.write');
    });

    it('returns union of permissions for multiple roles', () => {
      const matrix = new RolePermissionMatrix();
      matrix.grant('crm.agent', ['crm.lead.read']);
      matrix.grant('compliance', ['compliance.review']);

      const perms = matrix.permissionsFor(['crm.agent', 'compliance']);
      expect(perms).toContain('crm.lead.read');
      expect(perms).toContain('compliance.review');
    });

    it('returns empty set for unknown roles', () => {
      const matrix = new RolePermissionMatrix();

      const perms = matrix.permissionsFor(['unknown.role']);
      expect(perms.size).toBe(0);
    });

    it('grants platform.operator the ops.* wildcard permission', () => {
      const matrix = new RolePermissionMatrix();

      const perms = matrix.permissionsFor(['platform.operator']);
      expect(perms).toContain('ops.*');
    });

    it('grants every authenticated role me.read and telemetry.write', () => {
      const matrix = new RolePermissionMatrix();
      matrix.grant('crm.agent', ['crm.lead.read']);

      const perms = matrix.permissionsFor(['crm.agent']);
      expect(perms).toContain('me.read');
      expect(perms).toContain('telemetry.write');
    });

    it('does not grant permissions when an empty role list is provided', () => {
      const matrix = new RolePermissionMatrix();
      matrix.grant('crm.agent', ['crm.lead.read']);

      const perms = matrix.permissionsFor([]);
      expect(perms.size).toBe(0);
    });
  });

  describe('hasPermission', () => {
    it('matches exact permission', () => {
      const granted = new Set(['crm.lead.read']);

      expect(hasPermission(granted, 'crm.lead.read')).toBe(true);
    });

    it('matches wildcard permission suffix', () => {
      const granted = new Set(['crm.*']);

      expect(hasPermission(granted, 'crm.lead.read')).toBe(true);
      expect(hasPermission(granted, 'crm.lead.write')).toBe(true);
    });

    it('does not match partial wildcard', () => {
      const granted = new Set(['crm.lead.*']);

      expect(hasPermission(granted, 'crm.lead.read')).toBe(true);
      expect(hasPermission(granted, 'crm.lead.write')).toBe(true);
      expect(hasPermission(granted, 'crm.other.read')).toBe(false);
    });

    it('denies missing permission', () => {
      const granted = new Set(['crm.lead.read']);

      expect(hasPermission(granted, 'crm.lead.write')).toBe(false);
    });

    it('handles ops.* wildcard for operators', () => {
      const granted = new Set(['ops.*']);

      expect(hasPermission(granted, 'ops.log_overrides')).toBe(true);
      expect(hasPermission(granted, 'ops.debug_tokens')).toBe(true);
    });

    it('AC-M00-19 member.read implies licence.read, but not the reverse or licence.write', () => {
      const memberReader = new Set(['distribution.member.read']);

      expect(hasPermission(memberReader, 'distribution.licence.read')).toBe(true);
      expect(hasPermission(memberReader, 'distribution.licence.write')).toBe(false);
      expect(hasPermission(new Set(['distribution.licence.read']), 'distribution.member.read')).toBe(false);
      expect(hasPermission(new Set(['distribution.self.read']), 'distribution.licence.read')).toBe(false);
    });

    it('denies when empty set is provided', () => {
      const granted = new Set<string>();

      expect(hasPermission(granted, 'crm.lead.read')).toBe(false);
    });
  });
});
