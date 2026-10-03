-- AC-M00-23: Kernel schema and RLS policies

-- Outbox table
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

-- Inbox table
create table if not exists inbox_message (
  consumer text not null,
  event_id text not null,
  processed_at timestamptz not null default now(),
  primary key (consumer, event_id)
);

-- Audit table
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

-- Idempotency table
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

-- Enable RLS on sensitive tables
do $$
begin
  if not exists(
    select 1 from information_schema.table_constraints
    where table_name = 'audit_event' and constraint_name = 'tenant_isolation'
  ) then
    alter table audit_event enable row level security;
    alter table audit_event force row level security;
    create policy tenant_isolation on audit_event
      using (tenant_id = current_setting('app.tenant_id', true))
      with check (tenant_id = current_setting('app.tenant_id', true));
  end if;
end $$;

do $$
begin
  if not exists(
    select 1 from information_schema.table_constraints
    where table_name = 'idempotency_record' and constraint_name = 'tenant_isolation'
  ) then
    alter table idempotency_record enable row level security;
    alter table idempotency_record force row level security;
    create policy tenant_isolation on idempotency_record
      using (tenant_id = current_setting('app.tenant_id', true))
      with check (tenant_id = current_setting('app.tenant_id', true));
  end if;
end $$;

do $$
begin
  if not exists(
    select 1 from information_schema.table_constraints
    where table_name = 'outbox_event' and constraint_name = 'tenant_isolation'
  ) then
    alter table outbox_event enable row level security;
    alter table outbox_event force row level security;
    create policy tenant_isolation on outbox_event
      using (tenant_id = current_setting('app.tenant_id', true))
      with check (tenant_id = current_setting('app.tenant_id', true));
  end if;
end $$;

-- Grant permissions to app role
grant select, insert on audit_event to iap_app;
grant select, insert, update, delete on idempotency_record, outbox_event, inbox_message to iap_app;
