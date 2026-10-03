import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ApiClient } from '../../lib/api/api-client';
import { createDistributionApi } from './api';

describe('Distribution API', () => {
  let mockApiClient: ApiClient;

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    };
  });

  describe('Org Units', () => {
    it('AC-M02-15 calls correct path for getOrgTree', async () => {
      (mockApiClient.get as Mock).mockResolvedValue({ root: {} });

      const api = createDistributionApi(mockApiClient);
      await api.getOrgTree();

      expect((mockApiClient.get as Mock).mock.calls[0][0]).toBe('/api/v1/org-units');
    });

    it('AC-M02-15 includes Idempotency-Key for createOrgUnit', async () => {
      (mockApiClient.post as Mock).mockResolvedValue({ id: 'ou_1' });

      const api = createDistributionApi(mockApiClient);
      await api.createOrgUnit({
        parentId: 'ou_root',
        kind: 'BRANCH',
        name: 'Branch 1',
        territoryCodes: ['T001'],
      });

      const callOptions = (mockApiClient.post as Mock).mock.calls[0][2];
      expect(callOptions.idempotencyKey).toBeDefined();
      expect(typeof callOptions.idempotencyKey).toBe('string');
      expect(callOptions.idempotencyKey.length).toBeGreaterThan(0);
    });

    it('AC-M02-15 includes Idempotency-Key for moveOrgUnit', async () => {
      (mockApiClient.post as Mock).mockResolvedValue({ id: 'ou_1', parentId: 'ou_root' });

      const api = createDistributionApi(mockApiClient);
      await api.moveOrgUnit('ou_1', 'ou_root');

      const callOptions = (mockApiClient.post as Mock).mock.calls[0][2];
      expect(callOptions.idempotencyKey).toBeDefined();
    });
  });

  describe('Members', () => {
    it('AC-M02-13 listMembers constructs correct path and query params', async () => {
      (mockApiClient.get as Mock).mockResolvedValue({ items: [] });

      const api = createDistributionApi(mockApiClient);
      await api.listMembers({
        status: 'active',
        role: 'SALESPERSON',
        orgUnitId: 'ou_branch1',
        salespersonType: 'ISP',
        q: 'John',
        limit: 10,
        cursor: 'abc123',
      });

      expect((mockApiClient.get as Mock).mock.calls[0][0]).toBe('/api/v1/members');
      expect((mockApiClient.get as Mock).mock.calls[0][1]).toEqual({
        query: {
          status: 'active',
          role: 'SALESPERSON',
          orgUnitId: 'ou_branch1',
          salespersonType: 'ISP',
          q: 'John',
          limit: 10,
          cursor: 'abc123',
        },
      });
    });

    it('AC-M02-13 listMembers handles partial filters', async () => {
      (mockApiClient.get as Mock).mockResolvedValue({ items: [] });

      const api = createDistributionApi(mockApiClient);
      await api.listMembers({ status: 'active' });

      const query = (mockApiClient.get as Mock).mock.calls[0][1].query;
      expect(query.status).toBe('active');
      expect(query.role).toBeUndefined();
      expect(query.orgUnitId).toBeUndefined();
    });

    it('AC-M02-05 inviteMember includes Idempotency-Key header', async () => {
      (mockApiClient.post as Mock).mockResolvedValue({ id: 'mem_1' });

      const api = createDistributionApi(mockApiClient);
      await api.inviteMember({
        displayName: 'John Seller',
        phone: '+91-1234-5678-9012',
        email: 'john@example.com',
        roles: ['SALESPERSON'],
        salespersonType: 'ISP',
        orgUnitId: 'ou_branch1',
      });

      const callOptions = (mockApiClient.post as Mock).mock.calls[0][2];
      expect(callOptions.idempotencyKey).toBeDefined();
    });

    it('AC-M02-13 getMember calls correct path', async () => {
      (mockApiClient.get as Mock).mockResolvedValue({ id: 'mem_1' });

      const api = createDistributionApi(mockApiClient);
      await api.getMember('mem_1');

      expect((mockApiClient.get as Mock).mock.calls[0][0]).toBe('/api/v1/members/mem_1');
    });

    it('AC-M02-06 updateMember includes If-Match header', async () => {
      (mockApiClient.patch as Mock).mockResolvedValue({ id: 'mem_1' });

      const api = createDistributionApi(mockApiClient);
      await api.updateMember('mem_1', { roles: ['BRANCH_MANAGER'] }, 'v2');

      const callOptions = (mockApiClient.patch as Mock).mock.calls[0][2];
      expect(callOptions.ifMatch).toBe('v2');
    });

    it('AC-M02-06 transitionMemberStatus includes Idempotency-Key', async () => {
      (mockApiClient.post as Mock).mockResolvedValue({ id: 'mem_1', status: 'suspended' });

      const api = createDistributionApi(mockApiClient);
      await api.transitionMemberStatus('mem_1', 'suspended', 'Performance issues');

      const path = (mockApiClient.post as Mock).mock.calls[0][0];
      expect(path).toBe('/api/v1/members/mem_1/status-transitions');

      const callOptions = (mockApiClient.post as Mock).mock.calls[0][2];
      expect(callOptions.idempotencyKey).toBeDefined();
    });

    it('AC-M02-07 exitMember includes Idempotency-Key', async () => {
      (mockApiClient.post as Mock).mockResolvedValue({ id: 'mem_1', status: 'exited' });

      const api = createDistributionApi(mockApiClient);
      await api.exitMember('mem_1', {
        transferToMemberId: 'mem_2',
        reason: 'Resignation',
      });

      const path = (mockApiClient.post as Mock).mock.calls[0][0];
      expect(path).toBe('/api/v1/members/mem_1/exit');

      const callOptions = (mockApiClient.post as Mock).mock.calls[0][2];
      expect(callOptions.idempotencyKey).toBeDefined();
    });
  });

  describe('Onboarding', () => {
    it('AC-M02-04 recordEvidence includes Idempotency-Key', async () => {
      (mockApiClient.post as Mock).mockResolvedValue({ checklist: [] });

      const api = createDistributionApi(mockApiClient);
      await api.recordEvidence('mem_1', 'IDENTITY_PAN', {
        evidenceRef: 'ref_123',
        note: 'PAN verified',
      });

      const path = (mockApiClient.post as Mock).mock.calls[0][0];
      expect(path).toBe('/api/v1/members/mem_1/onboarding/evidence');

      const callOptions = (mockApiClient.post as Mock).mock.calls[0][2];
      expect(callOptions.idempotencyKey).toBeDefined();
    });

    it('AC-M02-04 logTraining includes Idempotency-Key', async () => {
      (mockApiClient.post as Mock).mockResolvedValue({ checklist: [] });

      const api = createDistributionApi(mockApiClient);
      await api.logTraining('mem_1', { hours: 5, evidenceRef: 'ref_456' });

      const path = (mockApiClient.post as Mock).mock.calls[0][0];
      expect(path).toBe('/api/v1/members/mem_1/onboarding/training');

      const callOptions = (mockApiClient.post as Mock).mock.calls[0][2];
      expect(callOptions.idempotencyKey).toBeDefined();
    });

    it('AC-M02-04 setInsurerCode calls correct path', async () => {
      (mockApiClient.put as Mock).mockResolvedValue({ insurerId: 'ins_1', code: 'CODE123' });

      const api = createDistributionApi(mockApiClient);
      await api.setInsurerCode('mem_1', 'ins_1', 'CODE123');

      const path = (mockApiClient.put as Mock).mock.calls[0][0];
      expect(path).toBe('/api/v1/members/mem_1/insurer-codes/ins_1');
    });

    it('AC-M02-04 activateMember includes Idempotency-Key', async () => {
      (mockApiClient.post as Mock).mockResolvedValue({ id: 'mem_1', status: 'active' });

      const api = createDistributionApi(mockApiClient);
      await api.activateMember('mem_1');

      const path = (mockApiClient.post as Mock).mock.calls[0][0];
      expect(path).toBe('/api/v1/members/mem_1/activation');

      const callOptions = (mockApiClient.post as Mock).mock.calls[0][2];
      expect(callOptions.idempotencyKey).toBeDefined();
    });
  });

  describe('Licences', () => {
    it('AC-M02-08 recordLicence includes Idempotency-Key', async () => {
      (mockApiClient.post as Mock).mockResolvedValue({
        id: 'lic_1',
        memberId: 'mem_1',
        kind: 'POSP_LIFE',
        number: 'LIC123',
        validFrom: '2024-01-01',
        validTo: '2025-12-31',
      });

      const api = createDistributionApi(mockApiClient);
      await api.recordLicence('mem_1', {
        kind: 'POSP_LIFE',
        number: 'LIC123',
        validFrom: '2024-01-01',
        validTo: '2025-12-31',
      });

      const callOptions = (mockApiClient.post as Mock).mock.calls[0][2];
      expect(callOptions.idempotencyKey).toBeDefined();
    });

    it('AC-M02-08 listExpiringLicences passes withinDays query param', async () => {
      (mockApiClient.get as Mock).mockResolvedValue({ items: [] });

      const api = createDistributionApi(mockApiClient);
      await api.listExpiringLicences(30);

      expect((mockApiClient.get as Mock).mock.calls[0][0]).toBe('/api/v1/licences/expiring');
      expect((mockApiClient.get as Mock).mock.calls[0][1]).toEqual({
        query: { withinDays: 30 },
      });
    });

    it('AC-M02-08 listExpiringLicences defaults withinDays to 60', async () => {
      (mockApiClient.get as Mock).mockResolvedValue({ items: [] });

      const api = createDistributionApi(mockApiClient);
      await api.listExpiringLicences();

      expect((mockApiClient.get as Mock).mock.calls[0][1]).toEqual({
        query: { withinDays: 60 },
      });
    });
  });

  describe('Roles', () => {
    it('AC-M02-11 listRoles calls correct path', async () => {
      (mockApiClient.get as Mock).mockResolvedValue({ items: [] });

      const api = createDistributionApi(mockApiClient);
      await api.listRoles();

      expect((mockApiClient.get as Mock).mock.calls[0][0]).toBe('/api/v1/roles');
    });

    it('AC-M02-16 getRolePreview calls correct path', async () => {
      (mockApiClient.get as Mock).mockResolvedValue({ role: 'BRANCH_MANAGER', sees: [] });

      const api = createDistributionApi(mockApiClient);
      await api.getRolePreview('BRANCH_MANAGER');

      expect((mockApiClient.get as Mock).mock.calls[0][0]).toBe('/api/v1/roles/BRANCH_MANAGER/preview');
    });

    it('AC-M02-11 updateRolePermissions includes If-Match header', async () => {
      (mockApiClient.put as Mock).mockResolvedValue({
        role: 'BRANCH_MANAGER',
        version: 2,
        permissions: ['distribution.member.read'],
        recordScope: 'UNIT_SUBTREE',
        privileged: true,
        editable: true,
        etag: 'v2',
      });

      const api = createDistributionApi(mockApiClient);
      await api.updateRolePermissions('BRANCH_MANAGER', ['distribution.member.read'], 'v1');

      const path = (mockApiClient.put as Mock).mock.calls[0][0];
      expect(path).toBe('/api/v1/roles/BRANCH_MANAGER/permissions');

      const callOptions = (mockApiClient.put as Mock).mock.calls[0][2];
      expect(callOptions.ifMatch).toBe('v1');
    });
  });

  describe('Idempotency Key Generation', () => {
    it('generates unique Idempotency-Key for each call', async () => {
      (mockApiClient.post as Mock).mockResolvedValue({ id: 'mem_1' });

      const api = createDistributionApi(mockApiClient);

      await api.inviteMember({
        displayName: 'John',
        roles: ['SALESPERSON'],
        orgUnitId: 'ou_1',
      });

      await api.inviteMember({
        displayName: 'Jane',
        roles: ['SALESPERSON'],
        orgUnitId: 'ou_1',
      });

      const key1 = (mockApiClient.post as Mock).mock.calls[0][2].idempotencyKey;
      const key2 = (mockApiClient.post as Mock).mock.calls[1][2].idempotencyKey;

      expect(key1).not.toBe(key2);
    });
  });
});
