import { InMemoryUnitOfWork } from '../../src/kernel/persistence/in-memory-unit-of-work';
import { InMemoryAdviceRepository, InMemoryBiRepository, InMemoryCalculatorRunRepository, InMemoryQuoteRepository } from '../../src/modules/advice/infrastructure/in-memory-advice.repositories';
import { adviceRepositoriesContract } from './repositories.contract';

let seq = 0;

adviceRepositoriesContract('AC-M06-11 in-memory', async () => {
  const uow = new InMemoryUnitOfWork();
  return {
    repos: { advice: new InMemoryAdviceRepository(), quotes: new InMemoryQuoteRepository(), bi: new InMemoryBiRepository(), runs: new InMemoryCalculatorRunRepository() },
    run: (tenantId, work) => uow.run(tenantId, work),
    newTenant: async () => `ten_mem_${(seq += 1)}`,
    uid: (label) => `${label}_${(seq += 1)}`,
  };
});
