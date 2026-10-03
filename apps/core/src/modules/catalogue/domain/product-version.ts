import { ValidationError, BusinessRuleError } from '../../../kernel/errors/domain-errors';
import type { LineOfBusiness, DistributorChannel } from './catalogue';

export type VersionStatus = 'draft' | 'active' | 'withdrawn';

export interface ProductVersionProps {
  id: string;
  productId: string;
  insurerId: string;
  line: LineOfBusiness;
  uin: string;
  wordingVersion: string;
  wordingUrl?: string;
  posEligible: boolean;
  channels: DistributorChannel[];
  effectiveFrom: string;
  effectiveTo?: string;
  status: VersionStatus;
  lockedAt?: string;
  quoteRequirements: string[];
  keyFacts: Array<{ label: string; value: string }>;
}

export class ProductVersion {
  private _props: ProductVersionProps;

  static draft(input: Omit<ProductVersionProps, 'status' | 'lockedAt'>): ProductVersion {
    // Validate UIN format: /^[A-Z0-9]{6,30}$/
    if (!/^[A-Z0-9]{6,30}$/.test(input.uin)) {
      throw new ValidationError('invalid_uin', 'UIN must be 6-30 uppercase alphanumeric characters');
    }

    // Validate channels is non-empty
    if (!input.channels || input.channels.length === 0) {
      throw new ValidationError('empty_channels', 'Channels array must not be empty');
    }

    const props: ProductVersionProps = {
      ...input,
      status: 'draft',
    };

    return new ProductVersion(props);
  }

  static restore(props: ProductVersionProps): ProductVersion {
    return new ProductVersion(props);
  }

  private constructor(props: ProductVersionProps) {
    this._props = props;
  }

  markSaved(): void {
    // Increment version if needed - currently props don't have a version field
    // This is for consistency with other domain entities
  }

  get props(): Readonly<ProductVersionProps> {
    return this._props;
  }

  get id(): string {
    return this._props.id;
  }

  get uin(): string {
    return this._props.uin;
  }

  get channels(): DistributorChannel[] {
    return this._props.channels;
  }

  get status(): VersionStatus {
    return this._props.status;
  }

  get lockedAt(): string | undefined {
    return this._props.lockedAt;
  }

  get wordingUrl(): string | undefined {
    return this._props.wordingUrl;
  }

  get keyFacts(): Array<{ label: string; value: string }> {
    return this._props.keyFacts;
  }

  get quoteRequirements(): string[] {
    return this._props.quoteRequirements;
  }

  get posEligible(): boolean {
    return this._props.posEligible;
  }

  get effectiveTo(): string | undefined {
    return this._props.effectiveTo;
  }

  activate(): void {
    // Idempotent: only transition if currently draft
    if (this._props.status === 'draft') {
      this._props.status = 'active';
    }
  }

  withdraw(on: string): void {
    // Idempotent: transition to withdrawn and set effectiveTo
    this._props.status = 'withdrawn';
    this._props.effectiveTo = on;
  }

  lock(now: Date): void {
    // Idempotent: only set if not already locked
    if (!this._props.lockedAt) {
      this._props.lockedAt = now.toISOString();
    }
  }

  edit(patch: Partial<Pick<ProductVersionProps, 'keyFacts' | 'quoteRequirements' | 'wordingUrl' | 'channels' | 'posEligible'>>): void {
    // Locked versions reject edits
    if (this._props.lockedAt) {
      throw new BusinessRuleError('product_version_locked', 'Cannot edit a locked product version');
    }

    if (patch.keyFacts !== undefined) {
      this._props.keyFacts = patch.keyFacts;
    }
    if (patch.quoteRequirements !== undefined) {
      this._props.quoteRequirements = patch.quoteRequirements;
    }
    if (patch.wordingUrl !== undefined) {
      this._props.wordingUrl = patch.wordingUrl;
    }
    if (patch.channels !== undefined) {
      this._props.channels = patch.channels;
    }
    if (patch.posEligible !== undefined) {
      this._props.posEligible = patch.posEligible;
    }
  }

  isEffective(date: string): boolean {
    // Must be active status
    if (this._props.status !== 'active') {
      return false;
    }

    // Check effectiveFrom <= date
    if (date < this._props.effectiveFrom) {
      return false;
    }

    // Check (no effectiveTo or date <= effectiveTo)
    if (this._props.effectiveTo && date > this._props.effectiveTo) {
      return false;
    }

    return true;
  }
}
