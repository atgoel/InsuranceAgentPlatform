import { DistributorEntity } from './distributor-entity';
import { ValidationError, BusinessRuleError } from '../../../kernel/errors/domain-errors';

/**
 * AC-M01-02: DistributorEntity enforces SOLO ↔ INDIVIDUAL_AGENT, requires a Principal Officer for IMF/BROKER,
 * reports registration valid/expiring/expired (60-day window) and comparison scope (BROKER market-wide, others tied).
 */
describe('AC-M01-02 DistributorEntity', () => {
  describe('create', () => {
    it('creates an INDIVIDUAL_AGENT for SOLO kind', () => {
      const entity = DistributorEntity.create({
        tenantKind: 'SOLO',
        entityType: 'INDIVIDUAL_AGENT',
        legalName: 'John Doe',
        registrationNo: 'ABC123',
        registrationValidTo: '2027-12-31',
      });

      expect(entity.entityType).toBe('INDIVIDUAL_AGENT');
      expect(entity.legalName).toBe('John Doe');
      expect(entity.registrationNo).toBe('ABC123');
      expect(entity.registrationValidTo).toBe('2027-12-31');
    });

    it('creates an IMF for ORGANISATION kind', () => {
      const entity = DistributorEntity.create({
        tenantKind: 'ORGANISATION',
        entityType: 'IMF',
        legalName: 'Acme Insurance Company',
        registrationNo: 'REG-001-IMF',
        registrationValidTo: '2028-06-30',
        principalOfficerName: 'Jane Smith',
      });

      expect(entity.entityType).toBe('IMF');
      expect(entity.principalOfficerName).toBe('Jane Smith');
    });

    it('rejects SOLO with non-INDIVIDUAL_AGENT type', () => {
      expect(() =>
        DistributorEntity.create({
          tenantKind: 'SOLO',
          entityType: 'IMF',
          legalName: 'Test',
          registrationNo: 'TEST',
          registrationValidTo: '2027-12-31',
          principalOfficerName: 'Test Officer',
        }),
      ).toThrow(BusinessRuleError);
    });

    it('rejects ORGANISATION with INDIVIDUAL_AGENT type', () => {
      expect(() =>
        DistributorEntity.create({
          tenantKind: 'ORGANISATION',
          entityType: 'INDIVIDUAL_AGENT',
          legalName: 'Test',
          registrationNo: 'TEST',
          registrationValidTo: '2027-12-31',
        }),
      ).toThrow(BusinessRuleError);
    });

    it('requires principal officer for IMF', () => {
      expect(() =>
        DistributorEntity.create({
          tenantKind: 'ORGANISATION',
          entityType: 'IMF',
          legalName: 'Test IMF',
          registrationNo: 'TEST',
          registrationValidTo: '2027-12-31',
        }),
      ).toThrow(ValidationError);
    });

    it('requires principal officer for BROKER', () => {
      expect(() =>
        DistributorEntity.create({
          tenantKind: 'ORGANISATION',
          entityType: 'BROKER',
          legalName: 'Test Broker',
          registrationNo: 'TEST',
          registrationValidTo: '2027-12-31',
        }),
      ).toThrow(ValidationError);
    });

    it('allows optional principal officer for CORPORATE_AGENT', () => {
      const entity = DistributorEntity.create({
        tenantKind: 'ORGANISATION',
        entityType: 'CORPORATE_AGENT',
        legalName: 'Corp Agent Inc',
        registrationNo: 'CORP-001',
        registrationValidTo: '2027-12-31',
      });

      expect(entity.entityType).toBe('CORPORATE_AGENT');
    });

    it('validates legal name length 2..200', () => {
      expect(() =>
        DistributorEntity.create({
          tenantKind: 'SOLO',
          entityType: 'INDIVIDUAL_AGENT',
          legalName: 'A',
          registrationNo: 'TEST',
          registrationValidTo: '2027-12-31',
        }),
      ).toThrow(ValidationError);

      expect(() =>
        DistributorEntity.create({
          tenantKind: 'SOLO',
          entityType: 'INDIVIDUAL_AGENT',
          legalName: 'A'.repeat(201),
          registrationNo: 'TEST',
          registrationValidTo: '2027-12-31',
        }),
      ).toThrow(ValidationError);
    });

    it('validates registration number format 3..40 [A-Z0-9/-]', () => {
      expect(() =>
        DistributorEntity.create({
          tenantKind: 'SOLO',
          entityType: 'INDIVIDUAL_AGENT',
          legalName: 'Test',
          registrationNo: 'AB',
          registrationValidTo: '2027-12-31',
        }),
      ).toThrow(ValidationError);

      expect(() =>
        DistributorEntity.create({
          tenantKind: 'SOLO',
          entityType: 'INDIVIDUAL_AGENT',
          legalName: 'Test',
          registrationNo: 'REG-2024/001',
          registrationValidTo: '2027-12-31',
        }),
      ).not.toThrow();

      expect(() =>
        DistributorEntity.create({
          tenantKind: 'SOLO',
          entityType: 'INDIVIDUAL_AGENT',
          legalName: 'Test',
          registrationNo: 'reg-invalid',
          registrationValidTo: '2027-12-31',
        }),
      ).toThrow(ValidationError);
    });
  });

  describe('registrationStatus', () => {
    it('returns valid when registration valid date is in the future beyond 60 days', () => {
      const entity = DistributorEntity.create({
        tenantKind: 'SOLO',
        entityType: 'INDIVIDUAL_AGENT',
        legalName: 'Test',
        registrationNo: 'TEST123',
        registrationValidTo: '2027-12-31',
      });

      const today = new Date('2026-01-01');
      expect(entity.registrationStatus(today)).toBe('valid');
    });

    it('returns expiring when registration expires within 60 days', () => {
      const entity = DistributorEntity.create({
        tenantKind: 'SOLO',
        entityType: 'INDIVIDUAL_AGENT',
        legalName: 'Test',
        registrationNo: 'TEST123',
        registrationValidTo: '2026-03-01',
      });

      const today = new Date('2026-01-01');
      expect(entity.registrationStatus(today)).toBe('expiring');
    });

    it('returns expired when registration valid date has passed', () => {
      const entity = DistributorEntity.create({
        tenantKind: 'SOLO',
        entityType: 'INDIVIDUAL_AGENT',
        legalName: 'Test',
        registrationNo: 'TEST123',
        registrationValidTo: '2025-12-31',
      });

      const today = new Date('2026-01-01');
      expect(entity.registrationStatus(today)).toBe('expired');
    });

    it('returns expiring for exactly 60 days in future', () => {
      const entity = DistributorEntity.create({
        tenantKind: 'SOLO',
        entityType: 'INDIVIDUAL_AGENT',
        legalName: 'Test',
        registrationNo: 'TEST123',
        registrationValidTo: '2026-03-01',
      });

      const today = new Date('2026-01-01');
      expect(entity.registrationStatus(today)).toBe('expiring');
    });
  });

  describe('comparisonScope', () => {
    it('returns MARKET_WIDE for BROKER', () => {
      const entity = DistributorEntity.create({
        tenantKind: 'ORGANISATION',
        entityType: 'BROKER',
        legalName: 'Test Broker',
        registrationNo: 'BROKER-001',
        registrationValidTo: '2027-12-31',
        principalOfficerName: 'Officer',
      });

      expect(entity.comparisonScope()).toBe('MARKET_WIDE');
    });

    it('returns TIED_INSURERS for IMF', () => {
      const entity = DistributorEntity.create({
        tenantKind: 'ORGANISATION',
        entityType: 'IMF',
        legalName: 'Test IMF',
        registrationNo: 'IMF-001',
        registrationValidTo: '2027-12-31',
        principalOfficerName: 'Officer',
      });

      expect(entity.comparisonScope()).toBe('TIED_INSURERS');
    });

    it('returns TIED_INSURERS for INDIVIDUAL_AGENT', () => {
      const entity = DistributorEntity.create({
        tenantKind: 'SOLO',
        entityType: 'INDIVIDUAL_AGENT',
        legalName: 'Test Agent',
        registrationNo: 'AGENT-001',
        registrationValidTo: '2027-12-31',
      });

      expect(entity.comparisonScope()).toBe('TIED_INSURERS');
    });

    it('returns TIED_INSURERS for CORPORATE_AGENT', () => {
      const entity = DistributorEntity.create({
        tenantKind: 'ORGANISATION',
        entityType: 'CORPORATE_AGENT',
        legalName: 'Test Corp Agent',
        registrationNo: 'CORP-001',
        registrationValidTo: '2027-12-31',
      });

      expect(entity.comparisonScope()).toBe('TIED_INSURERS');
    });
  });
});
