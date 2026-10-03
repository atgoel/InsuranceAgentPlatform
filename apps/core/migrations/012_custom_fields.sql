-- CR-001: governed custom field definitions per tenant (M01 section 7.1). Definitions are deactivated, never deleted.
create table if not exists custom_field_definition (
  tenant_id text not null, id text not null,
  entity text not null check (entity in ('held_policy','policy_sale','party','lead','opportunity','commission_entry')),
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  label_en text not null, label_hi text,
  type text not null check (type in ('text','number','money','date','enum','boolean')),
  enum_options jsonb,
  required boolean not null default false,
  pii_class text not null check (pii_class in ('P0','P1','P2')),
  reportable boolean not null default false check (not (reportable and pii_class = 'P2')),
  active boolean not null default true,
  created_at timestamptz not null, updated_at timestamptz not null, version int not null default 1,
  primary key (tenant_id, id), unique (tenant_id, entity, key)
);

select iap_enable_tenant_rls('custom_field_definition');

grant select, insert, update on custom_field_definition to iap_app;
