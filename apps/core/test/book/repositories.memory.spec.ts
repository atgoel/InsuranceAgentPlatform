import { InMemoryUnitOfWork } from '../../src/kernel/persistence/unit-of-work';
import { InMemoryHeldPolicyRepository,InMemoryImportBatchRepository,InMemoryServicingRepository,InMemoryAlertLedger } from '../../src/modules/book/infrastructure/in-memory-book.repositories';
import { bookRepositoryContract } from './repositories.contract';
const uow=new InMemoryUnitOfWork();
bookRepositoryContract('memory',async()=>({policies:new InMemoryHeldPolicyRepository(),imports:new InMemoryImportBatchRepository(),servicing:new InMemoryServicingRepository(),ledger:new InMemoryAlertLedger(),tenantA:'a',tenantB:'b',suffix:'memory',run:(tenant,work)=>uow.run(tenant,work)}));
