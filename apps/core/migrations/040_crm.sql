-- M04a CRM Engagement: leads, activities, tasks, opportunities, routing, lead imports, public capture rate window.
create table if not exists crm_lead (
  id text primary key,
  tenant_id text not null references tenant(id),
  party_id text not null references party(id),
  product_interest text not null check (product_interest in ('TERM_LIFE','SAVINGS_LIFE','HEALTH','HEALTH_FLOATER','CHILD','RETIREMENT','MOTOR','OTHER')),
  pincode text check (pincode ~ '^[1-9][0-9]{5}$'), language text,
  stage text not null check (stage in ('NEW','CONTACTED','QUALIFIED','CONVERTED','LOST')),
  temperature text not null check (temperature in ('HOT','WARM','COLD')),
  owner_member_id text references member(id), org_unit_id text, routed_by_rule_id text,
  attribution jsonb not null, qualification jsonb not null default '{}', lost_reason text,
  sla_due_at timestamptz, first_responded_at timestamptz, sla_breach_notified_at timestamptz,
  stage_history jsonb not null, converted_opportunity_id text,
  sync_state text not null default 'local' check (sync_state in ('synced','pending','failed','local')), external_ref text,
  created_at timestamptz not null, updated_at timestamptz not null, version int not null default 1
);
create index if not exists crm_lead_owner_idx on crm_lead (tenant_id, owner_member_id, stage);
create index if not exists crm_lead_party_idx on crm_lead (tenant_id, party_id);
create index if not exists crm_lead_sla_idx on crm_lead (tenant_id, sla_due_at) where first_responded_at is null and stage in ('NEW','CONTACTED');

create table if not exists crm_activity (
  id text primary key,
  tenant_id text not null references tenant(id),
  subject_type text not null check (subject_type in ('LEAD','PARTY','OPPORTUNITY')), subject_id text not null,
  kind text not null, outcome text, summary text check (length(summary) <= 1000),
  occurred_at timestamptz not null, actor_member_id text, client_ref text,
  unique (tenant_id, client_ref)                      -- offline replays are stored once
);
create index if not exists crm_activity_subject_idx on crm_activity (tenant_id, subject_type, subject_id, occurred_at desc);

create table if not exists crm_task (
  id text primary key,
  tenant_id text not null references tenant(id),
  owner_member_id text not null,
  subject_type text not null check (subject_type in ('LEAD','PARTY','OPPORTUNITY','DUE','PROPOSAL')), subject_id text not null,
  kind text not null, title text not null check (length(title) between 2 and 140), due_at timestamptz not null,
  status text not null check (status in ('OPEN','DONE','CANCELLED')), outcome text,
  source text not null check (source in ('MANUAL','ROUTING','CADENCE','VOICE_NOTE','SYSTEM')),
  escalated_at timestamptz, created_at timestamptz not null, completed_at timestamptz,
  sync_state text not null default 'local', external_ref text, version int not null default 1
);
create index if not exists crm_task_owner_due_idx on crm_task (tenant_id, owner_member_id, status, due_at);

create table if not exists crm_opportunity (
  id text primary key,
  tenant_id text not null references tenant(id),
  party_id text not null references party(id), lead_id text references crm_lead(id),
  product_interest text not null, title text not null,
  expected_premium_paise bigint not null check (expected_premium_paise >= 0), currency char(3) not null default 'INR',
  stage text not null check (stage in ('DISCOVERY','QUOTE_SHARED','PROPOSAL_COMPLETE','INSURER_PENDING','ISSUED','LOST')),
  owner_member_id text not null, org_unit_id text, attribution jsonb, insurer_name text, lost_reason text,
  issued_policy_sale_id text, core_proposal_id text,
  stage_entered_at timestamptz not null, created_at timestamptz not null,
  sync_state text not null default 'local', external_ref text, version int not null default 1,
  check ((stage = 'ISSUED') = (issued_policy_sale_id is not null))   -- issued only with the insurer's sale reference
);
create index if not exists crm_opportunity_board_idx on crm_opportunity (tenant_id, stage, owner_member_id);

create table if not exists crm_routing_rule (
  tenant_id text not null references tenant(id), id text not null, priority int not null, body jsonb not null,
  primary key (tenant_id, id), unique (tenant_id, priority)
);
create table if not exists crm_routing_cursor (
  tenant_id text not null references tenant(id), rule_id text not null, last_member_id text, primary key (tenant_id, rule_id)
);
create table if not exists crm_lead_import (
  id text primary key, tenant_id text not null references tenant(id), file_checksum text not null, source_tag text not null,
  summary jsonb not null, created_at timestamptz not null, unique (tenant_id, file_checksum)
);
create table if not exists crm_lead_import_row (
  tenant_id text not null references tenant(id), row_hash text not null, batch_id text not null references crm_lead_import(id),
  primary key (tenant_id, row_hash)
);
create table if not exists crm_public_lead_rate (
  tenant_id text not null references tenant(id), ip_hash text not null, window_start timestamptz not null, count int not null,
  primary key (tenant_id, ip_hash, window_start)
);

select iap_enable_tenant_rls('crm_lead');
select iap_enable_tenant_rls('crm_activity');
select iap_enable_tenant_rls('crm_task');
select iap_enable_tenant_rls('crm_opportunity');
select iap_enable_tenant_rls('crm_routing_rule');
select iap_enable_tenant_rls('crm_routing_cursor');
select iap_enable_tenant_rls('crm_lead_import');
select iap_enable_tenant_rls('crm_lead_import_row');
select iap_enable_tenant_rls('crm_public_lead_rate');

grant select, insert, update on crm_lead, crm_task, crm_opportunity, crm_routing_cursor, crm_lead_import, crm_public_lead_rate to iap_app;
grant select, insert on crm_activity, crm_lead_import_row to iap_app;              -- activity log is append-only
grant select, insert, update, delete on crm_routing_rule to iap_app;              -- rules are replaced as a set
