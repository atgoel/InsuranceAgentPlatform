import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG, CLOCK, ID_GENERATOR, LOGGER, METRICS, OUTBOX, UNIT_OF_WORK, CUSTOM_FIELD_DEFINITIONS } from '../../../kernel/tokens';
import { AuditLog } from '../../../kernel/audit/audit-log';
import { ChangeRecorder } from '../../../kernel/audit/change-recorder';
import { Clock } from '../../../kernel/domain/clock';
import { IdGenerator } from '../../../kernel/domain/id-generator';
import { Logger } from '../../../kernel/observability/logger';
import { MetricsRegistry } from '../../../kernel/observability/metrics';
import { Outbox } from '../../../kernel/outbox/outbox';
import { UnitOfWork } from '../../../kernel/persistence/unit-of-work';
import { CustomFieldDefinitionReader } from '../../../kernel/custom-fields';
@Injectable()
export class BookRuntime {
    constructor(
        @Inject(CLOCK) readonly clock: Clock,
        @Inject(ID_GENERATOR) readonly ids: IdGenerator,
        @Inject(METRICS) readonly metrics: MetricsRegistry,
        @Inject(LOGGER) readonly logger: Logger,
        @Inject(CUSTOM_FIELD_DEFINITIONS) readonly defs: CustomFieldDefinitionReader,
    ) {}
}

@Injectable()
export class BookContext {
    private readonly locks = new Map<string, Promise<void>>();
    readonly recorder: ChangeRecorder;
    readonly logger: Logger;
    readonly clock: Clock;
    readonly ids: IdGenerator;
    readonly metrics: MetricsRegistry;
    readonly defs: CustomFieldDefinitionReader;
    async exclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
        const previous = this.locks.get(key) ?? Promise.resolve();
        let release: () => void = () => undefined;
        const current = new Promise<void>(resolve => { release = resolve; });
        this.locks.set(key, current);
        await previous;
        try { return await work(); }
        finally { release(); if (this.locks.get(key) === current) this.locks.delete(key); }
    }
    constructor(
    @Inject(UNIT_OF_WORK)
    readonly uow: UnitOfWork,
    @Inject(OUTBOX)
    outbox: Outbox,
    @Inject(AUDIT_LOG)
    audit: AuditLog,
    runtime: BookRuntime) {
        this.clock = runtime.clock;
        this.ids = runtime.ids;
        this.metrics = runtime.metrics;
        this.defs = runtime.defs;
        this.logger = runtime.logger.child({ module: 'book' });
        this.recorder = new ChangeRecorder('book', { outbox, auditLog: audit, clock: this.clock, ids: this.ids });
    }
}
