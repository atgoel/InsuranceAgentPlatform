-- M07: the insurer remains authoritative. Policy identifiers are encrypted at rest.
create table if not exists held_policy (
 id text primary key, tenant_id text not null references tenant(id), proposer_party_id text not null,
 line text not null check(line in ('LIFE','HEALTH','GENERAL')), insurer_id text, insurer_name text not null, product_version_id text, product_name text not null,
 policy_number_enc text not null, policy_number_hash text not null, policy_number_last4 text not null,
 status text not null check(status in ('IN_FORCE','GRACE','LAPSED','PAID_UP','MATURED','SURRENDERED','CLAIMED','EXPIRED','CANCELLED')),
 source text not null check(source in ('IMPORT','AI_EXTRACTED','MANUAL','PLATFORM_SALE')), as_of date not null,
 status_as_of date not null, source_ref text, confidence text not null check(confidence in ('HIGH','MEDIUM','LOW')),
 mode text not null check(mode in ('ANNUAL','HALF_YEARLY','QUARTERLY','MONTHLY','SINGLE')),
 commencement_date date not null, maturity_date date, sum_assured_paise bigint check(sum_assured_paise>=0),
 premium_paying_term_years int, policy_term_years int, opportunity_id text, distance_sale boolean not null default false,
 next_due_date date, renewal_date date, servicing_member_id text, org_unit_id text, sale_id text,
 booked_on date not null, expiry_date date, product_category text not null,
 business_type text not null check(business_type in ('FRESH','RENEWAL','PORTABILITY','ROLLOVER')),
 previous_insurer_name text, policy_term_months int,
 premium_net_paise bigint not null check(premium_net_paise >= 0), premium_tax_paise bigint not null check(premium_tax_paise >= 0), premium_gross_paise bigint not null check(premium_gross_paise >= 0),
 booking_channel_code text, booking_insurer_code_id text, business_source text, referred_by_name text, referred_by_party_id text, referred_by_member_id text, remarks text,
 risk_details jsonb, risk_schema_id text, risk_schema_version int, registration_no_enc text, registration_no_hash text, registration_no_last4 text,
 custom_fields jsonb not null default '{}', custom_schema_version int not null default 1,
 created_at timestamptz not null, updated_at timestamptz not null, version int not null,
 check(premium_net_paise+premium_tax_paise=premium_gross_paise), check((risk_details is null)=(risk_schema_id is null)),
 unique(tenant_id,policy_number_hash), unique(tenant_id,sale_id)
);
create index if not exists held_policy_booked_idx on held_policy(tenant_id,booked_on);
create index if not exists held_policy_source_idx on held_policy(tenant_id,business_source);
create index if not exists held_policy_referrer_idx on held_policy(tenant_id,referred_by_name);
select iap_enable_tenant_rls('held_policy');
grant select,insert,update on held_policy to iap_app;
create table if not exists premium_payment(id text primary key,tenant_id text not null references tenant(id),held_policy_id text not null,installment_due date not null,paid_on date not null,unique(tenant_id,held_policy_id,installment_due));
select iap_enable_tenant_rls('premium_payment');
grant select,insert on premium_payment to iap_app;
create table if not exists book_import_batch(id text primary key,tenant_id text not null references tenant(id),file_checksum text not null,state text not null,props jsonb not null,version int not null,unique(tenant_id,file_checksum));
select iap_enable_tenant_rls('book_import_batch');
grant select,insert,update on book_import_batch to iap_app;
create table if not exists book_import_row(tenant_id text not null references tenant(id),batch_id text not null references book_import_batch(id),row_no int not null,raw jsonb not null,props jsonb not null,primary key(tenant_id,batch_id,row_no));
select iap_enable_tenant_rls('book_import_row');
grant select,insert,update,delete on book_import_row to iap_app;
create table if not exists servicing_request(id text primary key,tenant_id text not null references tenant(id),held_policy_id text not null,
 kind text not null check(kind in ('ADDRESS_CHANGE','NOMINEE_CHANGE','BANK_MANDATE','SURRENDER','LOAN','CLAIM','DUPLICATE_POLICY','OTHER')),
 status text not null check(status in ('OPEN','SUBMITTED_TO_INSURER','AWAITING_CUSTOMER','RESOLVED','REJECTED')),
 insurer_ref text,follow_up_on date,portal_url text check(portal_url is null or portal_url like 'https://%'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),version int not null);
select iap_enable_tenant_rls('servicing_request');
grant select,insert,update on servicing_request to iap_app;
create table if not exists servicing_note(tenant_id text not null references tenant(id),request_id text not null references servicing_request(id),position int not null,at timestamptz not null,by_member text not null,text text not null,primary key(tenant_id,request_id,position));
select iap_enable_tenant_rls('servicing_note');
grant select,insert on servicing_note to iap_app;
create table if not exists lifecycle_alert_ledger(tenant_id text not null references tenant(id),key text not null,primary key(tenant_id,key));
select iap_enable_tenant_rls('lifecycle_alert_ledger');
grant select,insert on lifecycle_alert_ledger to iap_app;
comment on column held_policy.policy_number_enc is 'P2: encrypted policy identifier';
comment on column held_policy.policy_number_hash is 'P2: tenant-scoped lookup hash';
comment on column held_policy.registration_no_enc is 'P2: encrypted motor registration';
comment on column held_policy.referred_by_name is 'P2: referrer name';
comment on column book_import_row.raw is 'P3: temporary import data, purged after commit/discard';
