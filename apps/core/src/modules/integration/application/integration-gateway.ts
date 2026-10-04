import { Injectable } from '@nestjs/common';
import { Principal } from '../../../kernel/tenancy/principal';
import { CanonicalTarget, CanonicalQuoteRequest, CanonicalProposal, StatusRequest, PaymentLinkRequest } from '../domain/canonical';
import { CallOutcome } from '../domain/outcome';
import { Operation, RouteKind } from '../domain/capability-manifest';
import { AdapterContext, GatewayResult, IntegrationGatewayPort } from './ports';
import { IntegrationContext } from './integration-context';
import { IntegrationResources } from './integration-resources';
import { IntegrationRouting } from './integration-routing';
import { IntegrationExecutor } from './integration-executor';
import { SubmissionService } from './submission.service';
import { DeadLetterWriter } from './dead-letter-writer';
import * as validation from './canonical-validation';
@Injectable()
export class IntegrationGateway implements IntegrationGatewayPort {
  constructor(
    private readonly context: IntegrationContext,
    private readonly resources: IntegrationResources,
    private readonly routing: IntegrationRouting,
    private readonly executor: IntegrationExecutor,
    private readonly submissions: SubmissionService,
    private readonly letters: DeadLetterWriter
  ) { }
  async quote(principal: Principal, input: CanonicalQuoteRequest, key: string) {
    const value = validation.validateInput(validation.quoteInput, input);
    return this.outbound(principal, value, key, 'QUOTE', async (ctx, adapterId, version) => {
      const adapter = this.routing.bound(adapterId, version);
      if (!adapter.quote)
        return this.unavailable();
      return validation.validateDocumentLinks(validation.validateOutcome(validation.quoteOutput,
        await adapter.quote(ctx, value)), input.insurerId, this.resources.allowlist);
    });
  }
  async submitProposal(principal: Principal, input: CanonicalProposal, key: string) {
    return this.submissions.submit(principal, validation.validateInput(validation.proposalInput, input), key);
  }
  async getStatus(principal: Principal, input: StatusRequest, key: string) {
    const value = validation.validateInput(validation.statusInput, input);
    return this.outbound(principal, value, key, 'GET_STATUS', async (ctx, adapterId, version) => {
      const adapter = this.routing.bound(adapterId, version);
      if (!adapter.getStatus)
        return this.unavailable();
      const outcome = validation.validateOutcome(validation.statusOutput, await adapter.getStatus(ctx, {
        idempotencyKey: key,
        insurerRef: value.insurerRef
      }));
      if (outcome.kind === 'success' && outcome.value.status === 'ISSUED' && /^[a-z][a-z0-9+.-]*:/i.test(outcome.value.documentRef)) {
        return validation.validateUrl(outcome, outcome.value.documentRef, input.insurerId, this.resources.allowlist);
      }
      return outcome;
    });
  }
  async paymentLink(principal: Principal, input: PaymentLinkRequest, key: string) {
    const value = validation.validateInput(validation.paymentInput, input);
    return this.outbound(principal, value, key, 'PAYMENT_LINK', async (ctx, adapterId, version) => {
      const adapter = this.routing.bound(adapterId, version);
      if (!adapter.paymentLink)
        return this.unavailable();
      const outcome = validation.validateOutcome(validation.paymentOutput, await adapter.paymentLink(ctx, value));
      return outcome.kind === 'success'
        ? validation.validateUrl(outcome, outcome.value.url, input.insurerId, this.resources.allowlist)
        : outcome;
    });
  }
  private async outbound<T>(
    principal: Principal,
    input: CanonicalTarget,
    key: string,
    operation: Operation,
    invoke: (ctx: AdapterContext, adapterId: string, version: string) => Promise<CallOutcome<T>>
  ): Promise<GatewayResult<T>> {
    const selected = await this.routing.select(principal.tenantId, input, operation);
    if (selected.route === 'ASSISTED')
      return {
        ...selected,
        outcome: {
          kind: 'unknown',
          reason: 'assisted'
        },
        instructions: {
          kind: 'INSURER_PORTAL',
          evidenceRequired: true
        },
      };
    const adapter = this.routing.bound(selected.adapterId, selected.adapterVersion);
    const result = await this.executor.run({
      tenantId: principal.tenantId,
      adapter,
      operation,
      key,
      route: selected.route,
      timeoutMs: this.routing.timeout(selected.adapterId, selected.adapterVersion, input, operation),
      invoke: (ctx) => invoke(ctx, selected.adapterId, selected.adapterVersion),
    });
    await this.recordFailure(principal, selected, operation, key, input, result);
    return {
      route: selected.route,
      adapterId: selected.adapterId,
      adapterVersion: selected.adapterVersion,
      reason: selected.reason,
      outcome: result.outcome,
    };
  }
  private async recordFailure<T>(principal: Principal, selected: {
    route: RouteKind;
    adapterId: string;
    adapterVersion: string;
  }, operation: Operation, key: string, input: CanonicalTarget, result: {
    outcome: CallOutcome<T>;
    attempts: number;
  }) {
    if (result.outcome.kind === 'success' || (operation !== 'QUOTE' && operation !== 'PAYMENT_LINK'))
      return;
    const spec = this.routing.spec(selected.adapterId, selected.adapterVersion, input, operation, selected.route);
    if (spec?.mode !== 'ASYNC')
      return;
    await this.context.uow.run(principal.tenantId, (tx) => this.letters.create(tx, {
      adapterId: selected.adapterId,
      adapterVersion: selected.adapterVersion,
      operation,
      idempotencyKey: key,
      payload: {
        kind: 'OUTBOUND',
        operation,
        input: input as CanonicalQuoteRequest | PaymentLinkRequest
      },
      attempts: result.attempts,
      lastError: result.outcome.kind === 'failure' ? result.outcome.code : 'outcome_unknown',
    }));
  }
  private unavailable(): CallOutcome<never> {
    return {
      kind: 'failure',
      retryable: false,
      code: 'dependency_unavailable',
      message: 'Integration unavailable'
    };
  }
}
