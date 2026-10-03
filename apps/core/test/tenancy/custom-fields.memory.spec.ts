import { InMemoryUnitOfWork } from '../../src/kernel/persistence/in-memory-unit-of-work';
import { InMemoryCustomFieldRepository } from '../../src/modules/tenancy/infrastructure/in-memory-custom-field.repository';
import { customFieldRepositoryContract } from './custom-fields.contract';

const uow = new InMemoryUnitOfWork();
customFieldRepositoryContract('AC-CR001-04 In-memory custom field repository', async () => ({
  repo: new InMemoryCustomFieldRepository(), run: (tenantId, work) => uow.run(tenantId, work), tenantA: 'ten_mem_a', tenantB: 'ten_mem_b', suffix: 'mem',
}));
