import { Tenant } from './tenant';
import { FixedClock } from '../../../kernel/domain/clock';
import { ValidationError, BusinessRuleError } from '../../../kernel/errors/domain-errors';

/**
 * AC-M01-01: Tenant.create validates slug, enforces plan ↔ kind, derives crmMode and deploymentMode,
 * status transitions follow the table and illegal transitions raise illegal_tenant_transition.
 */
describe('AC-M01-01 Tenant aggregate', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  describe('create', () => {
    it('creates a SOLO tenant with SOLO plan', () => {
      const tenant = Tenant.create({
        id: 'ten_solo1',
        slug: 'john-agent',
        displayName: 'John Agent',
        kind: 'SOLO',
        planCode: 'SOLO',
        now,
      });

      expect(tenant.props.id).toBe('ten_solo1');
      expect(tenant.props.slug).toBe('john-agent');
      expect(tenant.props.displayName).toBe('John Agent');
      expect(tenant.props.kind).toBe('SOLO');
      expect(tenant.props.planCode).toBe('SOLO');
      expect(tenant.props.crmMode).toBe('solo_lite');
      expect(tenant.props.deploymentMode).toBe('pooled');
      expect(tenant.props.status).toBe('provisioning');
    });

    it('creates a SOLO tenant with SOLO_PRO plan', () => {
      const tenant = Tenant.create({
        id: 'ten_solo_pro',
        slug: 'pro-agent',
        displayName: 'Pro Agent',
        kind: 'SOLO',
        planCode: 'SOLO_PRO',
        now,
      });

      expect(tenant.props.planCode).toBe('SOLO_PRO');
      expect(tenant.props.crmMode).toBe('solo_lite');
    });

    it('creates an ORGANISATION tenant with TEAM plan', () => {
      const tenant = Tenant.create({
        id: 'ten_org1',
        slug: 'acme-org',
        displayName: 'Acme Corp',
        kind: 'ORGANISATION',
        planCode: 'TEAM',
        now,
      });

      expect(tenant.props.kind).toBe('ORGANISATION');
      expect(tenant.props.crmMode).toBe('twenty');
      expect(tenant.props.deploymentMode).toBe('pooled');
    });

    it('creates DEDICATED plan tenant with dedicated deployment mode', () => {
      const tenant = Tenant.create({
        id: 'ten_dedicated',
        slug: 'dedicated-org',
        displayName: 'Dedicated Org',
        kind: 'ORGANISATION',
        planCode: 'DEDICATED',
        now,
      });

      expect(tenant.props.deploymentMode).toBe('dedicated');
    });

    it('validates slug format: valid lowercase with hyphens', () => {
      expect(() =>
        Tenant.create({
          id: 'ten_1',
          slug: 'a',
          displayName: 'Test',
          kind: 'SOLO',
          planCode: 'SOLO',
          now,
        }),
      ).not.toThrow();

      expect(() =>
        Tenant.create({
          id: 'ten_2',
          slug: 'abc-def-ghi',
          displayName: 'Test',
          kind: 'SOLO',
          planCode: 'SOLO',
          now,
        }),
      ).not.toThrow();

      expect(() =>
        Tenant.create({
          id: 'ten_3',
          slug: 'slug123',
          displayName: 'Test',
          kind: 'SOLO',
          planCode: 'SOLO',
          now,
        }),
      ).not.toThrow();
    });

    it('rejects invalid slug format', () => {
      expect(() =>
        Tenant.create({
          id: 'ten_bad1',
          slug: '-invalid',
          displayName: 'Test',
          kind: 'SOLO',
          planCode: 'SOLO',
          now,
        }),
      ).toThrow(ValidationError);

      expect(() =>
        Tenant.create({
          id: 'ten_bad2',
          slug: 'invalid-',
          displayName: 'Test',
          kind: 'SOLO',
          planCode: 'SOLO',
          now,
        }),
      ).toThrow(ValidationError);

      expect(() =>
        Tenant.create({
          id: 'ten_bad3',
          slug: 'UPPERCASE',
          displayName: 'Test',
          kind: 'SOLO',
          planCode: 'SOLO',
          now,
        }),
      ).toThrow(ValidationError);
    });

    it('rejects SOLO kind with non-SOLO plan', () => {
      expect(() =>
        Tenant.create({
          id: 'ten_bad',
          slug: 'test',
          displayName: 'Test',
          kind: 'SOLO',
          planCode: 'TEAM',
          now,
        }),
      ).toThrow(BusinessRuleError);
    });

    it('rejects ORGANISATION kind with SOLO plan', () => {
      expect(() =>
        Tenant.create({
          id: 'ten_bad',
          slug: 'test',
          displayName: 'Test',
          kind: 'ORGANISATION',
          planCode: 'SOLO',
          now,
        }),
      ).toThrow(BusinessRuleError);
    });

    it('sets default cell to cell-1', () => {
      const tenant = Tenant.create({
        id: 'ten_test',
        slug: 'test',
        displayName: 'Test',
        kind: 'SOLO',
        planCode: 'SOLO',
        now,
      });

      expect(tenant.props.cell).toBe('cell-1');
    });

    it('allows custom cell', () => {
      const tenant = Tenant.create({
        id: 'ten_test',
        slug: 'test',
        displayName: 'Test',
        kind: 'SOLO',
        planCode: 'SOLO',
        cell: 'cell-2',
        now,
      });

      expect(tenant.props.cell).toBe('cell-2');
    });

    it('sets version to 1', () => {
      const tenant = Tenant.create({
        id: 'ten_test',
        slug: 'test',
        displayName: 'Test',
        kind: 'SOLO',
        planCode: 'SOLO',
        now,
      });

      expect(tenant.props.version).toBe(1);
    });
  });

  describe('status transitions', () => {
    it('activates tenant from provisioning to active', () => {
      const tenant = Tenant.create({
        id: 'ten_test',
        slug: 'test',
        displayName: 'Test',
        kind: 'SOLO',
        planCode: 'SOLO',
        now,
      });

      expect(tenant.props.status).toBe('provisioning');
      tenant.activate();
      expect(tenant.props.status).toBe('active');
    });

    it('suspends active tenant to suspended', () => {
      const tenant = Tenant.create({
        id: 'ten_test',
        slug: 'test',
        displayName: 'Test',
        kind: 'SOLO',
        planCode: 'SOLO',
        now,
      });

      tenant.activate();
      tenant.suspend();
      expect(tenant.props.status).toBe('suspended');
    });

    it('resumes suspended tenant to active', () => {
      const tenant = Tenant.create({
        id: 'ten_test',
        slug: 'test',
        displayName: 'Test',
        kind: 'SOLO',
        planCode: 'SOLO',
        now,
      });

      tenant.activate();
      tenant.suspend();
      tenant.activate();
      expect(tenant.props.status).toBe('active');
    });

    it('offboards active tenant to offboarded', () => {
      const tenant = Tenant.create({
        id: 'ten_test',
        slug: 'test',
        displayName: 'Test',
        kind: 'SOLO',
        planCode: 'SOLO',
        now,
      });

      tenant.activate();
      tenant.offboard();
      expect(tenant.props.status).toBe('offboarded');
    });

    it('offboards suspended tenant to offboarded', () => {
      const tenant = Tenant.create({
        id: 'ten_test',
        slug: 'test',
        displayName: 'Test',
        kind: 'SOLO',
        planCode: 'SOLO',
        now,
      });

      tenant.activate();
      tenant.suspend();
      tenant.offboard();
      expect(tenant.props.status).toBe('offboarded');
    });

    it('rejects illegal transition provisioning -> suspended', () => {
      const tenant = Tenant.create({
        id: 'ten_test',
        slug: 'test',
        displayName: 'Test',
        kind: 'SOLO',
        planCode: 'SOLO',
        now,
      });

      expect(() => tenant.suspend()).toThrow(BusinessRuleError);
    });

    it('rejects illegal transition suspended -> suspended', () => {
      const tenant = Tenant.create({
        id: 'ten_test',
        slug: 'test',
        displayName: 'Test',
        kind: 'SOLO',
        planCode: 'SOLO',
        now,
      });

      tenant.activate();
      tenant.suspend();

      expect(() => tenant.suspend()).toThrow(BusinessRuleError);
    });

    it('rejects illegal transition offboarded -> active', () => {
      const tenant = Tenant.create({
        id: 'ten_test',
        slug: 'test',
        displayName: 'Test',
        kind: 'SOLO',
        planCode: 'SOLO',
        now,
      });

      tenant.activate();
      tenant.offboard();

      expect(() => tenant.activate()).toThrow(BusinessRuleError);
    });
  });

  describe('changePlan', () => {
    it('changes SOLO tenant to SOLO_PRO', () => {
      const tenant = Tenant.create({
        id: 'ten_test',
        slug: 'test',
        displayName: 'Test',
        kind: 'SOLO',
        planCode: 'SOLO',
        now,
      });

      tenant.changePlan('SOLO_PRO');
      expect(tenant.props.planCode).toBe('SOLO_PRO');
    });

    it('rejects plan change for different kind', () => {
      const tenant = Tenant.create({
        id: 'ten_test',
        slug: 'test',
        displayName: 'Test',
        kind: 'SOLO',
        planCode: 'SOLO',
        now,
      });

      expect(() => tenant.changePlan('TEAM')).toThrow(BusinessRuleError);
    });

    it('rejects plan change when offboarded', () => {
      const tenant = Tenant.create({
        id: 'ten_test',
        slug: 'test',
        displayName: 'Test',
        kind: 'SOLO',
        planCode: 'SOLO',
        now,
      });

      tenant.activate();
      tenant.offboard();

      expect(() => tenant.changePlan('SOLO_PRO')).toThrow(BusinessRuleError);
    });
  });

  describe('startTrial', () => {
    it('starts a 14-day trial for SOLO on SOLO plan', () => {
      const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
      const tenant = Tenant.create({
        id: 'ten_test',
        slug: 'test',
        displayName: 'Test',
        kind: 'SOLO',
        planCode: 'SOLO',
        now: clock.now(),
      });

      const trialEnds = new Date(clock.now());
      trialEnds.setDate(trialEnds.getDate() + 14);

      tenant.startTrial('SOLO_PRO', trialEnds);

      expect(tenant.props.planCode).toBe('SOLO_PRO');
      expect(tenant.props.trialEndsAt).toBeDefined();
    });

    it('rejects trial for non-SOLO tenant', () => {
      const tenant = Tenant.create({
        id: 'ten_test',
        slug: 'test',
        displayName: 'Test',
        kind: 'ORGANISATION',
        planCode: 'TEAM',
        now,
      });

      expect(() =>
        tenant.startTrial('SOLO_PRO', new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)),
      ).toThrow(BusinessRuleError);
    });

    it('rejects trial for non-SOLO plan', () => {
      const tenant = Tenant.create({
        id: 'ten_test',
        slug: 'test',
        displayName: 'Test',
        kind: 'SOLO',
        planCode: 'SOLO_PRO',
        now,
      });

      expect(() =>
        tenant.startTrial('SOLO_PRO', new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)),
      ).toThrow(BusinessRuleError);
    });
  });
});
