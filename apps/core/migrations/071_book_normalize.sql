-- Expand/backfill/contract for development databases that ran the preflight 070 draft.
-- New installations already use normalized 070; this block then has no effect.
do $$
begin
 if exists(select 1 from information_schema.columns where table_name='held_policy' and column_name='props') then
  alter table held_policy no force row level security;
  alter table held_policy add column if not exists status_as_of date;
  alter table held_policy add column if not exists source_ref text;
  alter table held_policy add column if not exists confidence text;
  alter table held_policy add column if not exists mode text;
  alter table held_policy add column if not exists commencement_date date;
  alter table held_policy add column if not exists maturity_date date;
  alter table held_policy add column if not exists sum_assured_paise bigint;
  alter table held_policy add column if not exists premium_paying_term_years int;
  alter table held_policy add column if not exists policy_term_years int;
  alter table held_policy add column if not exists opportunity_id text;
  alter table held_policy add column if not exists distance_sale boolean not null default false;
  alter table held_policy add column if not exists created_at timestamptz;
  alter table held_policy add column if not exists updated_at timestamptz;
  update held_policy set status_as_of=(props->>'statusAsOf')::date,source_ref=props->>'sourceRef',confidence=props->>'confidence',mode=props->>'mode',
    commencement_date=(props->>'commencementDate')::date,maturity_date=(props->>'maturityDate')::date,
    sum_assured_paise=(props->>'sumAssuredPaise')::bigint,premium_paying_term_years=(props->>'premiumPayingTermYears')::int,
    policy_term_years=(props->>'policyTermYears')::int,opportunity_id=props->'saleRef'->>'opportunityId',
    distance_sale=coalesce((props->>'distanceSale')::boolean,false),created_at=(props->>'createdAt')::timestamptz,updated_at=(props->>'updatedAt')::timestamptz;
  alter table held_policy alter column status_as_of set not null;
  alter table held_policy alter column confidence set not null;
  alter table held_policy alter column mode set not null;
  alter table held_policy alter column commencement_date set not null;
  alter table held_policy alter column created_at set not null;
  alter table held_policy alter column updated_at set not null;
  alter table held_policy add constraint held_policy_mode_check check(mode in ('ANNUAL','HALF_YEARLY','QUARTERLY','MONTHLY','SINGLE'));
  alter table held_policy add constraint held_policy_confidence_check check(confidence in ('HIGH','MEDIUM','LOW'));
  alter table held_policy drop column props;
  alter table held_policy force row level security;
 end if;
 if exists(select 1 from information_schema.columns where table_name='servicing_request' and column_name='props') then
  alter table servicing_request no force row level security;
  alter table servicing_request add column if not exists kind text;
  alter table servicing_request add column if not exists insurer_ref text;
  alter table servicing_request add column if not exists portal_url text;
  alter table servicing_request add column if not exists created_at timestamptz not null default now();
  alter table servicing_request add column if not exists updated_at timestamptz not null default now();
  update servicing_request set kind=props->>'kind',insurer_ref=props->>'insurerRef',portal_url=props->>'portalUrl';
  alter table servicing_request alter column kind set not null;
  alter table servicing_request add constraint servicing_request_kind_check check(kind in ('ADDRESS_CHANGE','NOMINEE_CHANGE','BANK_MANDATE','SURRENDER','LOAN','CLAIM','DUPLICATE_POLICY','OTHER'));
  alter table servicing_request add constraint servicing_request_portal_check check(portal_url is null or portal_url like 'https://%');
  alter table servicing_request drop column props;
  alter table servicing_request force row level security;
 end if;
end $$;
comment on column held_policy.policy_number_enc is 'P2: encrypted policy identifier';
comment on column held_policy.policy_number_hash is 'P2: tenant-scoped lookup hash';
comment on column held_policy.registration_no_enc is 'P2: encrypted motor registration';
comment on column held_policy.referred_by_name is 'P2: referrer name';
comment on column book_import_row.raw is 'P3: temporary import data, purged after commit/discard';
