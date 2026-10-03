import { BusinessRuleError, ConflictError } from '../../../kernel/errors/domain-errors';
import { FixedClock } from '../../../kernel/domain/clock';
import { MemoryLogSink } from '../../../kernel/observability/log-sink';

/**
 * AC-M02-02, AC-M02-05, AC-M02-06, AC-M02-07: MemberService handles invite, update,
 * status transitions, and exit with seat limit enforcement, duplicate detection,
 * session revocation, and transfer requirement validation.
 */
describe('AC-M02-02, 05, 06, 07 MemberService', () => {
  let service: MemberService;
  let memberRepo: Record<string, unknown>;
  let orgUnitRepo: Record<string, unknown>;
  let identityAdmin: Record<string, unknown>;
  let clock: FixedClock;
  let logs: MemoryLogSink;

  beforeEach(() => {
    clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    logs = new MemoryLogSink();
    memberRepo = createMockMemberRepository();
    orgUnitRepo = createMockOrgUnitRepository();
    identityAdmin = createMockIdentityAdmin();

    service = new MemberService({
      memberRepository: memberRepo,
      orgUnitRepository: orgUnitRepo,
      identityAdmin,
      clock,
      logger: createMockLogger(logs),
    });
  });

  describe('invite (AC-M02-02, 05)', () => {
    it('creates invited member with role validation', async () => {
      const tx = mockTx();
      const input = {
        displayName: 'John Doe',
        phone: '+919876543210',
        roles: ['SALESPERSON'],
        salespersonType: 'POSP',
        orgUnitId: 'ou_br1',
      };

      const member = await service.invite(tx, 'ten_acme', input);

      expect(member.props.displayName).toBe('John Doe');
      expect(member.props.status).toBe('invited');
      expect(member.props.roles).toContain('SALESPERSON');
      expect(memberRepo.saved).toHaveLength(1);
    });

    it('normalizes and hashes contact for duplicate detection', async () => {
      const tx = mockTx();
      const input = {
        displayName: 'John Doe',
        phone: '+919876543210',
        roles: ['SALESPERSON'],
        salespersonType: 'POSP',
        orgUnitId: 'ou_br1',
      };

      const member = await service.invite(tx, 'ten_acme', input);

      expect(member.props.contactHash).toBeDefined();
      expect(member.props.contactHash.length).toBe(64); // SHA256 hex
    });

    it('rejects duplicate contact in same tenant', async () => {
      const tx = mockTx();
      memberRepo.setExistingContact('ten_acme', 'hash123');

      const input = {
        displayName: 'John Doe',
        phone: '+919876543210',
        roles: ['SALESPERSON'],
        salespersonType: 'POSP',
        orgUnitId: 'ou_br1',
      };

      await expect(service.invite(tx, 'ten_acme', input)).rejects.toThrow(ConflictError);
    });

    it('allows same contact in different tenant (AC-M02-05)', async () => {
      const tx = mockTx();
      memberRepo.setExistingContact('ten_acme', 'hash123');

      const input = {
        displayName: 'John Doe',
        phone: '+919876543210',
        roles: ['SALESPERSON'],
        salespersonType: 'POSP',
        orgUnitId: 'ou_br1',
      };

      const member = await service.invite(tx, 'ten_zen', input);

      expect(member.props.status).toBe('invited');
    });

    it('enforces seat limit (AC-M02-05)', async () => {
      const tx = mockTx();
      memberRepo.setSeatCount(24); // At limit for plan
      memberRepo.setPlanSeatLimit(25);

      const input = {
        displayName: 'John Doe',
        phone: '+919876543210',
        roles: ['SALESPERSON'],
        salespersonType: 'POSP',
        orgUnitId: 'ou_br1',
      };

      await expect(service.invite(tx, 'ten_acme', input)).rejects.toThrow(BusinessRuleError);
    });

    it('calls IdentityAdmin.invite', async () => {
      const tx = mockTx();
      const input = {
        displayName: 'John Doe',
        phone: '+919876543210',
        roles: ['SALESPERSON'],
        salespersonType: 'POSP',
        orgUnitId: 'ou_br1',
      };

      await service.invite(tx, 'ten_acme', input);

      expect(identityAdmin.inviteCalls).toHaveLength(1);
      expect(identityAdmin.inviteCalls[0].tenantId).toBe('ten_acme');
    });

    it('publishes distribution.member.invited event without contact data', async () => {
      const tx = mockTx();
      const input = {
        displayName: 'John Doe',
        phone: '+919876543210',
        roles: ['SALESPERSON'],
        salespersonType: 'POSP',
        orgUnitId: 'ou_br1',
      };

      await service.invite(tx, 'ten_acme', input);

      // Event should be in outbox
      const events = tx.outbox.events;
      expect(events.some(e => e.type === 'distribution.member.invited')).toBe(true);
    });
  });

  describe('acceptInvite', () => {
    it('transitions invited member to onboarding (seller)', async () => {
      const tx = mockTx();
      const member = createMockMember({
        id: 'mem_001',
        status: 'invited',
        salespersonType: 'POSP',
      });
      memberRepo.setMember('mem_001', member);

      await service.acceptInvite(tx, 'mem_001', 'user_ref_001');

      expect(member.props.status).toBe('onboarding');
      expect(member.props.userRef).toBe('user_ref_001');
    });

    it('transitions invited non-seller to active', async () => {
      const tx = mockTx();
      const member = createMockMember({
        id: 'mem_001',
        status: 'invited',
        salespersonType: undefined,
      });
      memberRepo.setMember('mem_001', member);

      await service.acceptInvite(tx, 'mem_001', 'user_ref_001');

      expect(member.props.status).toBe('active');
    });
  });

  describe('update (AC-M02-06)', () => {
    it('updates member roles', async () => {
      const tx = mockTx();
      const member = createMockMember({
        id: 'mem_001',
        roles: ['SALESPERSON'],
      });
      memberRepo.setMember('mem_001', member);

      await service.update(tx, 'mem_001', { roles: ['BRANCH_MANAGER'] }, 1);

      expect(member.props.roles).toContain('BRANCH_MANAGER');
    });

    it('revokes sessions and logs when roles change (AC-M02-06)', async () => {
      const tx = mockTx();
      const member = createMockMember({
        id: 'mem_001',
        roles: ['SALESPERSON'],
        userRef: 'user_ref_001',
      });
      memberRepo.setMember('mem_001', member);

      await service.update(tx, 'mem_001', { roles: ['BRANCH_MANAGER'] }, 1);

      expect(identityAdmin.revokeSessionsCalls).toHaveLength(1);
      expect(identityAdmin.revokeSessionsCalls[0].userRef).toBe('user_ref_001');

      const securityLogs = logs.byEvent('security.member.roles_changed');
      expect(securityLogs).toHaveLength(1);
    });

    it('updates capacity per day', async () => {
      const tx = mockTx();
      const member = createMockMember({
        id: 'mem_001',
        capacityPerDay: 25,
      });
      memberRepo.setMember('mem_001', member);

      await service.update(tx, 'mem_001', { capacityPerDay: 50 }, 1);

      expect(member.props.capacityPerDay).toBe(50);
    });

    it('updates org unit', async () => {
      const tx = mockTx();
      const member = createMockMember({
        id: 'mem_001',
        orgUnitId: 'ou_br1',
      });
      memberRepo.setMember('mem_001', member);

      await service.update(tx, 'mem_001', { orgUnitId: 'ou_br2' }, 1);

      expect(member.props.orgUnitId).toBe('ou_br2');
    });
  });

  describe('transition (AC-M02-06, 07)', () => {
    it('suspends member and revokes sessions (AC-M02-06)', async () => {
      const tx = mockTx();
      const member = createMockMember({
        id: 'mem_001',
        status: 'active',
        userRef: 'user_ref_001',
      });
      memberRepo.setMember('mem_001', member);

      await service.transition(tx, 'mem_001', { to: 'suspended', reason: 'policy_breach' });

      expect(member.props.status).toBe('suspended');
      expect(identityAdmin.revokeSessionsCalls).toHaveLength(1);
      expect(identityAdmin.disableCalls).toHaveLength(1);

      const securityLogs = logs.byEvent('security.member.suspended');
      expect(securityLogs).toHaveLength(1);
    });

    it('reactivates suspended member', async () => {
      const tx = mockTx();
      const member = createMockMember({
        id: 'mem_001',
        status: 'suspended',
      });
      memberRepo.setMember('mem_001', member);

      await service.transition(tx, 'mem_001', { to: 'active', reason: 'appeal_approved' });

      expect(member.props.status).toBe('active');
    });
  });

  describe('exit (AC-M02-07)', () => {
    it('allows non-seller to exit without transfer', async () => {
      const tx = mockTx();
      const member = createMockMember({
        id: 'mem_001',
        status: 'active',
        salespersonType: undefined,
      });
      memberRepo.setMember('mem_001', member);

      await service.exit(tx, 'mem_001', { reason: 'resigned' });

      expect(member.props.status).toBe('exited');
    });

    it('requires transfer target for seller exit (AC-M02-07)', async () => {
      const tx = mockTx();
      const member = createMockMember({
        id: 'mem_001',
        status: 'active',
        salespersonType: 'POSP',
      });
      memberRepo.setMember('mem_001', member);

      await expect(
        service.exit(tx, 'mem_001', { reason: 'resigned' })
      ).rejects.toThrow(BusinessRuleError);
    });

    it('validates transfer target is eligible seller in same tenant', async () => {
      const tx = mockTx();
      const member = createMockMember({
        id: 'mem_001',
        status: 'active',
        salespersonType: 'POSP',
        orgUnitId: 'ou_br1',
      });
      memberRepo.setMember('mem_001', member);

      const invalidTarget = createMockMember({
        id: 'mem_002',
        status: 'suspended', // Not active
        salespersonType: 'POSP',
      });
      memberRepo.setMember('mem_002', invalidTarget);

      await expect(
        service.exit(tx, 'mem_001', {
          transferToMemberId: 'mem_002',
          reason: 'resigned',
        })
      ).rejects.toThrow(BusinessRuleError);
    });

    it('emits distribution.member.exited with transfer target (AC-M02-07)', async () => {
      const tx = mockTx();
      const member = createMockMember({
        id: 'mem_001',
        status: 'active',
        salespersonType: 'POSP',
      });
      const target = createMockMember({
        id: 'mem_002',
        status: 'active',
        salespersonType: 'POSP',
      });
      memberRepo.setMember('mem_001', member);
      memberRepo.setMember('mem_002', target);

      await service.exit(tx, 'mem_001', {
        transferToMemberId: 'mem_002',
        reason: 'resigned',
      });

      const events = tx.outbox.events;
      const exitEvent = events.find(e => e.type === 'distribution.member.exited');
      expect(exitEvent).toBeDefined();
      expect(exitEvent?.data.transferToMemberId).toBe('mem_002');
    });

    it('revokes sessions on exit', async () => {
      const tx = mockTx();
      const member = createMockMember({
        id: 'mem_001',
        status: 'active',
        userRef: 'user_ref_001',
      });
      memberRepo.setMember('mem_001', member);

      await service.exit(tx, 'mem_001', { reason: 'resigned' });

      expect(identityAdmin.revokeSessionsCalls).toHaveLength(1);
      expect(identityAdmin.disableCalls).toHaveLength(1);
    });
  });
});

// Helper stubs
class MemberService {
  constructor(_deps: Record<string, unknown>) {}
  invite(__tx: Record<string, unknown>, __tenantId: string, _input: Record<string, unknown>): Promise<Record<string, unknown>> {
    throw new Error('not implemented');
  }
  acceptInvite(__tx: Record<string, unknown>, __memberId: string, _userRef: string): Promise<void> {
    throw new Error('not implemented');
  }
  update(__tx: Record<string, unknown>, __id: string, _input: Record<string, unknown>, _version: number): Promise<Record<string, unknown>> {
    throw new Error('not implemented');
  }
  transition(__tx: Record<string, unknown>, __id: string, _input: Record<string, unknown>): Promise<Record<string, unknown>> {
    throw new Error('not implemented');
  }
  exit(__tx: Record<string, unknown>, __id: string, _input: Record<string, unknown>): Promise<Record<string, unknown>> {
    throw new Error('not implemented');
  }
}

function createMockMemberRepository() {
  return {
    saved: [],
    contacts: new Map(),
    members: new Map(),
    seatCount: 0,
    planSeatLimit: 50,
    get(_tx: Record<string, unknown>, _id: string) {
      return this.members.get(id);
    },
    save(_tx: Record<string, unknown>, _member: Record<string, unknown>) {
      this.saved.push(member);
      this.members.set(member.props.id, member);
    },
    countSeats() {
      return Promise.resolve(this.seatCount);
    },
    findByContactHash() {
      return Promise.resolve(undefined);
    },
    setSeatCount(count: number) {
      this.seatCount = count;
    },
    setPlanSeatLimit(limit: number) {
      this.planSeatLimit = limit;
    },
    setExistingContact(tenantId: string, hash: string) {
      this.contacts.set(hash, true);
    },
    setMember(id: string, member: Record<string, unknown>) {
      this.members.set(id, member);
    },
  };
}

function createMockOrgUnitRepository() {
  return {
    tree() {
      return Promise.resolve({ get: (id: string) => ({ id }) });
    },
  };
}

function createMockIdentityAdmin() {
  return {
    inviteCalls: [],
    revokeSessionsCalls: [],
    disableCalls: [],
    invite(tenantId: string, member: Record<string, unknown>) {
      this.inviteCalls.push({ tenantId, member });
    },
    revokeSessions(tenantId: string, userRef: string) {
      this.revokeSessionsCalls.push({ tenantId, userRef });
    },
    disable(tenantId: string, userRef: string) {
      this.disableCalls.push({ tenantId, userRef });
    },
  };
}

function createMockMember(_props: Record<string, unknown>) {
  return {
    props: {
      id: 'mem_001',
      status: 'invited',
      displayName: 'John',
      roles: [],
      ...props,
    },
  };
}

function createMockLogger(_logs: MemoryLogSink) {
  return {
    info: (event: string, msg: string, _ctx?: Record<string, unknown>) => {
      logs.write({ ts: new Date().toISOString(), level: 'info' as const, event, msg });
    },
    debug: (event: string, msg: string, _ctx?: Record<string, unknown>) => {
      logs.write({ ts: new Date().toISOString(), level: 'debug' as const, event, msg });
    },
  };
}

function mockTx() {
  return {
    outbox: { events: [] },
    audit: { log: () => {} },
  };
}
