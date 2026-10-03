import { InMemoryUnitOfWork } from '../../src/kernel/persistence/in-memory-unit-of-work';
import {
  InMemoryChecklistRepository, InMemoryInsurerCodeRepository, InMemoryLeaveRepository, InMemoryLicenceRepository, InMemoryMemberRepository,
  InMemoryOrgUnitRepository, InMemoryRoleRepository,
} from '../../src/modules/distribution/infrastructure/in-memory-distribution.repositories';
import { describeDistributionRepositories } from './repositories.contract';

const uow = new InMemoryUnitOfWork();

describeDistributionRepositories(
  'in-memory',
  () => ({
    orgUnits: new InMemoryOrgUnitRepository(), members: new InMemoryMemberRepository(), checklists: new InMemoryChecklistRepository(), licences: new InMemoryLicenceRepository(),
    insurerCodes: new InMemoryInsurerCodeRepository(), leaves: new InMemoryLeaveRepository(), roles: new InMemoryRoleRepository(),
  }),
  (tenantId, work) => uow.run(tenantId, work),
);
