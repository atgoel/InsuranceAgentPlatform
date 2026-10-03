import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../kernel/errors/domain-errors';
import { TENANT_PERMISSION_POLICY } from '../../../kernel/tokens';
import { hasPermission, TenantPermissionPolicy } from '../../../kernel/tenancy/permissions';
import { Principal } from '../../../kernel/tenancy/principal';
import { FIELD_CIPHER, FieldCipher } from './ports';
import { PartyContext } from './party-context';
import { PartyService } from './party.service';

export type SensitivePurpose = 'PROPOSAL' | 'SERVICING' | 'DSR';

/**
 * Protection Proxy for P3 fields (DOB, PAN): re-checks `party.sensitive.read` even behind the route guard,
 * decrypts on demand, never caches, and audits every read with its purpose (AC-M03-11).
 */
@Injectable()
export class SensitivePartyAccessor {
  constructor(
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(TENANT_PERMISSION_POLICY) private readonly permissions: TenantPermissionPolicy,
    private readonly parties: PartyService,
    private readonly ctx: PartyContext,
  ) {}

  async sensitive(principal: Principal, partyId: string, purpose: SensitivePurpose): Promise<{ dateOfBirth?: string; pan?: string }> {
    if (!hasPermission(await this.permissions.permissionsFor(principal.roles, principal.tenantId), 'party.sensitive.read')) {
      throw new ForbiddenError('permission_denied', 'Permission denied', { required: ['party.sensitive.read'] });
    }
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const party = await this.parties.requireInScope(tx, principal, partyId);
      const { dateOfBirthEnc, panEnc } = party.props;
      const result = {
        dateOfBirth: dateOfBirthEnc ? await this.cipher.decrypt(tx.tenantId, dateOfBirthEnc) : undefined,
        pan: panEnc ? await this.cipher.decrypt(tx.tenantId, panEnc) : undefined,
      };
      await this.ctx.recorder.record(tx, { audit: { action: 'party.sensitive.read', entityType: 'party', entityId: partyId, metadata: { purpose, fields: Object.keys(result).filter((k) => result[k as keyof typeof result]) } } });
      this.ctx.logger.security('security.party.sensitive_read', 'Sensitive party fields read', { partyId, purpose });
      return result;
    });
  }
}
