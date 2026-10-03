import { Injectable } from '@nestjs/common';
import { TwentyClient, TwentyObject, WorkspaceRef } from '../../application/twenty-sync.ports';

export interface FakeTwentyRecord { workspaceId: string; object: TwentyObject; id: string; fields: Record<string, unknown> }

/** In-memory Twenty for development and tests; can be switched to fail or to answer from another workspace. */
@Injectable()
export class FakeTwentyClient implements TwentyClient {
  readonly records = new Map<string, FakeTwentyRecord>();
  failing = false;
  answerFromWorkspace?: string;
  private seq = 0;

  async upsert(workspace: WorkspaceRef, object: TwentyObject, externalRef: string | undefined, fields: Record<string, unknown>): Promise<{ id: string; workspaceId: string }> {
    if (this.failing) throw new Error('twenty unavailable');
    const id = externalRef ?? `tw_${object}_${(this.seq += 1)}`;
    this.records.set(id, { workspaceId: workspace.workspaceId, object, id, fields: { ...fields } });
    return { id, workspaceId: this.answerFromWorkspace ?? workspace.workspaceId };
  }

  find(object: TwentyObject, coreId: string): FakeTwentyRecord | undefined {
    const key = object === 'person' ? 'core_party_id' : 'core_id';
    return [...this.records.values()].find((r) => r.object === object && r.fields[key] === coreId);
  }
}
