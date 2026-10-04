import { InMemoryUnitOfWork } from '../../src/kernel/persistence/unit-of-work';
import { InMemoryAuditLog } from '../../src/kernel/audit/audit-log';
import { SequentialIdGenerator } from '../../src/kernel/domain/id-generator';
import { Redactor } from '../../src/kernel/observability/redactor';
import {
  InMemorySubmissionRepository, InMemoryCallbackRepository, InMemoryIntegrationCallbackReader,
  InMemoryIntegrationReconciliationReader, InMemoryDeadLetterRepository, InMemoryEncryptedPayloadRepository,
  InMemoryPinRepository, InMemoryCertificationRepository, InMemoryIntegrationHealthRepository, InMemoryIntegrationCallLog,
} from '../../src/modules/integration/infrastructure/in-memory-integration.repositories';
import { integrationRepositoryContract, repositoryCipher, repositoryClock } from './repositories.contract';

integrationRepositoryContract('memory', async () => {
  const uow = new InMemoryUnitOfWork();
  const submissions = new InMemorySubmissionRepository();
  const callbacks = new InMemoryCallbackRepository(repositoryCipher);
  const auditLog = new InMemoryAuditLog(repositoryClock, new SequentialIdGenerator(), new Redactor());
  return {
    submissions, callbacks,
    callbackReader: new InMemoryIntegrationCallbackReader({ callbacks, cipher: repositoryCipher, clock: repositoryClock, auditLog }),
    reconciliationReader: new InMemoryIntegrationReconciliationReader({ submissions, cipher: repositoryCipher, auditLog }),
    deadLetters: new InMemoryDeadLetterRepository(), payloads: new InMemoryEncryptedPayloadRepository(),
    pins: new InMemoryPinRepository(), certifications: new InMemoryCertificationRepository(),
    health: new InMemoryIntegrationHealthRepository(), calls: new InMemoryIntegrationCallLog(),
    auditEvents: auditLog.events,
    tenantA: 'integration-a', tenantB: 'integration-b', run: (tenant, work) => uow.run(tenant, work),
  };
});
