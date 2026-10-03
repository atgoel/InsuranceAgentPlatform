import { DependencyUnavailableError } from '../../../../kernel/errors/domain-errors';
import { FixedClock } from '../../../../kernel/domain/clock';
import { Tenant } from '../../../tenancy/domain/tenant';
import { TenantDirectory } from '../../application/ports';
import { CrmContext } from '../../application/crm-context';
import { DefaultCrmPortFactory } from '../../application/crm-port';
import { HttpTwentyClient, FetchLike } from './http-twenty.client';
import { InMemoryCrmSyncStateRepository } from './in-memory-sync-state.repository';
import { InMemoryLeadRepository, InMemoryOpportunityRepository, InMemoryTaskRepository } from '../in-memory-crm.repositories';
import { Task } from '../../domain/task';
import { WorkspaceRef } from '../../application/twenty-sync.ports';

const WORKSPACE: WorkspaceRef = { tenantId: 'ten_a', workspaceId: 'ws_ten_a', apiKeySecretRef: 'secret://twenty/ws_ten_a/api-key' };

describe('AC-M04-22 solo tenants never enqueue a Twenty sync', () => {
  const directory = (crmMode: 'solo_lite' | 'twenty'): TenantDirectory =>
    ({ findById: async (id: string) => Tenant.restore({ id, slug: id, displayName: id, kind: crmMode === 'twenty' ? 'ORGANISATION' : 'SOLO', status: 'active', planCode: 'BUSINESS', cell: 'cell-1', deploymentMode: 'pooled', crmMode, createdAt: '2026-01-01T00:00:00.000Z', version: 0 }) }) as unknown as TenantDirectory;
  const run = async (crmMode: 'solo_lite' | 'twenty') => {
    const recorded: string[] = [];
    const ctx = { clock: new FixedClock(), recorder: { record: async (_tx: unknown, c: { event?: { type: string } }) => void recorded.push(c.event?.type ?? '') } } as unknown as CrmContext;
    const sync = new InMemoryCrmSyncStateRepository();
    const factory = new DefaultCrmPortFactory(new InMemoryLeadRepository(), new InMemoryTaskRepository(), new InMemoryOpportunityRepository(), directory(crmMode), sync, ctx);
    const tx = { tenantId: 'ten_a', kind: 'memory' as const };
    const task = Task.create({ id: 'tsk_1', ownerMemberId: 'mem_1', subjectType: 'LEAD', subjectId: 'lead_1', kind: 'CALL', title: 'Call back', dueAt: '2026-01-02T00:00:00.000Z', source: 'MANUAL', now: new Date('2026-01-01T00:00:00Z') });
    await (await factory.forTenant('ten_a')).saveTask(tx, task);
    return { recorded, state: await sync.get(tx, 'task', 'tsk_1') };
  };

  it('AC-M04-22 solo_lite saves locally with no sync event and no sync state', async () => {
    expect(await run('solo_lite')).toEqual({ recorded: [], state: undefined });
  });

  it('AC-M04-22 twenty marks the record pending and enqueues crm.sync.requested in the same transaction', async () => {
    const { recorded, state } = await run('twenty');
    expect(recorded).toEqual(['crm.sync.requested']);
    expect(state).toMatchObject({ state: 'pending', attempts: 0 });
  });
});

describe('AC-M04-23 HttpTwentyClient', () => {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: string }> = [];
  const fetchReturning = (status: number, body: unknown): FetchLike => async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    return { ok: status < 300, status, json: async () => body };
  };
  const client = (f: FetchLike) => new HttpTwentyClient('https://twenty.example', async (ref) => `key-for-${ref}`, f);

  beforeEach(() => calls.splice(0));

  it('AC-M04-23 creates with POST and the workspace key, then patches by external ref', async () => {
    const ok = fetchReturning(200, { data: { id: 'tw_1', workspaceId: 'ws_ten_a' } });
    await expect(client(ok).upsert(WORKSPACE, 'lead', undefined, { core_id: 'lead_1' })).resolves.toEqual({ id: 'tw_1', workspaceId: 'ws_ten_a' });
    await client(ok).upsert(WORKSPACE, 'opportunity', 'tw 9', { core_id: 'opp_1' });
    expect(calls.map((c) => [c.method, c.url])).toEqual([['POST', 'https://twenty.example/rest/leads'], ['PATCH', 'https://twenty.example/rest/opportunities/tw%209']]);
    expect(calls[0]?.headers).toEqual({ authorization: 'Bearer key-for-secret://twenty/ws_ten_a/api-key', 'content-type': 'application/json', 'x-workspace-id': 'ws_ten_a' });
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ core_id: 'lead_1' });
  });

  it.each([
    ['a 5xx', fetchReturning(503, {})],
    ['a malformed answer', fetchReturning(200, { data: { id: 7 } })],
    ['a network failure', (async () => { throw new Error('ECONNRESET'); }) as FetchLike],
  ])('AC-M04-23 %s is DependencyUnavailableError (the outbox retries)', async (_label, f) => {
    await expect(client(f).upsert(WORKSPACE, 'task', undefined, {})).rejects.toBeInstanceOf(DependencyUnavailableError);
  });
});
