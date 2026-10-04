import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG, CLOCK, ID_GENERATOR, LOGGER, METRICS, OUTBOX, UNIT_OF_WORK } from '../../../kernel/tokens';
import { AuditLog } from '../../../kernel/audit/audit-log';
import { ChangeRecorder } from '../../../kernel/audit/change-recorder';
import { Clock } from '../../../kernel/domain/clock';
import { IdGenerator } from '../../../kernel/domain/id-generator';
import { FieldCipher } from '../../../kernel/crypto/aes-gcm-field-cipher';
import { Logger } from '../../../kernel/observability/logger';
import { MetricsRegistry } from '../../../kernel/observability/metrics';
import { Outbox } from '../../../kernel/outbox/outbox';
import { UnitOfWork } from '../../../kernel/persistence/unit-of-work';
import { FIELD_CIPHER } from '../../party/application/ports';
import { RANDOM_SOURCE, RandomSource } from './ports';
@Injectable()
export class IntegrationRuntime {
  constructor(
  @Inject(CLOCK)
  readonly clock: Clock,
  @Inject(ID_GENERATOR)
  readonly ids: IdGenerator,
  @Inject(LOGGER)
  readonly logger: Logger,
  @Inject(METRICS)
  readonly metrics: MetricsRegistry,
  @Inject(FIELD_CIPHER)
  readonly cipher: FieldCipher,
  @Inject(RANDOM_SOURCE)
  readonly random: RandomSource) {
    this.logger = logger.child({ module: 'integration' });
  }
}
@Injectable()
export class IntegrationContext {
  readonly recorder: ChangeRecorder;
  constructor(
  @Inject(UNIT_OF_WORK)
  readonly uow: UnitOfWork,
  @Inject(OUTBOX)
  outbox: Outbox,
  @Inject(AUDIT_LOG)
  readonly audit: AuditLog, readonly runtime: IntegrationRuntime) {
    this.recorder = new ChangeRecorder('integration', {
      outbox,
      auditLog: audit,
      clock: runtime.clock,
      ids: runtime.ids,
    });
  }
}
