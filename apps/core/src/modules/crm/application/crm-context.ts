import { Inject, Injectable } from '@nestjs/common';
import { CustomFieldDefinitionReader } from '../../../kernel/custom-fields';
import { AUDIT_LOG, CUSTOM_FIELD_DEFINITIONS, CLOCK, ID_GENERATOR, LOGGER, METRICS, OUTBOX, UNIT_OF_WORK } from '../../../kernel/tokens';
import { AuditLog } from '../../../kernel/audit/audit-log';
import { ChangeRecorder } from '../../../kernel/audit/change-recorder';
import { Outbox } from '../../../kernel/outbox/outbox';
import { Clock } from '../../../kernel/domain/clock';
import { IdGenerator } from '../../../kernel/domain/id-generator';
import { Logger } from '../../../kernel/observability/logger';
import { MetricsRegistry } from '../../../kernel/observability/metrics';
import { UnitOfWork } from '../../../kernel/persistence/unit-of-work';

/** Shared infrastructure for M04 use cases. */
@Injectable()
export class CrmContext {
  readonly recorder: ChangeRecorder;
  readonly logger: Logger;

  constructor(
    @Inject(UNIT_OF_WORK) readonly uow: UnitOfWork,
    @Inject(CLOCK) readonly clock: Clock,
    @Inject(ID_GENERATOR) readonly ids: IdGenerator,
    @Inject(METRICS) readonly metrics: MetricsRegistry,
    @Inject(LOGGER) logger: Logger,
    @Inject(OUTBOX) outbox: Outbox,
    @Inject(AUDIT_LOG) auditLog: AuditLog,
    /** CR-001: custom-field definitions (M01), read inside the caller's transaction. */
    @Inject(CUSTOM_FIELD_DEFINITIONS) readonly defs: CustomFieldDefinitionReader,
  ) {
    this.logger = logger.child({ module: 'crm' });
    this.recorder = new ChangeRecorder('crm', { outbox, auditLog, clock, ids });
  }
}
