-- M03 Party & Consent: parties, contact points, households, role links, consent ledger (append-only),
-- suppression, duplicate candidates and merges. P3 values are stored only as ciphertext (+ lookup hash).
create table if not exists party (
  id text primary key,
  tenant_id text not null references tenant(id),
  kind text not null check (kind in ('PERSON','ORGANISATION')),
  display_name text not null,
  display_name_norm text not null,
  dob_enc text, dob_year int, gender text check (gender in ('F','M','X')),
  pan_enc text, pan_hash text, pan_last4 text,
  preferred_language text not null default 'en',
  preferred_channel text check (preferred_channel in ('WHATSAPP','SMS','EMAIL','CALL')),
  owner_member_id text, org_unit_id text,
  tags text[] not null default '{}',
  source_kind text not null check (source_kind in ('LEAD','IMPORT','MANUAL','SIGNUP','BOOK')), source_ref text,
  status text not null check (status in ('ACTIVE','MERGED','ERASED')),
  merged_into_id text references party(id),
  created_at timestamptz not null, updated_at timestamptz not null,
  version int not null default 1
);
comment on column party.display_name is 'P2';
comment on column party.dob_enc is 'P3';
comment on column party.pan_enc is 'P3';
create index if not exists party_name_norm_idx on party (tenant_id, display_name_norm text_pattern_ops);
create index if not exists party_pan_hash_idx on party (tenant_id, pan_hash) where pan_hash is not null;
create index if not exists party_owner_idx on party (tenant_id, owner_member_id);

create table if not exists contact_point (
  tenant_id text not null references tenant(id),
  party_id text not null references party(id) on delete cascade,
  channel text not null check (channel in ('MOBILE','EMAIL')),
  value_enc text not null, value_hash text not null, masked text not null,
  is_primary boolean not null, verified_at timestamptz,
  primary key (party_id, value_hash)
);
comment on column contact_point.value_enc is 'P2';
create index if not exists contact_point_hash_idx on contact_point (tenant_id, value_hash);

create table if not exists household (
  id text primary key, tenant_id text not null references tenant(id), name text not null,
  head_party_id text not null references party(id)
);
create table if not exists household_member (
  tenant_id text not null references tenant(id),
  household_id text not null references household(id) on delete cascade,
  party_id text not null references party(id),
  relation text not null check (relation in ('SELF','SPOUSE','CHILD','PARENT','SIBLING','OTHER')),
  primary key (party_id)                     -- a party belongs to at most one household
);
create unique index if not exists household_one_self on household_member (household_id) where relation = 'SELF';

create table if not exists party_role_link (
  tenant_id text not null references tenant(id),
  party_id text not null references party(id),
  role text not null check (role in ('PROPOSER','INSURED','PAYER','NOMINEE','LIFE_ASSURED')),
  subject_type text not null check (subject_type in ('HELD_POLICY','PROPOSAL')),
  subject_id text not null, label text,
  created_at timestamptz not null default now(),
  primary key (party_id, role, subject_type, subject_id)
);

create table if not exists consent_record (
  id text primary key,
  tenant_id text not null references tenant(id),
  party_id text not null references party(id),
  purpose text not null check (purpose in ('SERVICE','MARKETING','AI_PROCESSING','DATA_SHARING_INSURER')),
  channel text not null check (channel in ('WHATSAPP','SMS','EMAIL','CALL','ANY')),
  granted boolean not null, notice_version text not null,
  source text not null check (source in ('WEB_FORM','ASSISTED','IMPORT','CUSTOMER_LINK','SIGNUP')),
  evidence_ref text, captured_by text not null, occurred_at timestamptz not null
);
create index if not exists consent_record_party_idx on consent_record (tenant_id, party_id, occurred_at);

create table if not exists suppression (
  id text primary key, tenant_id text not null references tenant(id),
  contact_hash text not null,
  channel text not null check (channel in ('WHATSAPP','SMS','EMAIL','CALL','ANY')),
  reason text not null check (reason in ('DND','OPT_OUT','BOUNCE','DSR','COMPLAINT')),
  from_at timestamptz not null, to_at timestamptz, created_by text not null
);
create index if not exists suppression_hash_idx on suppression (tenant_id, contact_hash);

create table if not exists duplicate_candidate (
  id text primary key, tenant_id text not null references tenant(id),
  party_a_id text not null references party(id), party_b_id text not null references party(id),
  score int not null check (score between 0 and 100), rule text not null, explanation text not null,
  status text not null check (status in ('open','merged','dismissed')),
  created_at timestamptz not null,
  check (party_a_id < party_b_id),          -- ordered pair
  unique (tenant_id, party_a_id, party_b_id)
);

create table if not exists party_merge (
  id text primary key, tenant_id text not null references tenant(id),
  survivor_id text not null references party(id), merged_id text not null references party(id),
  choices jsonb not null, moved_links jsonb not null,
  merged_at timestamptz not null, merged_by text not null, reversible_until timestamptz not null, reversed_at timestamptz
);

select iap_enable_tenant_rls('party');
select iap_enable_tenant_rls('contact_point');
select iap_enable_tenant_rls('household');
select iap_enable_tenant_rls('household_member');
select iap_enable_tenant_rls('party_role_link');
select iap_enable_tenant_rls('consent_record');
select iap_enable_tenant_rls('suppression');
select iap_enable_tenant_rls('duplicate_candidate');
select iap_enable_tenant_rls('party_merge');

grant select, insert, update on party, household, duplicate_candidate, party_merge to iap_app;
grant select, insert, update, delete on contact_point, household_member, party_role_link to iap_app;
grant select, insert on consent_record, suppression to iap_app;   -- append-only: the ledger is never rewritten
