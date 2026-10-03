-- M06 Advice & Quote: calculator runs, advice records (immutable once finalised), quote workspace, BI evidence.
-- Premiums and illustrations are stored as quoted by the insurer; the platform never computes them (HLD §8).

create table if not exists calculator_run (
  id text primary key,
  tenant_id text not null references tenant(id),
  party_id text not null,
  calculator text not null check (calculator in ('protection-gap','retirement','child-goal','health-sum-insured','floater')),
  inputs jsonb not null, outputs jsonb not null,
  assumptions_version text not null,
  ran_by text not null, ran_at timestamptz not null
);
create index if not exists calculator_run_party_idx on calculator_run (tenant_id, party_id, ran_at desc);
select iap_enable_tenant_rls('calculator_run');
grant select, insert on calculator_run to iap_app;

create table if not exists advice_record (
  id text primary key,
  tenant_id text not null references tenant(id),
  party_id text not null, opportunity_id text, advisor_member_id text not null,
  status text not null check (status in ('DRAFT','FINALISED')),
  scope jsonb not null, calculator_runs jsonb not null default '[]', recommended jsonb not null default '[]', customer_choice jsonb,
  suitability_notes text not null default '' check (length(suitability_notes) <= 2000),
  finalised_at timestamptz,
  created_at timestamptz not null, updated_at timestamptz not null, version int not null default 1,
  check ((status = 'FINALISED') = (finalised_at is not null))
);
create index if not exists advice_record_party_idx on advice_record (tenant_id, party_id, created_at desc);
select iap_enable_tenant_rls('advice_record');
-- Regulatory evidence (F78): only DRAFT rows can be updated (the row may become FINALISED in that update); no deletes.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'advice_record' and policyname = 'advice_record_draft_only') then
    create policy advice_record_draft_only on advice_record as restrictive for update using (status = 'DRAFT') with check (true);
  end if;
end $$;
grant select, insert, update on advice_record to iap_app;

create table if not exists quote_request (
  id text primary key,
  tenant_id text not null references tenant(id),
  opportunity_id text not null, party_id text not null,
  line text not null check (line in ('LIFE','HEALTH','GENERAL')),
  insured_party_ids jsonb not null default '[]', requirements jsonb not null default '{}',
  advice_record_id text,
  status text not null check (status in ('OPEN','SHARED','SELECTED','EXPIRED','WITHDRAWN')),
  selected_option_id text, shared_at timestamptz, selected_at timestamptz,
  latest_valid_until date,                              -- max option validity, maintained by the repository (stale-quote job)
  created_at timestamptz not null, updated_at timestamptz not null, version int not null default 1
);
create index if not exists quote_request_opportunity_idx on quote_request (tenant_id, opportunity_id, created_at desc);
create index if not exists quote_request_stale_idx on quote_request (tenant_id, latest_valid_until) where status in ('OPEN','SHARED');
select iap_enable_tenant_rls('quote_request');
grant select, insert, update on quote_request to iap_app;

create table if not exists quote_option (
  id text primary key,
  tenant_id text not null references tenant(id),
  quote_request_id text not null references quote_request(id),
  position int not null,
  version_id text not null, insurer_id text not null,
  source text not null check (source in ('MANUAL_PORTAL','INSURER_API')),
  insurer_quote_ref text,
  sum_assured_paise bigint not null check (sum_assured_paise >= 0),
  policy_term_years int, premium_paying_term_years int,
  premium_base_paise bigint not null check (premium_base_paise >= 0),
  premium_riders_paise bigint not null check (premium_riders_paise >= 0),
  premium_tax_paise bigint not null check (premium_tax_paise >= 0),
  premium_total_paise bigint not null,
  premium_frequency text not null check (premium_frequency in ('ANNUAL','HALF_YEARLY','QUARTERLY','MONTHLY','SINGLE')),
  coverage jsonb not null default '[]', exclusions jsonb not null default '[]', waiting_periods jsonb not null default '[]', assumptions jsonb not null default '{}',
  valid_until date not null,
  captured_by text not null, captured_at timestamptz not null,
  check (premium_total_paise = premium_base_paise + premium_riders_paise + premium_tax_paise),
  unique nulls not distinct (tenant_id, quote_request_id, version_id, insurer_quote_ref)
);
create index if not exists quote_option_request_idx on quote_option (tenant_id, quote_request_id, position);
select iap_enable_tenant_rls('quote_option');
grant select, insert, update, delete on quote_option to iap_app;   -- options can be removed before selection

create table if not exists bi_record (
  id text primary key,
  tenant_id text not null references tenant(id),
  quote_option_id text not null references quote_option(id) on delete cascade,   -- evidence goes with a removed option
  document_ref text not null check (document_ref ~ '^doc_[A-Z0-9]{26}$'),
  insurer_bi_version text not null check (length(insurer_bi_version) between 1 and 64),
  uploaded_by text not null, uploaded_at timestamptz not null,
  acknowledgement jsonb,
  version int not null default 1
);
create index if not exists bi_record_option_idx on bi_record (tenant_id, quote_option_id);
select iap_enable_tenant_rls('bi_record');
grant select, insert, update on bi_record to iap_app;
