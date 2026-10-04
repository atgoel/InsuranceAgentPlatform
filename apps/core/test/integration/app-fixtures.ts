import { createTestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { IntegrationModule } from '../../src/modules/integration/integration.module';
import { RegisteredAdapters } from '../../src/modules/integration/infrastructure/adapter-registry';
import { AssistedAdapter } from '../../src/modules/integration/infrastructure/adapters/assisted.adapter';
import { FakeInsurerAdapter } from '../../src/modules/integration/infrastructure/adapters/fake-insurer.adapter';
import { Principal } from '../../src/kernel/tenancy/principal';
import * as ports from '../../src/modules/integration/application/ports';
import { UNIT_OF_WORK } from '../../src/kernel/tokens';
import { UnitOfWork } from '../../src/kernel/persistence/unit-of-work';
export const principal: Principal = {
  tenantId: 'ten_acme',
  userRef: 'admin',
  roles: ['TENANT_ADMIN'],
  realm: 'customers'
};
export const proposal = {
  schemaVersion: 'v1' as const,
  insurerId: 'ins_fake',
  line: 'LIFE' as const,
  proposalId: 'proposal_1',
  productVersionId: 'pv_1',
  quoteOptionId: 'qo_1',
  templateVersion: 'v1',
  snapshotHash: 'frozen-hash',
  answers: {
    name: 'CANARY_PRIVATE_VALUE'
  },
  parties: [
    {
      partyId: 'party_1',
      role: 'PROPOSER' as const
    }
  ],
  declarations: [
    {
      key: 'health',
      version: 'v1',
      acceptedAt: '2026-01-01T00:00:00.000Z'
    }
  ],
  documents: [],
  confirmedAt: '2026-01-01T00:00:00.000Z',
};
export const quote = {
  schemaVersion: 'v1' as const,
  insurerId: 'ins_fake',
  line: 'LIFE' as const,
  quoteRequestId: 'quote_1',
  productVersionId: 'pv_1',
  requirements: {
    name: 'CANARY_PRIVATE_VALUE'
  }
};
export async function integrationApp(adapter = new FakeInsurerAdapter()) {
  const app = await createTestApp({
    imports: [IntegrationModule],
    overrides: [
      {
        token: ports.ADAPTER_REGISTRY,
        value: new RegisteredAdapters([new AssistedAdapter(), adapter])
      },
      {
        token: ports.CREDENTIAL_VAULT,
        value: {
          resolve: async () => ({
            callbackSecret: 'callback-test-secret'
          })
        }
      },
      {
        token: ports.RANDOM_SOURCE,
        value: {
          next: () => 0
        }
      },
      {
        token: ports.INSURER_URL_ALLOWLIST,
        value: {
          ins_fake: ['https://sandbox.insurer.example']
        }
      },
    ]
  });
  const uow = app.app.get<UnitOfWork>(UNIT_OF_WORK);
  const pins = app.app.get<ports.PinRepository>(ports.PIN_REPOSITORY);
  const certs = app.app.get<ports.CertificationRepository>(ports.CERTIFICATION_REPOSITORY);
  await uow.run(principal.tenantId, async (tx) => {
    await pins.put(tx, {
      adapterId: adapter.manifest().adapterId,
      version: adapter.manifest().adapterVersion,
      updatedAt: app.clock.now().toISOString()
    });
    await certs.save(tx, {
      adapterId: adapter.manifest().adapterId,
      adapterVersion: adapter.manifest().adapterVersion,
      status: 'PASSED',
      checkedAt: app.clock.now().toISOString(),
      checks: []
    });
  });
  return {
    ...app,
    adapter,
    uow
  };
}
export const adminToken = () => tokenFor({
  tenantId: 'ten_acme',
  roles: ['TENANT_ADMIN']
});
