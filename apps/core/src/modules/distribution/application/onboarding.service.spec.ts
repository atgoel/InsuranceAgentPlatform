import { BusinessRuleError } from '../../../kernel/errors/domain-errors';

 
/**
 * AC-M02-03, AC-M02-04: OnboardingService handles checklist evidence, training, insurer codes,
 * and activation with permission checks and selling scope emission.
 */
describe('AC-M02-03, AC-M02-04 OnboardingService', () => {
  let service: OnboardingService;
  let checklistRepo: Record<string, unknown>;
  let memberRepo: Record<string, unknown>;
  let licenceRepo: Record<string, unknown>;
  let logs: Record<string, unknown>;

  beforeEach(() => {
    checklistRepo = createMockChecklistRepo();
    memberRepo = createMockMemberRepo();
    licenceRepo = createMockLicenceRepo();
    logs = { events: [] };

    service = new OnboardingService({
      checklistRepository: checklistRepo,
      memberRepository: memberRepo,
      licenceRepository: licenceRepo,
      logger: createMockLogger(logs),
    });
  });

  describe('get', () => {
    it('returns checklist for member', async () => {
      const tx = mockTx();
      const checklist = createMockChecklist('POSP', false);
      checklistRepo.setChecklist('mem_001', checklist);

      const result = await service.get(tx, 'mem_001');

      expect(result).toBeDefined();
    });
  });

  describe('recordEvidence (AC-M02-03)', () => {
    it('records evidence for identity item', async () => {
      const tx = mockTx();
      const checklist = createMockChecklist('POSP', false);
      checklistRepo.setChecklist('mem_001', checklist);

      await service.recordEvidence(tx, 'mem_001', 'IDENTITY_PAN', {
        evidenceRef: 'kyc_ref_001',
      }, now);

      const items = checklist.items();
      const identityItem = items.find(i => i.key === 'IDENTITY_PAN');
      expect(identityItem?.done).toBe(true);
    });

    it('rejects recording TRAINING evidence (only via logTraining)', async () => {
      const tx = mockTx();
      const checklist = createMockChecklist('POSP', false);
      checklistRepo.setChecklist('mem_001', checklist);

      await expect(
        service.recordEvidence(tx, 'mem_001', 'TRAINING', {
          evidenceRef: 'train_ref_001',
        }, now)
      ).rejects.toThrow();
    });
  });

  describe('logTraining (AC-M02-03)', () => {
    it('logs training hours', async () => {
      const tx = mockTx();
      const checklist = createMockChecklist('POSP', false);
      checklistRepo.setChecklist('mem_001', checklist);

      await service.logTraining(tx, 'mem_001', { hours: 10, _evidenceRef: 'cert_ref_001' }, now);

      const items = checklist.items();
      const trainingItem = items.find(i => i.key === 'TRAINING');
      expect(trainingItem?.hoursLogged).toBe(10);
    });

    it('marks training complete when hours meet requirement (AC-M02-03)', async () => {
      const tx = mockTx();
      const checklist = createMockChecklist('POSP', false);
      checklistRepo.setChecklist('mem_001', checklist);

      await service.logTraining(tx, 'mem_001', { hours: 10, _evidenceRef: 'cert_ref_001' }, now);
      await service.logTraining(tx, 'mem_001', { hours: 5, _evidenceRef: 'cert_ref_002' }, now);

      const items = checklist.items();
      const trainingItem = items.find(i => i.key === 'TRAINING');
      expect(trainingItem?.done).toBe(true);
    });
  });

  describe('mapInsurerCode', () => {
    it('maps insurer code to member', async () => {
      const tx = mockTx();
      const checklist = createMockChecklist('POSP', false);
      checklistRepo.setChecklist('mem_001', checklist);

      await service.mapInsurerCode(tx, 'mem_001', {
        insurerId: 'ins_001',
        code: 'POSP_CODE_123',
      });

      const items = checklist.items();
      const codeItem = items.find(i => i.key === 'INSURER_CODE');
      expect(codeItem?.done).toBe(true);
    });

    it('rejects duplicate code for same insurer', async () => {
      const tx = mockTx();
      const checklist = createMockChecklist('POSP', false);
      checklistRepo.setChecklist('mem_001', checklist);
      licenceRepo.setInsurerCodeExists('ten_acme', 'ins_001', 'POSP_CODE_123');

      await expect(
        service.mapInsurerCode(tx, 'mem_001', {
          insurerId: 'ins_001',
          code: 'POSP_CODE_123',
        })
      ).rejects.toThrow();
    });
  });

  describe('activate (AC-M02-04)', () => {
    it('rejects activation without distribution.onboarding.approve permission', async () => {
      const tx = mockTx();
      const member = createMockMember('mem_001', 'POSP');
      memberRepo.setMember('mem_001', member);
      const checklist = createMockChecklist('POSP', true);
      checklistRepo.setChecklist('mem_001', checklist);

      const principal = { roles: ['SALESPERSON'] };

      await expect(
        service.activate(tx, 'mem_001', principal)
      ).rejects.toThrow();
    });

    it('rejects activation with incomplete checklist (AC-M02-04)', async () => {
      const tx = mockTx();
      const member = createMockMember('mem_001', 'POSP');
      memberRepo.setMember('mem_001', member);
      const checklist = createMockChecklist('POSP', false); // incomplete
      checklistRepo.setChecklist('mem_001', checklist);

      const principal = { roles: ['PRINCIPAL_OFFICER'] };

      await expect(
        service.activate(tx, 'mem_001', principal)
      ).rejects.toThrow(BusinessRuleError);
    });

    it('activates seller with complete checklist (AC-M02-04)', async () => {
      const tx = mockTx();
      const member = createMockMember('mem_001', 'POSP');
      memberRepo.setMember('mem_001', member);
      const checklist = createMockChecklist('POSP', true);
      checklistRepo.setChecklist('mem_001', checklist);

      const principal = { roles: ['PRINCIPAL_OFFICER'] };

      await service.activate(tx, 'mem_001', principal);

      expect(member.props.status).toBe('active');
    });

    it('emits distribution.member.activated with selling scope (AC-M02-04)', async () => {
      const tx = mockTx();
      const member = createMockMember('mem_001', 'POSP');
      memberRepo.setMember('mem_001', member);
      const checklist = createMockChecklist('POSP', true);
      checklistRepo.setChecklist('mem_001', checklist);
      licenceRepo.setMemberLicence('mem_001', {
        kind: 'POSP_LIFE',
        validTo: '2027-01-01',
      });

      const principal = { roles: ['PRINCIPAL_OFFICER'] };

      await service.activate(tx, 'mem_001', principal);

      const events = tx.outbox.events;
      const activatedEvent = events.find(e => e.type === 'distribution.member.activated');
      expect(activatedEvent).toBeDefined();
      expect(activatedEvent?.data.memberId).toBe('mem_001');
      expect(activatedEvent?.data.salespersonType).toBe('POSP');
      expect(activatedEvent?.data.sellingScope).toBeDefined();
    });

    it('sets posEligibleOnly based on salesperson type (AC-M02-04)', async () => {
      const tx = mockTx();
      const member = createMockMember('mem_001', 'POSP');
      memberRepo.setMember('mem_001', member);
      const checklist = createMockChecklist('POSP', true);
      checklistRepo.setChecklist('mem_001', checklist);

      const principal = { roles: ['PRINCIPAL_OFFICER'] };

      await service.activate(tx, 'mem_001', principal);

      const events = tx.outbox.events;
      const activatedEvent = events.find(e => e.type === 'distribution.member.activated');
      expect(activatedEvent?.data.sellingScope.posEligibleOnly).toBe(true);
    });

    it('returns missing items in error details when incomplete', async () => {
      const tx = mockTx();
      const member = createMockMember('mem_001', 'POSP');
      memberRepo.setMember('mem_001', member);
      const checklist = createMockChecklist('POSP', false);
      checklist.missing = () => ['TRAINING', 'EXAM'];
      checklistRepo.setChecklist('mem_001', checklist);

      const principal = { roles: ['PRINCIPAL_OFFICER'] };

      try {
        await service.activate(tx, 'mem_001', principal);
      } catch (error: Record<string, unknown>) {
        expect(error.details?.missing).toEqual(['TRAINING', 'EXAM']);
      }
    });
  });
});

// Helper stubs
class OnboardingService {
  constructor(_deps: Record<string, unknown>) {}
  get(_tx: Record<string, unknown>, _memberId: string): Promise<Record<string, unknown>> {
    throw new Error('not implemented');
  }
  // eslint-disable-next-line max-params
  recordEvidence(_tx: Record<string, unknown>, _memberId: string, _key: string, _input: Record<string, unknown>, _now: Date): Promise<void> {
    throw new Error('not implemented');
  }
  logTraining(_tx: Record<string, unknown>, _memberId: string, _input: Record<string, unknown>, _now: Date): Promise<void> {
    throw new Error('not implemented');
  }
  mapInsurerCode(_tx: Record<string, unknown>, _memberId: string, _input: Record<string, unknown>): Promise<void> {
    throw new Error('not implemented');
  }
  activate(_tx: Record<string, unknown>, _memberId: string, _principal: Record<string, unknown>): Promise<Record<string, unknown>> {
    throw new Error('not implemented');
  }
}

function createMockChecklistRepo() {
  const checklists = new Map();
  return {
    checklists,
    setChecklist(memberId: string, checklist: Record<string, unknown>) {
      checklists.set(memberId, checklist);
    },
    get(_tx: Record<string, unknown>, _memberId: string) {
      return Promise.resolve(checklists.get(memberId));
    },
    save(_tx: Record<string, unknown>, _memberId: string, checklist: Record<string, unknown>) {
      checklists.set(memberId, checklist);
    },
  };
}

function createMockMemberRepo() {
  const members = new Map();
  return {
    members,
    setMember(memberId: string, member: Record<string, unknown>) {
      members.set(memberId, member);
    },
    get(_tx: Record<string, unknown>, _memberId: string) {
      return Promise.resolve(members.get(memberId));
    },
    save(_tx: Record<string, unknown>, _member: Record<string, unknown>) {
      members.set(member.props.id, member);
    },
  };
}

function createMockLicenceRepo() {
  return {
    insurerCodes: new Map(),
    licences: new Map(),
    setInsurerCodeExists(tenantId: string, insurerId: string, code: string) {
      this.insurerCodes.set(`${insurerId}:${code}`, true);
    },
    setMemberLicence(memberId: string, licence: Record<string, unknown>) {
      if (!this.licences.has(memberId)) {
        this.licences.set(memberId, []);
      }
      this.licences.get(memberId).push(licence);
    },
    listForMember(_tx: Record<string, unknown>, _memberId: string) {
      return Promise.resolve(this.licences.get(memberId) || []);
    },
  };
}

function createMockChecklist(_type: string, isComplete: boolean) {
  return {
    type,
    items: () => [
      { key: 'IDENTITY_PAN', done: isComplete },
      { key: 'TRAINING', done: isComplete, hoursLogged: isComplete ? 15 : 0, hoursRequired: 15 },
      { key: 'EXAM', done: isComplete },
      { key: 'CERTIFICATE', done: isComplete },
      { key: 'INSURER_CODE', done: isComplete },
    ],
    isComplete: () => isComplete,
    missing: () => isComplete ? [] : ['TRAINING'],
    recordEvidence(_key: string, _input: Record<string, unknown>, _now: Date) {
      const item = this.items().find(i => i.key === key);
      if (item) item.done = true;
    },
    logTraining(hours: number, _evidenceRef: string, _now: Date) {
      const item = this.items().find(i => i.key === 'TRAINING');
      if (item) {
        item.hoursLogged = (item.hoursLogged || 0) + hours;
        item.done = item.hoursLogged >= item.hoursRequired;
      }
    },
    markInsurerCodeMapped(_now: Date) {
      const item = this.items().find(i => i.key === 'INSURER_CODE');
      if (item) item.done = true;
    },
  };
}

function createMockMember(_memberId: string, salespersonType: string) {
  return {
    props: {
      id: memberId,
      status: 'onboarding',
      displayName: 'John',
      salespersonType,
      orgUnitId: 'ou_br1',
      _roles: ['SALESPERSON'],
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
