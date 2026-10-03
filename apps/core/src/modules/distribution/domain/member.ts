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
  private props: MemberProps;

  static invite(input: {
    id: string;
    displayName: string;
    phone?: PhoneNumber;
    email?: EmailAddress;
    _roles: string[];
    salespersonType?: SalespersonType;
    orgUnitId: string;
    now: Date;
  }): Member {
    if (!input.phone && !input.email) {
      throw new ValidationError('contact_required', 'At least one contact method (phone or email) is required');
    }

    if (!input._roles || input._roles.length === 0) {
      throw new ValidationError('roles_required', 'At least one role is required');
    }

    const catalogue = RoleCatalogue.defaults();
    for (const role of input._roles) {
      try {
        catalogue.get(role);
      } catch {
        throw new ValidationError('unknown_role', `Unknown role: ${role}`);
      }
    }

    const hasSalespersonRole = input._roles.includes('SALESPERSON');
    const hasSoloOwnerRole = input._roles.includes('SOLO_OWNER');

    if (hasSalespersonRole && !input.salespersonType) {
      throw new BusinessRuleError('salesperson_type_mismatch', 'SALESPERSON role requires a salespersonType');
    }

    if (!hasSalespersonRole && input.salespersonType) {
      throw new BusinessRuleError('salesperson_type_mismatch', 'salespersonType without SALESPERSON role');
    }

    if (input.salespersonType === 'SOLO' && !hasSoloOwnerRole) {
      throw new BusinessRuleError('salesperson_type_mismatch', 'SOLO type requires SOLO_OWNER role');
    }

    const contactHash = computeContactHash(input.phone, input.email);
    const inviteExpiresAt = new Date(input.now);
    inviteExpiresAt.setDate(inviteExpiresAt.getDate() + 7);

    const member = new Member({
      id: input.id,
      displayName: input.displayName,
      phoneMasked: input.phone?.masked(),
      emailMasked: input.email?.masked(),
      contactHash,
      roles: input._roles,
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

    return member;
  }

  static restore(p: MemberProps): Member {
    return new Member(p);
  }

  private constructor(props: MemberProps) {
    this.props = props;
  }

  acceptInvite(userRef: string, now: Date): void {
    if (this.props.status !== 'invited') {
      throw new BusinessRuleError('illegal_member_transition', `Cannot accept invite from ${this.props.status} status`);
    }

    const expiresAt = new Date(this.props.inviteExpiresAt);
    if (now > expiresAt) {
      throw new BusinessRuleError('invite_expired', 'Invite has expired');
    }

    this.props.userRef = userRef;
    const isSeller = this.isSeller();
    this.props.status = isSeller ? 'onboarding' : 'active';

    if (!isSeller) {
      this.props.activatedAt = now.toISOString();
    }
  }

  activate(now: Date, checklist: OnboardingChecklist): void {
    if (this.props.status !== 'onboarding' && this.props.status !== 'suspended') {
      throw new BusinessRuleError('illegal_member_transition', `Cannot activate from ${this.props.status} status`);
    }

    if (this.isSeller() && !checklist.isComplete()) {
      throw new BusinessRuleError('onboarding_incomplete', 'Onboarding checklist is incomplete', {
        missing: checklist.missing(),
      });
    }

    this.props.status = 'active';
    this.props.activatedAt = now.toISOString();
  }

  suspend(now: Date): void {
    if (this.props.status !== 'active') {
      throw new BusinessRuleError('illegal_member_transition', `Cannot suspend from ${this.props.status} status`);
    }

    this.props.status = 'suspended';
  }

  exit(now: Date): void {
    if (this.props.status === 'exited') {
      throw new BusinessRuleError('illegal_member_transition', 'Member is already exited');
    }

    this.props.status = 'exited';
    this.props.exitedAt = now.toISOString();
  }

  changeRoles(roles: string[]): void {
    if (this.props.status === 'exited') {
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

    this.props.roles = roles;
  }

  moveTo(orgUnitId: string): void {
    this.props.orgUnitId = orgUnitId;
  }

  setCapacity(capacityPerDay: number): void {
    this.props.capacityPerDay = capacityPerDay;
  }

  isSeller(): boolean {
    return !!this.props.salespersonType;
  }

  get readonly(): Readonly<MemberProps> {
    return Object.freeze({ ...this.props });
  }

  get props(): Readonly<MemberProps> {
    return Object.freeze({ ...this.props });
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
