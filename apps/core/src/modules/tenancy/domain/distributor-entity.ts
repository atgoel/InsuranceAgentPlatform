import { ValidationError, BusinessRuleError } from '../../../kernel/errors/domain-errors';
import { TenantKind } from './tenant';

export type EntityType = 'IMF' | 'BROKER' | 'INDIVIDUAL_AGENT' | 'CORPORATE_AGENT';

export interface DistributorEntityProps {
  entityType: EntityType;
  legalName: string;
  registrationNo: string;
  registrationValidTo: string;
  principalOfficerName?: string;
}

export class DistributorEntity {
  readonly entityType: EntityType;
  readonly legalName: string;
  readonly registrationNo: string;
  readonly registrationValidTo: string;
  readonly principalOfficerName?: string;

  private constructor(props: DistributorEntityProps) {
    this.entityType = props.entityType;
    this.legalName = props.legalName;
    this.registrationNo = props.registrationNo;
    this.registrationValidTo = props.registrationValidTo;
    this.principalOfficerName = props.principalOfficerName;
  }

  /** Rehydrates a persisted entity (validated when it was created). */
  static restore(props: DistributorEntityProps): DistributorEntity {
    return new DistributorEntity(props);
  }

  get props(): DistributorEntityProps {
    return { entityType: this.entityType, legalName: this.legalName, registrationNo: this.registrationNo, registrationValidTo: this.registrationValidTo, principalOfficerName: this.principalOfficerName };
  }

  private static validateEntityTypeForKind(tenantKind: TenantKind, entityType: EntityType): void {
    if (tenantKind === 'SOLO' && entityType !== 'INDIVIDUAL_AGENT') {
      throw new BusinessRuleError(
        'entity_type_not_allowed_for_kind',
        'SOLO tenants must have INDIVIDUAL_AGENT entity type'
      );
    }

    if (tenantKind === 'ORGANISATION' && entityType === 'INDIVIDUAL_AGENT') {
      throw new BusinessRuleError(
        'entity_type_not_allowed_for_kind',
        'ORGANISATION tenants cannot have INDIVIDUAL_AGENT entity type'
      );
    }
  }

  private static validateLegalName(legalName: string): void {
    if (legalName.length < 2 || legalName.length > 200) {
      throw new ValidationError('invalid_legal_name', 'Legal name must be 2-200 characters');
    }
  }

  private static validateRegistrationNo(registrationNo: string): void {
    if (registrationNo.length < 3 || registrationNo.length > 40) {
      throw new ValidationError('invalid_registration_no', 'Registration number must be 3-40 characters');
    }

    if (!/^[A-Z0-9/-]+$/.test(registrationNo)) {
      throw new ValidationError('invalid_registration_no', 'Registration number must contain only A-Z, 0-9, /, -');
    }
  }

  private static validatePrincipalOfficer(entityType: EntityType, principalOfficerName: string | undefined): void {
    if ((entityType === 'IMF' || entityType === 'BROKER') && !principalOfficerName) {
      throw new ValidationError(
        'principal_officer_required',
        'Principal officer name is required for IMF and BROKER entity types'
      );
    }
  }

  static create(input: {
    tenantKind: TenantKind;
    entityType: EntityType;
    legalName: string;
    registrationNo: string;
    registrationValidTo: string;
    principalOfficerName?: string;
  }): DistributorEntity {
    this.validateEntityTypeForKind(input.tenantKind, input.entityType);
    this.validateLegalName(input.legalName);
    this.validateRegistrationNo(input.registrationNo);
    this.validatePrincipalOfficer(input.entityType, input.principalOfficerName);

    return new DistributorEntity({
      entityType: input.entityType,
      legalName: input.legalName,
      registrationNo: input.registrationNo,
      registrationValidTo: input.registrationValidTo,
      principalOfficerName: input.principalOfficerName,
    });
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
