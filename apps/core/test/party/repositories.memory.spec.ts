import { InMemoryUnitOfWork } from '../../src/kernel/persistence/in-memory-unit-of-work';
import {
  InMemoryConsentRepository, InMemoryDuplicateRepository, InMemoryHouseholdRepository, InMemoryPartyRepository, InMemoryRoleLinkRepository,
  InMemorySuppressionRepository,
} from '../../src/modules/party/infrastructure/in-memory-party.repositories';
import { partyRepositoriesContract } from './repositories.contract';

partyRepositoriesContract('In-memory party repositories', async () => {
  const uow = new InMemoryUnitOfWork();
  return {
    repos: {
      party: new InMemoryPartyRepository(), consent: new InMemoryConsentRepository(), suppression: new InMemorySuppressionRepository(),
      household: new InMemoryHouseholdRepository(), roleLinks: new InMemoryRoleLinkRepository(), duplicates: new InMemoryDuplicateRepository(),
    },
    run: (tenantId, work) => uow.run(tenantId, work),
    tenantA: 'ten_mem_a',
    tenantB: 'ten_mem_b',
    suffix: 'mem',
  };
});
