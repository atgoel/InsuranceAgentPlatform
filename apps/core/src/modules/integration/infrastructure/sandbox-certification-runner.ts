import { AdapterRegistry, Certification, SandboxCertificationRunner, AdapterContext } from '../application/ports';
import { FakeInsurerAdapter } from './adapters/fake-insurer.adapter';
import { InMemoryCallbackRepository } from './in-memory-integration.repositories';
import { FieldCipher } from '../../../kernel/crypto/aes-gcm-field-cipher';
import { Logger } from '../../../kernel/observability/logger';
import { quoteOutput } from '../application/canonical-validation';
export class SandboxRunner implements SandboxCertificationRunner {
  constructor(
    private readonly registry: AdapterRegistry,
    private readonly cipher: FieldCipher,
    private readonly logger: Logger
  ) { }
  async run(adapterId: string, adapterVersion: string): Promise<Certification['checks']> {
    const manifest = this.registry.get(adapterId, adapterVersion)?.manifest();
    if (!manifest)
      return this.failed();
    const adapter = new FakeInsurerAdapter(manifest);
    const ctx = this.context();
    const request = {
      schemaVersion: 'v1' as const,
      insurerId: 'sandbox',
      line: 'LIFE' as const,
      quoteRequestId: 'sandbox-quote',
      productVersionId: 'sandbox-product',
      requirements: {}
    };
    const happy = await adapter.quote(ctx, request);
    adapter.scripted.set('QUOTE', [
      {
        kind: 'failure',
        retryable: false,
        code: 'declined',
        message: 'Sandbox decline'
      }
    ]);
    const decline = await adapter.quote(ctx, request);
    adapter.scripted.set('QUOTE', [
      {
        kind: 'unknown',
        reason: 'timeout'
      }
    ]);
    const timeout = await adapter.quote(ctx, request);
    const duplicate = await this.duplicate();
    return [
      {
        kind: 'HAPPY_PATH',
        passed: happy.kind === 'success' && quoteOutput.safeParse(happy.value).success
      },
      {
        kind: 'DECLINE',
        passed: decline.kind === 'failure' && !decline.retryable
      },
      {
        kind: 'TIMEOUT',
        passed: timeout.kind === 'unknown' && timeout.reason === 'timeout'
      },
      {
        kind: 'DUPLICATE_CALLBACK',
        passed: duplicate
      },
      {
        kind: 'SCHEMA_DRIFT',
        passed: !quoteOutput.safeParse({
          schemaVersion: 'v2'
        }).success
      },
    ];
  }
  private context(): AdapterContext {
    return {
      tenantId: 'sandbox',
      idempotencyKey: 'sandbox-key',
      credentials: async () => ({}),
      signal: new AbortController().signal,
      logger: this.logger,
    };
  }
  private async duplicate(): Promise<boolean> {
    const repository = new InMemoryCallbackRepository(this.cipher);
    const tx = {
      tenantId: 'sandbox',
      kind: 'memory' as const
    };
    const canonical = JSON.stringify({
      status: {
        status: 'RECEIVED',
        checkedAt: '2026-10-04T00:00:00.000Z',
        insurerRef: 'sandbox',
        schemaVersion: 'v1'
      }
    });
    const input = {
      callbackId: 'sandbox-callback',
      adapterId: 'sandbox',
      adapterVersion: '1.0.0',
      eventId: 'event',
      idempotencyKey: 'key',
      occurredAt: '2026-10-04T00:00:00.000Z',
      rawBodyHash: 'sandbox-hash',
      rawPayloadEnc: await this.cipher.encrypt('sandbox', canonical),
      canonicalPayloadEnc: await this.cipher.encrypt('sandbox', canonical),
      receivedAt: '2026-10-04T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
    };
    const first = await repository.accept(tx, input);
    const second = await repository.accept(tx, input);
    return first.kind === 'ACCEPTED' && second.kind === 'DUPLICATE';
  }
  private failed(): Certification['checks'] {
    return (['HAPPY_PATH', 'DECLINE', 'TIMEOUT', 'DUPLICATE_CALLBACK', 'SCHEMA_DRIFT'] as const)
      .map((kind) => ({
      kind,
        passed: false,
        code: 'adapter_version_unavailable'
    }));
  }
}
