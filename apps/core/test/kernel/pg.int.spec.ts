import { Pool } from 'pg';
import { FixedClock } from '../../src/kernel/domain/clock';
import { UlidIdGenerator } from '../../src/kernel/domain/id-generator';
import { Redactor } from '../../src/kernel/observability/redactor';
import { PgUnitOfWork } from '../../src/kernel/persistence/pg-unit-of-work';
import { PgAuditLog } from '../../src/kernel/audit/pg-audit-log';
import { PgOutbox } from '../../src/kernel/outbox/pg-outbox';
import { PgIdempotencyStore } from '../../src/kernel/idempotency/pg-idempotency-store';
import { DomainEventFactory } from '../../src/kernel/domain/domain-event';
import { runMigrations, MIGRATIONS_DIR } from '../../src/kernel/db/migrate';
import { Tracer } from '../../src/kernel/observability/tracer';
import { MetricsRegistry } from '../../src/kernel/observability/metrics';

/**
 * AC-M00-23
 * Postgres integration tests for RLS, migrations, and persistence layer.
 * Skip when DATABASE_URL is not set.
 */
(process.env.DATABASE_URL ? describe : describe.skip)(
  'postgres integration (AC-M00-23)',
  () => {
    let migrationPool: Pool;
    let appPool: Pool;
    let clock: FixedClock;
    let ids: UlidIdGenerator;
    let tracer: Tracer;

    beforeAll(async () => {
      const databaseUrl = process.env.DATABASE_URL;

      // Migration pool (owner role)
      migrationPool = new Pool({
        connectionString: process.env.MIGRATION_DATABASE_URL || databaseUrl,
      });

      // App pool (app role with RLS)
      appPool = new Pool({
        connectionString: databaseUrl,
      });

      clock = new FixedClock();
      ids = new UlidIdGenerator(clock);
      const metrics = new MetricsRegistry();
      tracer = new Tracer(clock, metrics);

      // Run migrations
      await runMigrations(migrationPool, MIGRATIONS_DIR);
    });

    afterAll(async () => {
      await appPool.end();
      await migrationPool.end();
    });

    describe('migration runner', () => {
      it('applies migrations idempotently', async () => {
        // Migrations should have been applied in beforeAll
        const result = await migrationPool.query(
          'SELECT name FROM schema_migrations ORDER BY name',
        );

        expect(result.rows.length).toBeGreaterThan(0);
        expect(result.rows.some((r) => r.name === '000_kernel')).toBe(true);
      });

      it('runs migrations twice without error', async () => {
        // Run migrations again
        const result = await runMigrations(migrationPool, MIGRATIONS_DIR);

        // Should complete without error
        expect(Array.isArray(result)).toBe(true);
      });
    });

    describe('PgUnitOfWork and RLS', () => {
      let unitOfWork: PgUnitOfWork;

      beforeAll(() => {
        unitOfWork = new PgUnitOfWork(appPool, tracer);
      });

      it('sets app.tenant_id per transaction', async () => {
        const tenantId = 'ten_rls_test_' + Date.now();

        await unitOfWork.run(tenantId, async (tx) => {
          const result = await tx.query('SELECT current_setting($1)', [
            'app.tenant_id',
          ]);
          expect(result.rows[0].current_setting).toBe(tenantId);
        });
      });

      it('rolls back on error', async () => {
        const tenantId = 'ten_rollback_test_' + Date.now();

        try {
          await unitOfWork.run(tenantId, async (tx) => {
            await tx.query(
              'INSERT INTO audit_event (id, tenant_id, actor, action, entity_type, entity_id, occurred_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
              [
                'evt_test',
                tenantId,
                'system',
                'test',
                'test',
                'test_001',
                new Date().toISOString(),
              ],
            );
            throw new Error('Simulate failure');
          });
        } catch {
          // Expected to fail
        }

        // Verify the insert was rolled back
        const result = await appPool.query(
          'SELECT * FROM audit_event WHERE id = $1',
          ['evt_test'],
        );
        expect(result.rows).toHaveLength(0);
      });
    });

    describe('RLS isolation', () => {
      let auditLog: PgAuditLog;
      let unitOfWork: PgUnitOfWork;

      beforeAll(() => {
        auditLog = new PgAuditLog(clock, ids, new Redactor());
        unitOfWork = new PgUnitOfWork(appPool, tracer);
      });

      it('hides tenant A audit events from tenant B', async () => {
        const tenantA = 'ten_a_' + Date.now();
        const tenantB = 'ten_b_' + Date.now();

        // Tenant A creates an audit event
        await unitOfWork.run(tenantA, async (_txA) => {
          await auditLog.append(_txA, {
            action: 'create',
            entityType: 'lead',
            entityId: 'lead_001',
          });
        });

        // Tenant B tries to read all audit events
        const result = await unitOfWork.run(tenantB, async (tx) => {
          const rows = await tx.query('SELECT COUNT(*) FROM audit_event');
          return rows;
        });

        // Tenant B should see 0 rows due to RLS
        expect(result.rows[0].count).toBe('0');
      });

      it('hides tenant A outbox events from tenant B', async () => {
        const tenantA = 'ten_outbox_a_' + Date.now();
        const tenantB = 'ten_outbox_b_' + Date.now();
        const eventFactory = new DomainEventFactory(clock, ids);
        const outbox = new PgOutbox(appPool);

        // Tenant A adds an event
        await unitOfWork.run(tenantA, async (_txA) => {
          const event = eventFactory.create({
            type: 'test.event.created',
            source: 'test',
            subject: 'test_001',
            tenantId: tenantA,
            data: {},
          });
          await outbox.add(_txA, event);
        });

        // Tenant B queries
        const result = await unitOfWork.run(tenantB, async (tx) => {
          const rows = await tx.query('SELECT COUNT(*) FROM outbox_event');
          return rows;
        });

        expect(result.rows[0].count).toBe('0');
      });

      it('hides tenant A idempotency records from tenant B', async () => {
        const tenantA = 'ten_idem_a_' + Date.now();
        const tenantB = 'ten_idem_b_' + Date.now();
        const store = new PgIdempotencyStore(appPool, clock);

        // Tenant A creates an idempotency record
        await unitOfWork.run(tenantA, async (_txA) => {
          await store.begin(tenantA, 'key_001', 'hash_001');
        });

        // Tenant B tries to read
        const result = await unitOfWork.run(tenantB, async (tx) => {
          const rows = await tx.query(
            'SELECT COUNT(*) FROM idempotency_record',
          );
          return rows;
        });

        expect(result.rows[0].count).toBe('0');
      });
    });

    describe('PgAuditLog', () => {
      let auditLog: PgAuditLog;
      let unitOfWork: PgUnitOfWork;

      beforeAll(() => {
        auditLog = new PgAuditLog(clock, ids, new Redactor());
        unitOfWork = new PgUnitOfWork(appPool, tracer);
      });

      it('stores audit events with hashes', async () => {
        const tenantId = 'ten_audit_' + Date.now();

        const event = await unitOfWork.run(tenantId, async (tx) => {
          return await auditLog.append(tx, {
            action: 'create',
            entityType: 'lead',
            entityId: 'lead_001',
            before: { status: 'NEW' },
            after: { status: 'ROUTED' },
          });
        });

        expect(event.beforeHash).toBeDefined();
        expect(event.afterHash).toBeDefined();
        expect(event.before).toBeUndefined();
        expect(event.after).toBeUndefined();
      });
    });

    describe('PgOutbox', () => {
      let outbox: PgOutbox;
      let unitOfWork: PgUnitOfWork;
      let eventFactory: DomainEventFactory;

      beforeAll(() => {
        outbox = new PgOutbox(migrationPool) /* relay reads across tenants as the owner role */;
        unitOfWork = new PgUnitOfWork(appPool, tracer);
        eventFactory = new DomainEventFactory(clock, ids);
      });

      it('stores events in the outbox', async () => {
        const tenantId = 'ten_outbox_' + Date.now();

        const event = eventFactory.create({
          type: 'test.event.created',
          source: 'test',
          subject: 'test_001',
          tenantId,
          data: { value: 123 },
        });

        await unitOfWork.run(tenantId, async (tx) => {
          await outbox.add(tx, event);
        });

        // Fetch unpublished events
        const unpublished = await outbox.fetchUnpublished(10);
        expect(unpublished.some((e) => e.id === event.id)).toBe(true);
      });
    });

    describe('PgIdempotencyStore', () => {
      let store: PgIdempotencyStore;

      beforeAll(() => {
        store = new PgIdempotencyStore(appPool, clock);
      });

      it('stores idempotency records', async () => {
        const tenantId = 'ten_idem_store_' + Date.now();

        const result = await store.begin(tenantId, 'key_001', 'hash_001');
        expect(result.state).toBe('new');

        await store.complete(tenantId, 'key_001', 201, { id: 'created' });

        const replay = await store.begin(tenantId, 'key_001', 'hash_001');
        expect(replay.state).toBe('replay');
        if (replay.state === 'replay') {
          expect(replay.status).toBe(201);
          expect(replay.body).toEqual({ id: 'created' });
        }
      });
    });
  },
);
