-- 000_kernel: outbox, inbox, audit log, idempotency + the tenant RLS helper used by every module (spec M00 §6.1).
-- Runs as the owner role (iap_owner). The application connects as iap_app, which has NOBYPASSRLS,
-- and sets `app.tenant_id` per transaction via set_config(..., true) in PgUnitOfWork.

-- Enables tenant isolation on a table. `force` also subjects the table owner to RLS; leave it off for tables
-- that cross-tenant platform jobs (running as owner) must read, e.g. the outbox relay.
create or replace function iap_enable_tenant_rls(tbl regclass, force boolean default true) returns void
language plpgsql as $$
begin
  execute format('alter table %s enable row level security', tbl);
  if force then
    execute format('alter table %s force row level security', tbl);
  end if;
  if not exists (select 1 from pg_policies where tablename = (select relname from pg_class where oid = tbl) and policyname = 'tenant_isolation') then
    execute format(
      'create policy tenant_isolation on %s using (tenant_id = current_setting(''app.tenant_id'', true)) with check (tenant_id = current_setting(''app.tenant_id'', true))',
      tbl);
  end if;
end $$;

create table if not exists outbox_event (
  id text primary key,
  tenant_id text not null,
  type text not null,
  source text not null,
  subject text not null,
  data jsonb not null,
  data_version int not null default 1,
  trace_id text,
  occurred_at timestamptz not null,
  published_at timestamptz,
  attempts int not null default 0,
  last_error text
);
create index if not exists outbox_unpublished_idx on outbox_event (occurred_at) where published_at is null;

create table if not exists inbox_message (
  consumer text not null,
  event_id text not null,
  processed_at timestamptz not null default now(),
  primary key (consumer, event_id)
);

create table if not exists audit_event (
  id text primary key,
  tenant_id text not null,
  actor text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  occurred_at timestamptz not null,
  trace_id text,
  before_hash text,
  after_hash text,
  metadata jsonb not null default '{}'
);
create index if not exists audit_event_entity_idx on audit_event (tenant_id, entity_type, entity_id, occurred_at desc);

create table if not exists idempotency_record (
  tenant_id text not null,
  key text not null,
  request_hash text not null,
  status text not null check (status in ('in_progress', 'completed')),
  response_status int,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (tenant_id, key)
);

select iap_enable_tenant_rls('audit_event');
select iap_enable_tenant_rls('idempotency_record');
-- Outbox: app writes are tenant-scoped; the relay (owner role) reads across tenants, so no FORCE.
select iap_enable_tenant_rls('outbox_event', false);

-- Least privilege for the application role. Audit is append-only (HLD Compliance & Audit).
grant select, insert on audit_event to iap_app;
grant select, insert, update, delete on idempotency_record to iap_app;
grant select, insert on outbox_event to iap_app;
grant select, insert on inbox_message to iap_app;
