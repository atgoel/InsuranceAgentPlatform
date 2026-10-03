import { ValidationError } from '../../../kernel/errors/domain-errors';
import { OnboardingChecklist } from './onboarding';

const now = new Date('2026-01-01T00:00:00Z');

/**
 * AC-M02-03: Checklist templates differ by salesperson type (POSP 15 h, ISP 25 h training,
 * employee identity + insurer code, solo none); training completes only when logged hours reach
 * the requirement; missing() lists open items.
 */
describe('AC-M02-03 OnboardingChecklist', () => {

  describe('POSP template', () => {
    it('includes all 5 items with 15 hour training requirement', () => {
      const checklist = OnboardingChecklist.for('POSP');

      const items = checklist.items();
      expect(items.length).toBe(5);

      const trainingItem = items.find(i => i.key === 'TRAINING');
      expect(trainingItem?.hoursRequired).toBe(15);
      expect(trainingItem?.done).toBe(false);
    });

    it('marks all items as incomplete initially', () => {
      const checklist = OnboardingChecklist.for('POSP');

      const items = checklist.items();
      items.forEach(item => {
        expect(item.done).toBe(false);
      });
    });

    it('records evidence for identity', () => {
      const checklist = OnboardingChecklist.for('POSP');

      checklist.recordEvidence('IDENTITY_PAN', { evidenceRef: 'kyc_ref_001' }, now);

      const item = checklist.items().find(i => i.key === 'IDENTITY_PAN');
      expect(item?.done).toBe(true);
      expect(item?.evidenceRef).toBe('kyc_ref_001');
      expect(item?.completedAt).toBeDefined();
    });

    it('rejects recording training evidence', () => {
      const checklist = OnboardingChecklist.for('POSP');

      expect(() => {
        checklist.recordEvidence('TRAINING', { evidenceRef: 'train_ref_001' }, now);
      }).toThrow();
    });

    it('marks training complete when hours logged meet requirement', () => {
      const checklist = OnboardingChecklist.for('POSP');

      checklist.logTraining(10, 'cert_ref_001', now);
      let trainingItem = checklist.items().find(i => i.key === 'TRAINING');
      expect(trainingItem?.done).toBe(false);
      expect(trainingItem?.hoursLogged).toBe(10);

      checklist.logTraining(5, 'cert_ref_002', now);
      trainingItem = checklist.items().find(i => i.key === 'TRAINING');
      expect(trainingItem?.done).toBe(true);
      expect(trainingItem?.hoursLogged).toBe(15);
    });

    it('marks insurer code as complete when mapped', () => {
      const checklist = OnboardingChecklist.for('POSP');

      checklist.markInsurerCodeMapped(now);

      const item = checklist.items().find(i => i.key === 'INSURER_CODE');
      expect(item?.done).toBe(true);
      expect(item?.completedAt).toBeDefined();
    });

    it('returns missing items', () => {
      const checklist = OnboardingChecklist.for('POSP');

      checklist.recordEvidence('IDENTITY_PAN', { evidenceRef: 'kyc_ref_001' }, now);
      const missing = checklist.missing();

      expect(missing).toContain('TRAINING');
      expect(missing).toContain('EXAM');
      expect(missing).toContain('CERTIFICATE');
      expect(missing).toContain('INSURER_CODE');
      expect(missing).not.toContain('IDENTITY_PAN');
    });

    it('isComplete returns true when all items done', () => {
      const checklist = OnboardingChecklist.for('POSP');

      checklist.recordEvidence('IDENTITY_PAN', { evidenceRef: 'kyc_ref_001' }, now);
      checklist.logTraining(15, 'cert_ref_001', now);
      checklist.recordEvidence('EXAM', { evidenceRef: 'exam_ref_001' }, now);
      checklist.recordEvidence('CERTIFICATE', { evidenceRef: 'cert_ref_002' }, now);
      checklist.markInsurerCodeMapped(now);

      expect(checklist.isComplete()).toBe(true);
    });
  });

  describe('ISP template', () => {
    it('includes all 5 items with 25 hour training requirement', () => {
      const checklist = OnboardingChecklist.for('ISP');

      const items = checklist.items();
      expect(items.length).toBe(5);

      const trainingItem = items.find(i => i.key === 'TRAINING');
      expect(trainingItem?.hoursRequired).toBe(25);
    });

    it('completes training when 25 hours logged', () => {
      const checklist = OnboardingChecklist.for('ISP');

      checklist.logTraining(15, 'cert_ref_001', now);
      checklist.logTraining(10, 'cert_ref_002', now);

      const trainingItem = checklist.items().find(i => i.key === 'TRAINING');
      expect(trainingItem?.done).toBe(true);
      expect(trainingItem?.hoursLogged).toBe(25);
    });
  });

  describe('EMPLOYEE template', () => {
    it('includes only IDENTITY_PAN and INSURER_CODE', () => {
      const checklist = OnboardingChecklist.for('EMPLOYEE');

      const items = checklist.items();
      expect(items.length).toBe(2);
      expect(items.map(i => i.key)).toContain('IDENTITY_PAN');
      expect(items.map(i => i.key)).toContain('INSURER_CODE');
    });

    it('does not require training', () => {
      const checklist = OnboardingChecklist.for('EMPLOYEE');

      const items = checklist.items();
      expect(items.find(i => i.key === 'TRAINING')).toBeUndefined();
    });

    it('is complete with identity and insurer code', () => {
      const checklist = OnboardingChecklist.for('EMPLOYEE');

      checklist.recordEvidence('IDENTITY_PAN', { evidenceRef: 'kyc_ref_001' }, now);
      checklist.markInsurerCodeMapped(now);

      expect(checklist.isComplete()).toBe(true);
    });
  });

  describe('SOLO template', () => {
    it('is empty and immediately complete', () => {
      const checklist = OnboardingChecklist.for('SOLO');

      expect(checklist.items().length).toBe(0);
      expect(checklist.isComplete()).toBe(true);
      expect(checklist.missing()).toEqual([]);
    });
  });

  describe('templateFor function', () => {
    it('returns correct template for each type', () => {
      const posp = templateFor('POSP');
      expect(posp.salespersonType).toBe('POSP');

      const isp = templateFor('ISP');
      expect(isp.salespersonType).toBe('ISP');

      const employee = templateFor('EMPLOYEE');
      expect(employee.salespersonType).toBe('EMPLOYEE');

      const solo = templateFor('SOLO');
      expect(solo.salespersonType).toBe('SOLO');
    });
  });

  describe('restore from items', () => {
    it('restores checklist from persisted items', () => {
      const items = [
        { key: 'IDENTITY_PAN' as const, done: true, _evidenceRef: 'kyc_ref_001', completedAt: now.toISOString() },
        { key: 'TRAINING' as const, done: false, hoursLogged: 10, hoursRequired: 15 },
      ];

      const checklist = OnboardingChecklist.restore(items);

      expect(checklist.items()).toHaveLength(2);
      expect(checklist.items()[0].done).toBe(true);
    });
  });

  describe('training hour validation', () => {
    it('accepts 0.5 to 40 hours', () => {
      const checklist = OnboardingChecklist.for('POSP');

      expect(() => {
        checklist.logTraining(0.5, 'cert_ref_001', now);
      }).not.toThrow();

      checklist.logTraining(39.5, 'cert_ref_002', now);
      expect(() => {
        checklist.logTraining(0.5, 'cert_ref_003', now);
      }).not.toThrow();
    });

    it('rejects invalid hour ranges', () => {
      const checklist = OnboardingChecklist.for('POSP');

      expect(() => {
        checklist.logTraining(0, 'cert_ref_001', now);
      }).toThrow(ValidationError);

      expect(() => {
        checklist.logTraining(41, 'cert_ref_001', now);
      }).toThrow(ValidationError);
    });
  });

  describe('unknown item rejection', () => {
    it('rejects recording evidence for item not in template', () => {
      const checklist = OnboardingChecklist.for('EMPLOYEE');

      expect(() => {
        checklist.recordEvidence('TRAINING', { evidenceRef: 'ref' }, now);
      }).toThrow(ValidationError);
    });
  });
});

// Helper stubs
function templateFor(_type: string): Record<string, unknown> {
  throw new Error('templateFor not implemented');
}

class OnboardingChecklist {
  static for(_type: string): OnboardingChecklist {
    throw new Error('OnboardingChecklist.for not implemented');
  }

  static restore(_items: Record<string, unknown>[]): OnboardingChecklist {
    throw new Error('OnboardingChecklist.restore not implemented');
  }

  items(): Record<string, unknown>[] {
    throw new Error('items not implemented');
  }

  isComplete(): boolean {
    throw new Error('isComplete not implemented');
  }

  missing(): Record<string, unknown>[] {
    throw new Error('missing not implemented');
  }

  recordEvidence(_key: string, _input: Record<string, unknown>, _now: Date): void {
    throw new Error('recordEvidence not implemented');
  }

  logTraining(_hours: number, _evidenceRef: string, _now: Date): void {
    throw new Error('logTraining not implemented');
  }

  markInsurerCodeMapped(_now: Date): void {
    throw new Error('markInsurerCodeMapped not implemented');
  }
}
