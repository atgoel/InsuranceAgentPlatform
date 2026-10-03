import { Injectable, Inject } from '@nestjs/common';
import { IdentityProvisioner, CRM_PROVISIONER, OTP_SENDER, OTP_GENERATOR, CrmProvisioner, OtpSender, OtpGenerator } from '../application/ports';
import { Logger } from '../../../kernel/observability/logger';
import { PhoneNumber } from '../../../kernel/domain/phone-number';
import { CrmMode } from '../domain/tenant';
import { randomInt } from 'crypto';

@Injectable()
export class StubIdentityProvisioner implements IdentityProvisioner {
  constructor(private logger: Logger) {}

  async ensureOrganisation(tenantId: string, slug: string): Promise<void> {
    this.logger.debug('Stub: ensuring organisation', { tenantId, slug });
  }

  async ensureAdmin(tenantId: string, admin: { name: string; phone?: string; email?: string }): Promise<string> {
    this.logger.debug('Stub: ensuring admin', { tenantId, admin });
    return `admin_${tenantId}`;
  }
}

@Injectable()
export class StubCrmProvisioner implements CrmProvisioner {
  constructor(private logger: Logger) {}

  async ensureWorkspace(tenantId: string, mode: CrmMode): Promise<{ workspaceRef?: string }> {
    this.logger.debug('Stub: ensuring CRM workspace', { tenantId, mode });
    return { workspaceRef: `ws_${tenantId}` };
  }
}

@Injectable()
export class StubContentProvisioner {
  constructor(private logger: Logger) {}

  async ensureTenantScope(tenantId: string): Promise<void> {
    this.logger.debug('Stub: ensuring content scope', { tenantId });
  }
}

@Injectable()
export class LoggingOtpSender implements OtpSender {
  constructor(private logger: Logger) {}

  async send(phone: PhoneNumber, otp: string): Promise<void> {
    const masked = phone.e164.slice(-4).padStart(phone.e164.length, '*');
    this.logger.debug('OTP sent', { phone: masked });
    // Never log the actual OTP
  }
}

@Injectable()
export class FixedOtpGenerator implements OtpGenerator {
  generate(): string {
    return '123456';
  }
}

@Injectable()
export class RandomOtpGenerator implements OtpGenerator {
  generate(): string {
    let otp = '';
    for (let i = 0; i < 6; i++) {
      otp += randomInt(0, 10);
    }
    return otp;
  }
}
