import { InMemoryUnitOfWork } from '../../src/kernel/persistence/in-memory-unit-of-work';
import {
  InMemoryActivityRepository, InMemoryLeadImportRepository, InMemoryLeadRepository, InMemoryOpportunityRepository, InMemoryPublicLeadGuard,
  InMemoryRoutingRuleRepository, InMemoryTaskRepository,
} from '../../src/modules/crm/infrastructure/in-memory-crm.repositories';
import { InMemoryCrmSyncStateRepository } from '../../src/modules/crm/infrastructure/twenty/in-memory-sync-state.repository';
import { crmRepositoriesContract } from './repositories.contract';

let seq = 0;

crmRepositoriesContract('AC-M04-21 in-memory', async () => {
  const uow = new InMemoryUnitOfWork();
  return {
    repos: {
      leads: new InMemoryLeadRepository(), activities: new InMemoryActivityRepository(), tasks: new InMemoryTaskRepository(), opportunities: new InMemoryOpportunityRepository(),
      rules: new InMemoryRoutingRuleRepository(), imports: new InMemoryLeadImportRepository(), guard: new InMemoryPublicLeadGuard(), sync: new InMemoryCrmSyncStateRepository(),
    },
    run: (tenantId, work) => uow.run(tenantId, work),
    newTenant: async () => {
      seq += 1;
      return { tenantId: `ten_mem_${seq}`, parties: [`pty_${seq}_1`, `pty_${seq}_2`, `pty_${seq}_3`] };
    },
    uid: (label) => `${label}_${(seq += 1)}`,
  };
});
