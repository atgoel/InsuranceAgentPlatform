import { Logger } from '../../../kernel/observability/logger';
import { IdentityAdmin } from '../application/ports';

export interface IdentityCall { op: 'invite' | 'updateRoles' | 'revokeSessions' | 'disable'; tenantId: string; ref: string }

/** Development/test adapter for Keycloak admin; records calls so tests can assert session revocation (K7). */
export class StubIdentityAdmin implements IdentityAdmin {
  readonly calls: IdentityCall[] = [];

  constructor(private readonly logger: Logger) {}

  async invite(tenantId: string, member: { memberId: string }): Promise<void> {
    this.track({ op: 'invite', tenantId, ref: member.memberId });
  }

  async updateRoles(tenantId: string, userRef: string): Promise<void> {
    this.track({ op: 'updateRoles', tenantId, ref: userRef });
  }

  async revokeSessions(tenantId: string, userRef: string): Promise<void> {
    this.track({ op: 'revokeSessions', tenantId, ref: userRef });
  }

  async disable(tenantId: string, userRef: string): Promise<void> {
    this.track({ op: 'disable', tenantId, ref: userRef });
  }

  private track(call: IdentityCall): void {
    this.calls.push(call);
    this.logger.debug('distribution.stub.identity', 'Identity admin call (stub)', { op: call.op, tenantId: call.tenantId });
  }
}
