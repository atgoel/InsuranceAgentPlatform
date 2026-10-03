import { createHash } from 'node:crypto';
import { ValidationError, BusinessRuleError } from '../../../kernel/errors/domain-errors';
import { PhoneNumber, EmailAddress } from '../../../kernel/domain';
import { RoleCatalogue } from './roles';

export type SalespersonType = 'EMPLOYEE' | 'ISP' | 'POSP' | 'SOLO';
export type MemberStatus = 'invited' | 'onboarding' | 'active' | 'suspended' | 'exited';

export interface MemberProps {
  id: string;
  userRef?: string;
  displayName: string;
  phoneMasked?: string;
  emailMasked?: string;
  contactHash: string;
  roles: string[];
  salespersonType?: SalespersonType;
  orgUnitId: string;
  status: MemberStatus;
  capacityPerDay: number;
  skills: string[];
  languages: string[];
  invitedAt: string;
  activatedAt?: string;
  exitedAt?: string;
  inviteExpiresAt: string;
  version: number;
}

export interface OnboardingChecklist {
  isComplete(): boolean;
  missing(): string[];
}

export class Member {
  private _props: MemberProps;

  static invite(input: {
    id: string;
    displayName: string;
    phone?: PhoneNumber;
    email?: EmailAddress;
    roles: string[];
    salespersonType?: SalespersonType;
    orgUnitId: string;
    now: Date;
  }): Member {
    validateContact(input.phone, input.email);
    validateRoles(input.roles);
    validateSalespersonType(input.roles, input.salespersonType);

    const contactHash = computeContactHash(input.phone, input.email);
    const inviteExpiresAt = new Date(input.now);
    inviteExpiresAt.setDate(inviteExpiresAt.getDate() + 7);

    return new Member({
      id: input.id,
      displayName: input.displayName,
      phoneMasked: input.phone?.masked(),
      emailMasked: input.email?.masked(),
      contactHash,
      roles: input.roles,
      salespersonType: input.salespersonType,
      orgUnitId: input.orgUnitId,
      status: 'invited',
      capacityPerDay: 25,
      skills: [],
      languages: [],
      invitedAt: input.now.toISOString(),
      inviteExpiresAt: inviteExpiresAt.toISOString(),
      version: 1,
    });
  }

  static restore(p: MemberProps): Member {
    return new Member(p);
  }

  private constructor(props: MemberProps) {
    this._props = props;
  }

  /** Repository callback after an optimistic write; the aggregate now holds the stored version. */
  markSaved(): void {
    this._props = { ...this._props, version: this._props.version + 1 };
  }

  acceptInvite(userRef: string, now: Date): void {
    if (this._props.status !== 'invited') {
      throw new BusinessRuleError('illegal_member_transition', `Cannot accept invite from ${this._props.status} status`);
    }

    const expiresAt = new Date(this._props.inviteExpiresAt);
    if (now > expiresAt) {
      throw new BusinessRuleError('invite_expired', 'Invite has expired');
    }

    this._props.userRef = userRef;
    const isSeller = this.isSeller();
    this._props.status = isSeller ? 'onboarding' : 'active';

    if (!isSeller) {
      this._props.activatedAt = now.toISOString();
    }
  }

  activate(now: Date, checklist: OnboardingChecklist): void {
    if (this._props.status !== 'onboarding' && this._props.status !== 'suspended') {
      throw new BusinessRuleError('illegal_member_transition', `Cannot activate from ${this._props.status} status`);
    }

    if (this.isSeller() && !checklist.isComplete()) {
      throw new BusinessRuleError('onboarding_incomplete', 'Onboarding checklist is incomplete', {
        missing: checklist.missing(),
      });
    }

    this._props.status = 'active';
    this._props.activatedAt = now.toISOString();
  }

  suspend(_now: Date): void {
    if (this._props.status !== 'active') {
      throw new BusinessRuleError('illegal_member_transition', `Cannot suspend from ${this._props.status} status`);
    }

    this._props.status = 'suspended';
  }

  exit(now: Date): void {
    if (this._props.status === 'exited') {
      throw new BusinessRuleError('illegal_member_transition', 'Member is already exited');
    }

    this._props.status = 'exited';
    this._props.exitedAt = now.toISOString();
  }

  changeRoles(roles: string[]): void {
    if (this._props.status === 'exited') {
      throw new BusinessRuleError('illegal_member_transition', 'Cannot change roles of exited member');
    }

    if (!roles || roles.length === 0) {
      throw new ValidationError('roles_required', 'At least one role is required');
    }

    const catalogue = RoleCatalogue.defaults();
    for (const role of roles) {
      try {
        catalogue.get(role);
      } catch {
        throw new ValidationError('unknown_role', `Unknown role: ${role}`);
      }
    }

    this._props.roles = roles;
  }

  moveTo(orgUnitId: string): void {
    this._props.orgUnitId = orgUnitId;
  }

  /** Routing attributes (F05): skills and spoken languages, de-duplicated. */
  setRoutingProfile(input: { skills?: string[]; languages?: string[] }): void {
    if (input.skills) this._props.skills = [...new Set(input.skills)];
    if (input.languages) this._props.languages = [...new Set(input.languages.map((l) => l.toLowerCase()))];
  }

  setCapacity(capacityPerDay: number): void {
    this._props.capacityPerDay = capacityPerDay;
  }

  isSeller(): boolean {
    return !!this._props.salespersonType;
  }

  get props(): Readonly<MemberProps> {
    return { ...this._props };
  }
}

function validateContact(phone?: PhoneNumber, email?: EmailAddress): void {
  if (!phone && !email) {
    throw new ValidationError('contact_required', 'At least one contact method (phone or email) is required');
  }
}

function validateRoles(roles: string[]): void {
  if (!roles || roles.length === 0) {
    throw new ValidationError('roles_required', 'At least one role is required');
  }

  const catalogue = RoleCatalogue.defaults();
  for (const role of roles) {
    try {
      catalogue.get(role);
    } catch {
      throw new ValidationError('unknown_role', `Unknown role: ${role}`);
    }
  }
}

function validateSalespersonType(roles: string[], salespersonType?: SalespersonType): void {
  const hasSalespersonRole = roles.includes('SALESPERSON');
  const hasSoloOwnerRole = roles.includes('SOLO_OWNER');

  if (hasSalespersonRole && !salespersonType) {
    throw new BusinessRuleError('salesperson_type_mismatch', 'SALESPERSON role requires a salespersonType');
  }

  if (salespersonType && salespersonType !== 'SOLO' && !hasSalespersonRole) {
    throw new BusinessRuleError('salesperson_type_mismatch', 'salespersonType without SALESPERSON role');
  }

  if (salespersonType === 'SOLO' && !hasSoloOwnerRole) {
    throw new BusinessRuleError('salesperson_type_mismatch', 'SOLO type requires SOLO_OWNER role');
  }
}

function computeContactHash(phone?: PhoneNumber, email?: EmailAddress): string {
  let input = '';

  if (phone) {
    input = phone.e164;
  } else if (email) {
    input = email.value.toLowerCase();
  }

  return createHash('sha256').update(input).digest('hex');
}
