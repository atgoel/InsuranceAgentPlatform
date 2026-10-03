-- M04 Postgres adapters: exact "assigned today" capacity, dedicated sync bookkeeping, query indexes.
alter table crm_lead add column if not exists assigned_at timestamptz;   -- set by the repository whenever the owner changes (routing capacity counts it)

-- Leads assigned before this migration: the best available assignment time is the last update (the in-memory adapter's approximation).
update crm_lead set assigned_at = updated_at where owner_member_id is not null and assigned_at is null;

-- Public capture rate window: expired rows are pruned by the guard on each check.
grant delete on crm_public_lead_rate to iap_app;
create index if not exists crm_public_lead_rate_window_idx on crm_public_lead_rate (tenant_id, window_start);

create index if not exists crm_lead_assigned_idx on crm_lead (tenant_id, owner_member_id, assigned_at);
create index if not exists crm_lead_created_idx on crm_lead (tenant_id, created_at, id);
create index if not exists crm_task_escalation_idx on crm_task (tenant_id, due_at) where status = 'OPEN' and escalated_at is null;
create index if not exists crm_task_subject_idx on crm_task (tenant_id, subject_type, subject_id) where status = 'OPEN';
create index if not exists crm_opportunity_party_idx on crm_opportunity (tenant_id, party_id);
create index if not exists crm_opportunity_owner_idx on crm_opportunity (tenant_id, owner_member_id);

-- Sync bookkeeping kept apart from the aggregates so a background sync never bumps a version (person is keyed by party id, which has no sync columns).
create table if not exists crm_sync_state (
  tenant_id text not null references tenant(id), object text not null check (object in ('person','lead','opportunity','task')), id text not null,
  state text not null check (state in ('synced','pending','failed','local')), external_ref text,
  attempts int not null default 0, last_error text, updated_at timestamptz not null,
  primary key (tenant_id, object, id)
);
select iap_enable_tenant_rls('crm_sync_state');
grant select, insert, update on crm_sync_state to iap_app;
