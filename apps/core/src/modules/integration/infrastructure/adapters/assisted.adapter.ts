import { CapabilityManifest } from '../../domain/capability-manifest';
import { CallOutcome } from '../../domain/outcome';
import { InsurerAdapter } from '../../application/ports';
export class AssistedAdapter implements InsurerAdapter {
  manifest(): CapabilityManifest {
    return {
      adapterId: 'assisted',
      adapterVersion: '1.0.0',
      counterparty: {
        kind: 'VENDOR',
        name: 'Assisted insurer portal'
      },
      auth: 'NONE',
      lines: (['LIFE', 'HEALTH', 'GENERAL'] as const).map((line) => ({
        line,
        operations: (['QUOTE', 'SUBMIT_PROPOSAL', 'GET_STATUS', 'PAYMENT_LINK'] as const).map((operation) => ({
          operation,
          route: 'ASSISTED' as const,
          mode: 'ASYNC' as const,
          schemaVersions: ['v1'],
        })),
      })),
    };
  }
  async quote(): Promise<CallOutcome<never>> {
    return {
      kind: 'unknown',
      reason: 'assisted'
    };
  }
  async submitProposal(): Promise<CallOutcome<never>> {
    return {
      kind: 'unknown',
      reason: 'assisted'
    };
  }
  async getStatus(): Promise<CallOutcome<never>> {
    return {
      kind: 'unknown',
      reason: 'assisted'
    };
  }
  async paymentLink(): Promise<CallOutcome<never>> {
    return {
      kind: 'unknown',
      reason: 'assisted'
    };
  }
  async probe(): Promise<CallOutcome<{
    latencyMs: number;
  }>> {
    return {
      kind: 'success',
      value: {
        latencyMs: 0
      }
    };
  }
}
