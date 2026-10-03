-- M02 Distribution Network: org tree, members, onboarding, licences, insurer codes, leave, role overrides.
create table if not exists org_unit (
  tenant_id text not null references tenant(id),
  id text not null,                       -- 'ou_root' is the head office in every tenant
  parent_id text,
  kind text not null check (kind in ('HEAD_OFFICE','REGION','BRANCH','TEAM')),
  name text not null,
  territory_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, parent_id) references org_unit(tenant_id, id),
  check ((kind = 'HEAD_OFFICE') = (parent_id is null))
);
create unique index if not exists org_unit_one_root on org_unit (tenant_id) where parent_id is null;

create table if not exists member (
  id text primary key,
  tenant_id text not null references tenant(id),
  user_ref text,
  display_name text not null,
  phone_masked text, email_masked text,
  contact_hash text not null,
  roles text[] not null check (cardinality(roles) between 1 and 10),
  salesperson_type text check (salesperson_type in ('EMPLOYEE','ISP','POSP','SOLO')),
  org_unit_id text not null,
  status text not null check (status in ('invited','onboarding','active','suspended','exited')),
  capacity_per_day int not null default 25 check (capacity_per_day between 0 and 500),
  skills text[] not null default '{}',
  languages text[] not null default '{en}',
  invited_at timestamptz not null, invite_expires_at timestamptz not null,
  activated_at timestamptz, exited_at timestamptz,
  version int not null default 1,
  foreign key (tenant_id, org_unit_id) references org_unit(tenant_id, id)
);
comment on column member.display_name is 'P2';
create unique index if not exists member_contact_active on member (tenant_id, contact_hash) where status <> 'exited';
create unique index if not exists member_user_ref on member (tenant_id, user_ref) where user_ref is not null;
create index if not exists member_tenant_status on member (tenant_id, status, org_unit_id);

create table if not exists onboarding_checklist (
  tenant_id text not null references tenant(id),
  member_id text primary key references member(id),
  items jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists licence (
  id text primary key,
  tenant_id text not null references tenant(id),
  member_id text not null references member(id),
  kind text not null check (kind in ('POSP_LIFE','POSP_GENERAL','ISP','INDIVIDUAL_AGENT','OTHER')),
  number text not null,
  valid_from date not null, valid_to date not null check (valid_to >= valid_from),
  verified_at timestamptz
);
create index if not exists licence_expiry on licence (tenant_id, valid_to);

create table if not exists licence_alert (
  tenant_id text not null references tenant(id),
  licence_id text not null references licence(id),
  threshold int not null,
  alerted_at timestamptz not null default now(),
  primary key (licence_id, threshold)
);

create table if not exists insurer_code (
  tenant_id text not null references tenant(id),
  member_id text not null references member(id),
  insurer_id text not null,
  code text not null,
  primary key (member_id, insurer_id),
  unique (tenant_id, insurer_id, code)
);

create table if not exists member_leave (
  tenant_id text not null references tenant(id),
  member_id text not null references member(id),
  from_date date not null, to_date date not null check (to_date >= from_date),
  primary key (member_id, from_date)
);

create table if not exists tenant_role (
  tenant_id text not null references tenant(id),
  role text not null,
  version int not null,
  permissions text[] not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, role)
);

select iap_enable_tenant_rls('org_unit');
select iap_enable_tenant_rls('member');
select iap_enable_tenant_rls('onboarding_checklist');
select iap_enable_tenant_rls('licence');
select iap_enable_tenant_rls('licence_alert');
select iap_enable_tenant_rls('insurer_code');
select iap_enable_tenant_rls('member_leave');
select iap_enable_tenant_rls('tenant_role');

grant select, insert, update on org_unit, member, onboarding_checklist, licence, licence_alert, insurer_code, tenant_role to iap_app;
grant select, insert, update, delete on member_leave to iap_app;
