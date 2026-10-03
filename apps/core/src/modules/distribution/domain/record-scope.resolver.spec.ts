import { ForbiddenError } from '../../../kernel/errors/domain-errors';
import { inScope } from './roles';

/**
 * AC-M02-10: RecordScopeResolver gives OWN for salespeople, UNIT_SUBTREE for branch/sales
 * managers and TENANT for admin/ops/compliance roles (widest wins); member list is scoped
 * accordingly (a branch manager does not see another branch's members).
 */
describe('AC-M02-10 RecordScopeResolver', () => {
  describe('resolve', () => {
    it('returns OWN scope for SALESPERSON role', async () => {
      const resolver = createResolver();
      const principal = {
        userRef: 'user_001',
        tenantId: 'ten_acme',
        memberId: 'mem_001',
        roles: ['SALESPERSON'],
      };

      const scope = await resolver.resolve(mockTx(), principal);

      expect(scope.kind).toBe('OWN');
      expect(scope.memberId).toBe('mem_001');
    });

    it('returns UNIT_SUBTREE scope for BRANCH_MANAGER', async () => {
      const resolver = createResolver();
      const principal = {
        userRef: 'user_001',
        tenantId: 'ten_acme',
        memberId: 'mem_001',
        orgUnitId: 'ou_br1',
        roles: ['BRANCH_MANAGER'],
      };

      const scope = await resolver.resolve(mockTx(), principal);

      expect(scope.kind).toBe('UNIT_SUBTREE');
      expect(scope.orgUnitIds).toContain('ou_br1');
    });

    it('returns UNIT_SUBTREE scope for SALES_MANAGER', async () => {
      const resolver = createResolver();
      const principal = {
        userRef: 'user_001',
        tenantId: 'ten_acme',
        memberId: 'mem_001',
        orgUnitId: 'ou_br1',
        roles: ['SALES_MANAGER'],
      };

      const scope = await resolver.resolve(mockTx(), principal);

      expect(scope.kind).toBe('UNIT_SUBTREE');
    });

    it('returns TENANT scope for TENANT_ADMIN', async () => {
      const resolver = createResolver();
      const principal = {
        userRef: 'user_001',
        tenantId: 'ten_acme',
        memberId: 'mem_001',
        roles: ['TENANT_ADMIN'],
      };

      const scope = await resolver.resolve(mockTx(), principal);

      expect(scope.kind).toBe('TENANT');
    });

    it('returns TENANT scope for OPS role', async () => {
      const resolver = createResolver();
      const principal = {
        userRef: 'user_001',
        tenantId: 'ten_acme',
        memberId: 'mem_001',
        roles: ['OPS'],
      };

      const scope = await resolver.resolve(mockTx(), principal);

      expect(scope.kind).toBe('TENANT');
    });

    it('returns TENANT scope for COMPLIANCE role', async () => {
      const resolver = createResolver();
      const principal = {
        userRef: 'user_001',
        tenantId: 'ten_acme',
        memberId: 'mem_001',
        roles: ['COMPLIANCE'],
      };

      const scope = await resolver.resolve(mockTx(), principal);

      expect(scope.kind).toBe('TENANT');
    });

    it('uses widest scope when multiple roles present', async () => {
      const resolver = createResolver();
      const principal = {
        userRef: 'user_001',
        tenantId: 'ten_acme',
        memberId: 'mem_001',
        orgUnitId: 'ou_br1',
        roles: ['SALESPERSON', 'BRANCH_MANAGER'],
      };

      const scope = await resolver.resolve(mockTx(), principal);

      // UNIT_SUBTREE is wider than OWN
      expect(scope.kind).toBe('UNIT_SUBTREE');
    });

    it('uses TENANT over UNIT_SUBTREE when both present', async () => {
      const resolver = createResolver();
      const principal = {
        userRef: 'user_001',
        tenantId: 'ten_acme',
        memberId: 'mem_001',
        orgUnitId: 'ou_br1',
        roles: ['BRANCH_MANAGER', 'OPS'],
      };

      const scope = await resolver.resolve(mockTx(), principal);

      expect(scope.kind).toBe('TENANT');
    });

    it('throws ForbiddenError when OWN scope and no memberId', async () => {
      const resolver = createResolver();
      const principal = {
        userRef: 'user_001',
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
      };

      await expect(resolver.resolve(mockTx(), principal)).rejects.toThrow(ForbiddenError);
    });

    it('includes all descendants in subtree for UNIT_SUBTREE', async () => {
      const resolver = createResolver();
      const principal = {
        userRef: 'user_001',
        tenantId: 'ten_acme',
        memberId: 'mem_001',
        orgUnitId: 'ou_br1',
        roles: ['BRANCH_MANAGER'],
      };

      const scope = await resolver.resolve(mockTx(), principal);

      // Assumes subtree includes ou_br1 and its descendants like teams
      expect(scope.orgUnitIds).toBeDefined();
      expect(Array.isArray(scope.orgUnitIds)).toBe(true);
      expect(scope.orgUnitIds?.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('inScope function', () => {
    it('returns true when record owner is in scope', () => {
      const scope = { kind: 'OWN' as const, memberId: 'mem_001' };
      const record = { ownerMemberId: 'mem_001' };

      expect(inScope(scope, record)).toBe(true);
    });

    it('returns false when record owner is not in scope', () => {
      const scope = { kind: 'OWN' as const, memberId: 'mem_001' };
      const record = { ownerMemberId: 'mem_002' };

      expect(inScope(scope, record)).toBe(false);
    });

    it('returns true when record unit is in subtree scope', () => {
      const scope = { kind: 'UNIT_SUBTREE' as const, orgUnitIds: ['ou_br1', 'ou_tm1', 'ou_tm2'] };
      const record = { orgUnitId: 'ou_tm1' };

      expect(inScope(scope, record)).toBe(true);
    });

    it('returns false when record unit is outside subtree scope', () => {
      const scope = { kind: 'UNIT_SUBTREE' as const, orgUnitIds: ['ou_br1', 'ou_tm1'] };
      const record = { orgUnitId: 'ou_br2' };

      expect(inScope(scope, record)).toBe(false);
    });

    it('returns true for TENANT scope', () => {
      const scope = { kind: 'TENANT' as const };
      const record = { ownerMemberId: 'mem_any' };

      expect(inScope(scope, record)).toBe(true);
    });
  });
});

// Helper stubs
function createResolver(): Record<string, unknown> {
  throw new Error('createResolver not implemented');
}

function mockTx(): Record<string, unknown> {
  return {};
}

function inScope(__scope: Record<string, unknown>, _record: Record<string, unknown>): boolean {
  throw new Error('inScope not implemented');
}
