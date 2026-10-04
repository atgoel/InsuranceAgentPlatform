create table commission_entry (
 id text primary key, tenant_id text not null references tenant(id), held_policy_id text not null,
 insurer_id text, seller_member_id text not null, kind text not null check (kind='RECEIVED'),
 amount_paise bigint not null check (amount_paise>=0), rate_pct numeric check (rate_pct between 0 and 100),
 reason text check (length(reason) between 1 and 1000), invoice_no text check (length(invoice_no) between 1 and 40),
 invoice_date date, occurred_on date not null, import_key text not null, created_at timestamptz not null,
 custom_fields jsonb not null default '{}', custom_schema_version int not null default 1,
 unique (tenant_id,import_key)
);
select iap_enable_tenant_rls('commission_entry');
grant select,insert on commission_entry to iap_app;
