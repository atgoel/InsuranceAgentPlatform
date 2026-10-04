import { Injectable, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UnauthenticatedError, ForbiddenError, NotFoundError } from '../errors/domain-errors';
import { IS_PUBLIC_KEY, IS_OPERATOR_ONLY_KEY } from './decorators';
import { TOKEN_VERIFIER, TENANT_RESOLVER } from '../tokens';
import { TokenVerifier, Principal } from './jwt';
import { TenantResolver } from './tenant-resolver';
import { RequestContext } from '../observability/request-context';
import { Logger } from '../observability/logger';
import { pseudonymiseActor } from './actor-pseudonym';
import { KERNEL_OPTIONS, LOGGER, MFA_POLICY } from '../tokens';
import { MfaPolicy } from './permissions';
import { KernelConfig } from '../config';

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
    @Inject(KERNEL_OPTIONS) private readonly config: KernelConfig,
    @Inject(MFA_POLICY) private readonly mfaPolicy: MfaPolicy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest() as Record<string, unknown> & { get: (name: string) => string | undefined };
    const req = request as Record<string, unknown> & { principal?: Principal };

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);

    if (isPublic) {
      await this.handlePublicEndpoint(request);
      return true;
    }

    const principal = await this.verifyAuthorization(request);

    const isOperatorOnly = this.reflector.getAllAndOverride<boolean>(IS_OPERATOR_ONLY_KEY, [context.getHandler(), context.getClass()]);

    if (isOperatorOnly) {
      return this.handleOperatorOnly(req, principal);
    }

    return this.handleTenantValidation(req, principal, request);
  }

  private async handlePublicEndpoint(request: Record<string, unknown> & { get: (name: string) => string | undefined }): Promise<void> {
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
  }

  private async verifyAuthorization(request: Record<string, unknown> & { get: (name: string) => string | undefined }): Promise<Principal> {
    const authHeader = request.get('Authorization') as string | undefined;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthenticatedError();
    }
    const token = authHeader.slice(7);
    return this.tokenVerifier.verify(token);
  }

  private handleOperatorOnly(req: Record<string, unknown> & { principal?: Principal }, principal: Principal): boolean {
    if (principal.realm !== 'workforce' || !principal.roles.includes('platform.operator')) {
      throw new ForbiddenError('operator_only', 'Operator access required');
    }
    req.principal = principal;
    RequestContext.patch({
      tenantId: principal.tenantId,
      actor: pseudonymiseActor(principal.userRef, this.config.actorPepper),
    });
    return true;
  }

  private async handleTenantValidation(
    req: Record<string, unknown> & { principal?: Principal },
    principal: Principal,
    request: Record<string, unknown> & { get: (name: string) => string | undefined },
  ): Promise<boolean> {
    const host = request.get('Host') as string | undefined;
    if (!host) {
      throw new UnauthenticatedError();
    }

    const tenant = await this.tenantResolver.resolveByHost(host);
    if (!tenant) {
      throw new NotFoundError('tenant');
    }

    if (tenant.status !== 'active') {
      throw new ForbiddenError('tenant_inactive', 'Tenant is not active');
    }

    if (principal.tenantId !== tenant.tenantId) {
      this.logger.security('security.tenant_mismatch', 'Token tenant does not match host tenant', {
        tokenTenant: principal.tenantId,
        hostTenant: tenant.tenantId,
      });
      throw new ForbiddenError('tenant_mismatch', 'Tenant mismatch');
    }

    if (this.mfaPolicy.requiresMfa(principal.roles) && !principal.amr?.includes('mfa')) {
      this.logger.security('security.mfa_required', 'Privileged role used without multi-factor sign-in', { roles: principal.roles });
      throw new ForbiddenError('mfa_required', 'This role requires multi-factor sign-in');
    }

    req.principal = principal;
    RequestContext.patch({
      tenantId: principal.tenantId,
      actor: pseudonymiseActor(principal.userRef, this.config.actorPepper),
    });

    return true;
  }
}
