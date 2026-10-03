import { Injectable, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  UnauthenticatedError,
  ForbiddenError,
  NotFoundError,
} from '../errors/domain-errors';
import { IS_PUBLIC_KEY, IS_OPERATOR_ONLY_KEY } from './decorators';
import { TOKEN_VERIFIER, TENANT_RESOLVER } from '../tokens';
import { TokenVerifier } from './jwt';
import { TenantResolver } from './tenant-resolver';
import { RequestContext } from '../observability/request-context';
import { Logger } from '../observability/logger';
import { pseudonymiseActor } from './actor-pseudonym';
import { Principal } from './principal';
import { LOGGER } from '../tokens';

/**
 * AC-M00-18, 19 (tenancy): AuthGuard
 * Global guard that:
 * 1. Skips @Public endpoints
 * 2. Verifies JWT token
 * 3. Resolves tenant from Host header
 * 4. Validates tenant status and token claim match
 * 5. Checks @OperatorOnly role if present
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_VERIFIER) private readonly tokenVerifier: TokenVerifier,
    @Inject(TENANT_RESOLVER) private readonly tenantResolver: TenantResolver,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: any = context.switchToHttp().getRequest();

    // Check if endpoint is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      // Still try to resolve tenant for telemetry if Host is present
      const host = request.get('Host') as string;
      if (host) {
        try {
          const tenant = await this.tenantResolver.resolveByHost(host);
          if (tenant) {
            RequestContext.patch({ tenantId: tenant.tenantId });
          }
        } catch {
          // Ignore errors for public endpoints
        }
      }
      return true;
    }

    // Extract and verify token
    const authHeader = request.get('Authorization') as string | undefined;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthenticatedError();
    }

    const token = authHeader.slice(7);
    const principal = await this.tokenVerifier.verify(token);

    // Check for OperatorOnly
    const isOperatorOnly = this.reflector.getAllAndOverride<boolean>(IS_OPERATOR_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isOperatorOnly) {
      if (principal.realm !== 'workforce' || !principal.roles.includes('platform.operator')) {
        throw new ForbiddenError('operator_only', 'Operator access required');
      }
      // Operators don't need host validation
      request.principal = principal;
      RequestContext.patch({
        tenantId: principal.tenantId,
        actor: pseudonymiseActor(principal.userRef, process.env.ACTOR_PEPPER || ''),
      });
      return true;
    }

    // Resolve tenant from Host header
    const host = request.get('Host') as string | undefined;
    if (!host) {
      throw new UnauthenticatedError();
    }

    const tenant = await this.tenantResolver.resolveByHost(host);
    if (!tenant) {
      throw new NotFoundError('tenant');
    }

    // Check tenant status
    if (tenant.status !== 'active') {
      throw new ForbiddenError('tenant_inactive', 'Tenant is not active');
    }

    // Verify token tenant matches host tenant
    if (principal.tenantId !== tenant.tenantId) {
      this.logger.security('security.tenant_mismatch', 'Token tenant does not match host tenant', {
        tokenTenant: principal.tenantId,
        hostTenant: tenant.tenantId,
      });
      throw new ForbiddenError('tenant_mismatch', 'Tenant mismatch');
    }

    // Attach principal and patch context
    request.principal = principal;
    RequestContext.patch({
      tenantId: principal.tenantId,
      actor: pseudonymiseActor(principal.userRef, process.env.ACTOR_PEPPER || ''),
    });

    return true;
  }
}
