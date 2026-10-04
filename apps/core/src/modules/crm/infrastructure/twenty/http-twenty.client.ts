import { DependencyUnavailableError } from '../../../../kernel/errors/domain-errors';
import { TwentyClient, TwentyObject, WorkspaceRef } from '../../application/twenty-sync.ports';

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const TIMEOUT_MS = 5000;
const PATHS: Record<TwentyObject, string> = { person: 'people', lead: 'leads', opportunity: 'opportunities', task: 'tasks', note: 'notes' };

/**
 * Twenty REST client. The API key is resolved per workspace from its secret reference (never from config shared
 * across tenants); 5 s timeout; any non-2xx or malformed answer is a DependencyUnavailableError so the outbox retries.
 * Workspace mismatch is checked by the sync worker for every client.
 */
export class HttpTwentyClient implements TwentyClient {
  constructor(
    private readonly baseUrl: string,
    private readonly resolveApiKey: (secretRef: string) => Promise<string>,
    private readonly fetchFn: FetchLike,
  ) {}

  async upsert(
    workspace: WorkspaceRef,
    object: TwentyObject,
    externalRef: string | undefined,
    fields: Record<string, unknown>,
  ): Promise<{ id: string; workspaceId: string }> {
    const key = await this.resolveApiKey(workspace.apiKeySecretRef);
    const path = `${this.baseUrl}/rest/${PATHS[object]}${externalRef ? `/${encodeURIComponent(externalRef)}` : ''}`;
    const res = await this.fetchFn(path, {
      method: externalRef ? 'PATCH' : 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'x-workspace-id': workspace.workspaceId },
      body: JSON.stringify(fields),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => {
      throw new DependencyUnavailableError('twenty');
    });
    if (!res.ok) throw new DependencyUnavailableError('twenty');
    const body = (await res.json()) as { data?: { id?: unknown; workspaceId?: unknown } };
    const id = body.data?.id;
    const workspaceId = body.data?.workspaceId;
    if (typeof id !== 'string' || typeof workspaceId !== 'string') throw new DependencyUnavailableError('twenty');
    return { id, workspaceId };
  }
}
