import { Transaction } from '../../../kernel/persistence/unit-of-work';

/** Core records projected to Twenty (M04b). `person` is keyed by party id. */
export type SyncObject = 'person' | 'lead' | 'opportunity' | 'task';
export type SyncState = 'synced' | 'pending' | 'failed' | 'local';

export interface SyncStatus {
  state: SyncState;
  externalRef?: string;
  attempts: number;
  lastError?: string;
  updatedAt: string;
}

/**
 * Sync bookkeeping kept apart from the aggregates (the sync_state/external_ref columns), so a background
 * sync never bumps a record's version and never invalidates a user's If-Match.
 */
export interface CrmSyncStateRepository {
  get(tx: Transaction, object: SyncObject, id: string): Promise<SyncStatus | undefined>;
  set(tx: Transaction, object: SyncObject, id: string, status: SyncStatus): Promise<void>;
}

export interface WorkspaceRef {
  tenantId: string;
  workspaceId: string;
  apiKeySecretRef: string;
}

/** Workspace ↔ tenant and credentials come from the tenant directory only (HLD G6), never from a request. */
export interface TwentyWorkspaceDirectory {
  forTenant(tenantId: string): Promise<WorkspaceRef | undefined>;
  byWorkspace(workspaceId: string): Promise<{ ref: WorkspaceRef; webhookSecret: string } | undefined>;
}

export type TwentyObject = 'person' | 'lead' | 'opportunity' | 'task' | 'note';

export interface TwentyClient {
  upsert(workspace: WorkspaceRef, object: TwentyObject, externalRef: string | undefined, fields: Record<string, unknown>): Promise<{ id: string; workspaceId: string }>;
}

export const CRM_SYNC_STATE_REPOSITORY = Symbol('CrmSyncStateRepository');
export const TWENTY_WORKSPACE_DIRECTORY = Symbol('TwentyWorkspaceDirectory');
export const TWENTY_CLIENT = Symbol('TwentyClient');
