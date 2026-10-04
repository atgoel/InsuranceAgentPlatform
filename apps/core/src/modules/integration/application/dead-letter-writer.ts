import { Injectable } from '@nestjs/common';
import { integrationPolicy } from '../domain/integration-policy';
import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { DeadLetter, ReplayPayload } from './ports';
import { IntegrationContext } from './integration-context';
import { IntegrationWork } from './integration-resources';
@Injectable()
export class DeadLetterWriter {
  constructor(private readonly context: IntegrationContext, private readonly work: IntegrationWork) { }
  async create(tx: Transaction, input: {
    adapterId: string;
    adapterVersion: string;
    operation: DeadLetter['operation'];
    idempotencyKey: string;
    payload: ReplayPayload;
    attempts: number;
    lastError: string;
    replayedFromId?: string;
  }): Promise<DeadLetter> {
    const { runtime } = this.context;
    const now = runtime.clock.now();
    const payloadRef = runtime.ids.next('ipld');
    const payloadExpiresAt = new Date(now.getTime() + integrationPolicy.payloadRetentionMs).toISOString();
    await this.work.payloads.put(tx, {
      id: payloadRef,
      payloadEnc: await runtime.cipher.encrypt(tx.tenantId, JSON.stringify(input.payload)),
      expiresAt: payloadExpiresAt,
    });
    const entry: DeadLetter = {
      id: runtime.ids.next('idl'),
      adapterId: input.adapterId,
      adapterVersion: input.adapterVersion,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      payloadRef,
      payloadExpiresAt,
      attempts: input.attempts,
      lastError: input.lastError,
      replayedFromId: input.replayedFromId,
      ownerTeam: 'INTEGRATION_OPS',
      status: 'OPEN',
      createdAt: now.toISOString(),
    };
    await this.work.letters.save(tx, entry);
    await this.context.audit.append(tx, {
      action: 'integration.dead_letter.created',
      entityType: 'DeadLetter',
      entityId: entry.id
    });
    return entry;
  }
}
