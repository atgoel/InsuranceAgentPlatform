import { randomInt } from 'node:crypto';
import { Logger } from '../../../kernel/observability/logger';
import { PhoneNumber } from '../../../kernel/domain/phone-number';
import { CrmMode } from '../domain/tenant';
import { ContentProvisioner, CrmProvisioner, IdentityProvisioner, OtpGenerator, OtpSender } from '../application/ports';

/**
 * Development adapters for the provisioning ports (Keycloak, Twenty, Strapi, SMS gateway are external).
 * Each is idempotent like the real `ensure*` contract and logs ids only — never contact details or OTPs.
 */
export class StubIdentityProvisioner implements IdentityProvisioner {
  constructor(private readonly logger: Logger) {}

  async ensureOrganisation(tenantId: string, slug: string): Promise<void> {
    this.logger.debug('tenant.stub.identity_organisation', 'Identity organisation ensured', { tenantId, slug });
  }

  async ensureAdmin(tenantId: string): Promise<string> {
    this.logger.debug('tenant.stub.identity_admin', 'Tenant admin identity ensured', { tenantId });
    return `kc_admin_${tenantId}`;
  }
}

export class StubCrmProvisioner implements CrmProvisioner {
  constructor(private readonly logger: Logger) {}

  async ensureWorkspace(tenantId: string, mode: CrmMode): Promise<{ workspaceRef?: string }> {
    this.logger.debug('tenant.stub.crm_workspace', 'CRM workspace ensured', { tenantId, mode });
    return mode === 'twenty' ? { workspaceRef: `ws_${tenantId}` } : {};
  }
}

export class StubContentProvisioner implements ContentProvisioner {
  constructor(private readonly logger: Logger) {}

  async ensureTenantScope(tenantId: string): Promise<void> {
    this.logger.debug('tenant.stub.content_scope', 'Content scope ensured', { tenantId });
  }
}

export class LoggingOtpSender implements OtpSender {
  constructor(private readonly logger: Logger) {}

  async send(phone: PhoneNumber): Promise<void> {
    this.logger.debug('tenant.stub.otp_sent', 'OTP dispatched (stub)', { phone: phone.masked() });
  }
}

/** Tests and local demo: deterministic OTP. Never bound in production. */
export class FixedOtpGenerator implements OtpGenerator {
  constructor(private readonly value = '123456') {}

  generate(): string {
    return this.value;
  }
}

export class RandomOtpGenerator implements OtpGenerator {
  generate(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }
}
