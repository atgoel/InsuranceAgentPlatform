import { CapabilityManifest, Operation } from '../../domain/capability-manifest';
import { CallOutcome } from '../../domain/outcome';
import { CanonicalQuoteRequest, CanonicalProposal, PaymentLinkRequest } from '../../domain/canonical';
import { AdapterContext, InsurerAdapter } from '../../application/ports';
export class FakeInsurerAdapter implements InsurerAdapter {
  readonly calls: Array<{
    operation: Operation;
    key: string;
    tenantId: string;
  }> = [];
  readonly scripted = new Map<Operation, Array<CallOutcome<unknown>>>();
  latencyMs = 0;
  constructor(private readonly capabilities: CapabilityManifest = {
    adapterId: 'fake-insurer',
    adapterVersion: '1.0.0',
    counterparty: {
      kind: 'INSURER',
      insurerId: 'ins_fake',
      name: 'Sandbox insurer'
    },
    auth: 'NONE',
    lines: (['LIFE', 'HEALTH', 'GENERAL'] as const).map((line) => ({
      line,
      operations: (['QUOTE', 'SUBMIT_PROPOSAL', 'GET_STATUS', 'PAYMENT_LINK'] as const).map((operation) => ({
        operation,
        route: 'API' as const,
        mode: 'SYNC' as const,
        timeoutMs: 1000,
        schemaVersions: ['v1'],
      })),
    })),
  }) { }
  manifest(): CapabilityManifest {
    return structuredClone(this.capabilities);
  }
  quote(ctx: AdapterContext, req: CanonicalQuoteRequest) {
    return this.respond(ctx, 'QUOTE', {
      schemaVersion: 'v1' as const,
      insurerQuoteRef: req.quoteRequestId,
      premium: {
        amountPaise: 100000,
        currency: 'INR' as const
      },
      validUntil: '2099-01-01T00:00:00.000Z',
    });
  }
  submitProposal(ctx: AdapterContext, req: CanonicalProposal) {
    return this.respond(ctx, 'SUBMIT_PROPOSAL', {
      schemaVersion: 'v1' as const,
      insurerRef: req.proposalId,
      acknowledgedAt: req.confirmedAt
    });
  }
  getStatus(ctx: AdapterContext, ref: {
    idempotencyKey: string;
    insurerRef?: string;
  }) {
    return this.respond(ctx, 'GET_STATUS', {
      schemaVersion: 'v1' as const,
      status: 'RECEIVED' as const,
      insurerRef: ref.insurerRef ?? ref.idempotencyKey,
      checkedAt: '2026-10-04T00:00:00.000Z',
    });
  }
  paymentLink(ctx: AdapterContext, _req: PaymentLinkRequest) {
    return this.respond(ctx, 'PAYMENT_LINK', {
      url: 'https://sandbox.insurer.example/payment',
      expiresAt: '2099-01-01T00:00:00.000Z'
    });
  }
  probe(ctx: AdapterContext) {
    return this.respond(ctx, 'GET_STATUS', {
      latencyMs: this.latencyMs
    });
  }
  private async respond<T>(ctx: AdapterContext, operation: Operation, value: T): Promise<CallOutcome<T>> {
    this.calls.push({
      operation,
      key: ctx.idempotencyKey,
      tenantId: ctx.tenantId
    });
    if (this.latencyMs > 0)
      await new Promise<void>((resolve) => setTimeout(resolve, this.latencyMs));
    return (this.scripted.get(operation)?.shift() as CallOutcome<T> | undefined) ?? {
      kind: 'success',
      value
    };
  }
}
