-- M05 Product Catalogue: platform scope (no tenant_id, no RLS). The app role can only read; operators write through
-- the owner connection used by the operator console. Tenant scope is computed at runtime from tie-ups (M01) and selling scope (M02).
create table if not exists insurer (
  id text primary key,
  name text not null,
  irdai_reg_no text not null,
  lines text[] not null check (lines <@ array['LIFE','HEALTH','GENERAL']::text[] and cardinality(lines) > 0),
  active boolean not null default true
);

create table if not exists product (
  id text primary key,
  insurer_id text not null references insurer(id),
  line text not null check (line in ('LIFE','HEALTH','GENERAL')),
  name text not null,
  category text not null check (category in ('TERM','SAVINGS','ULIP','PENSION','CHILD','HEALTH_INDIVIDUAL','HEALTH_FLOATER','STANDARD_HEALTH','MOTOR','OTHER'))
);

create table if not exists product_version (
  id text primary key,
  product_id text not null references product(id),
  insurer_id text not null references insurer(id),
  line text not null check (line in ('LIFE','HEALTH','GENERAL')),
  uin text not null check (uin ~ '^[A-Z0-9]{6,30}$'),
  wording_version text not null,
  wording_url text,
  pos_eligible boolean not null,
  channels text[] not null check (channels <@ array['IMF','BROKER','INDIVIDUAL_AGENT','CORPORATE_AGENT']::text[] and cardinality(channels) > 0),
  effective_from date not null,
  effective_to date check (effective_to is null or effective_to >= effective_from),
  status text not null check (status in ('draft','active','withdrawn')),
  locked_at timestamptz,
  quote_requirements text[] not null default '{}',
  key_facts jsonb not null default '[]',
  unique (product_id, wording_version)
);
create index if not exists product_version_scope_idx on product_version (line, status, insurer_id);

create table if not exists research_summary (
  version_id text primary key references product_version(id),
  summary text not null,
  points jsonb not null,
  source_ref text not null,
  source_date date not null,
  reviewed_wording_version text not null,
  reviewed_at timestamptz not null
);

grant select on insurer, product, product_version, research_summary to iap_app;
