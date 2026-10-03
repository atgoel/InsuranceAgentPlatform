import { ValidationError, BusinessRuleError } from '../../../kernel/errors/domain-errors';
import { TenantKind } from './tenant';

export type EntityType = 'IMF' | 'BROKER' | 'INDIVIDUAL_AGENT' | 'CORPORATE_AGENT';

export class DistributorEntity {
  readonly entityType: EntityType;
  readonly legalName: string;
  readonly registrationNo: string;
  readonly registrationValidTo: string;
  readonly principalOfficerName?: string;

  private constructor(
    entityType: EntityType,
    legalName: string,
    registrationNo: string,
    registrationValidTo: string,
    principalOfficerName?: string
  ) {
    this.entityType = entityType;
    this.legalName = legalName;
    this.registrationNo = registrationNo;
    this.registrationValidTo = registrationValidTo;
    this.principalOfficerName = principalOfficerName;
  }

  static create(input: {
    tenantKind: TenantKind;
    entityType: EntityType;
    legalName: string;
    registrationNo: string;
    registrationValidTo: string;
    principalOfficerName?: string;
  }): DistributorEntity {
    // SOLO ⇔ INDIVIDUAL_AGENT
    if (input.tenantKind === 'SOLO' && input.entityType !== 'INDIVIDUAL_AGENT') {
      throw new BusinessRuleError(
        'entity_type_not_allowed_for_kind',
        'SOLO tenants must have INDIVIDUAL_AGENT entity type'
      );
    }

    if (input.tenantKind === 'ORGANISATION' && input.entityType === 'INDIVIDUAL_AGENT') {
      throw new BusinessRuleError(
        'entity_type_not_allowed_for_kind',
        'ORGANISATION tenants cannot have INDIVIDUAL_AGENT entity type'
      );
    }

    // Validate legalName length 2..200
    if (input.legalName.length < 2 || input.legalName.length > 200) {
      throw new ValidationError('invalid_legal_name', 'Legal name must be 2-200 characters');
    }

    // Validate registrationNo 3..40 [A-Z0-9/-]
    if (input.registrationNo.length < 3 || input.registrationNo.length > 40) {
      throw new ValidationError('invalid_registration_no', 'Registration number must be 3-40 characters');
    }

    if (!/^[A-Z0-9\/-]+$/.test(input.registrationNo)) {
      throw new ValidationError('invalid_registration_no', 'Registration number must contain only A-Z, 0-9, /, -');
    }

    // Principal officer required for IMF and BROKER
    if ((input.entityType === 'IMF' || input.entityType === 'BROKER') && !input.principalOfficerName) {
      throw new ValidationError(
        'principal_officer_required',
        'Principal officer name is required for IMF and BROKER entity types'
      );
    }

    return new DistributorEntity(
      input.entityType,
      input.legalName,
      input.registrationNo,
      input.registrationValidTo,
      input.principalOfficerName
    );
  }

  registrationStatus(today: Date): 'valid' | 'expiring' | 'expired' {
    const expiryDate = new Date(this.registrationValidTo);
    expiryDate.setHours(23, 59, 59, 999);

    if (today > expiryDate) {
      return 'expired';
    }

    // Expiring within 60 days
    const sixtyDaysFromNow = new Date(today);
    sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);

    if (today <= expiryDate && expiryDate <= sixtyDaysFromNow) {
      return 'expiring';
    }

    return 'valid';
  }

  comparisonScope(): 'MARKET_WIDE' | 'TIED_INSURERS' {
    return this.entityType === 'BROKER' ? 'MARKET_WIDE' : 'TIED_INSURERS';
  }
}
