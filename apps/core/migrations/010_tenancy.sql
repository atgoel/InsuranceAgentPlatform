-- M01 · Tenant & Entitlements tables

-- Platform-scope directory tables (no RLS; iap_app may only SELECT)
CREATE TABLE IF NOT EXISTS tenant (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('ORGANISATION','SOLO')),
  status text NOT NULL CHECK (status IN ('provisioning','active','suspended','offboarded')),
  plan_code text NOT NULL,
  trial_ends_at timestamptz,
  cell text NOT NULL DEFAULT 'cell-1',
  deployment_mode text NOT NULL CHECK (deployment_mode IN ('pooled','dedicated')),
  crm_mode text NOT NULL CHECK (crm_mode IN ('solo_lite','twenty')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tenant_host (
  host text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenant(id),
  kind text NOT NULL CHECK (kind IN ('platform_subdomain','custom')),
  verification_token text,
  verified_at timestamptz
);

CREATE TABLE IF NOT EXISTS tie_up_limit (
  entity_type text NOT NULL,
  line text NOT NULL,
  max_insurers int,
  effective_from date NOT NULL DEFAULT '2024-01-01',
  PRIMARY KEY (entity_type, line, effective_from)
);

CREATE TABLE IF NOT EXISTS provisioning_step (
  tenant_id text NOT NULL REFERENCES tenant(id),
  step text NOT NULL,
  status text NOT NULL CHECK (status IN ('completed','failed')),
  error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, step)
);

CREATE TABLE IF NOT EXISTS solo_signup (
  id text PRIMARY KEY,
  phone_hash text NOT NULL,
  display_name text NOT NULL,
  licence jsonb NOT NULL,
  consent_notice_version text NOT NULL,
  otp_hash text NOT NULL,
  state text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  tenant_id text REFERENCES tenant(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN solo_signup.display_name IS 'P2';

-- Tenant-scoped (RLS)
CREATE TABLE IF NOT EXISTS distributor_entity (
  tenant_id text PRIMARY KEY REFERENCES tenant(id),
  entity_type text NOT NULL CHECK (entity_type IN ('IMF','BROKER','INDIVIDUAL_AGENT','CORPORATE_AGENT')),
  legal_name text NOT NULL,
  registration_no text NOT NULL,
  registration_valid_to date NOT NULL,
  principal_officer_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tie_up (
  tenant_id text NOT NULL REFERENCES tenant(id),
  insurer_id text NOT NULL,
  line text NOT NULL CHECK (line IN ('LIFE','HEALTH','GENERAL')),
  effective_from date NOT NULL,
  effective_to date,
  PRIMARY KEY (tenant_id, insurer_id, line, effective_from)
);

CREATE TABLE IF NOT EXISTS tenant_feature_flag (
  tenant_id text NOT NULL REFERENCES tenant(id),
  key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  gate jsonb,
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS brand_kit (
  tenant_id text PRIMARY KEY REFERENCES tenant(id),
  brand_name text NOT NULL,
  primary_colour char(7) NOT NULL,
  secondary_colour char(7) NOT NULL,
  typeface text NOT NULL,
  logo_ref text,
  powered_by_visible boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS usage_counter (
  tenant_id text NOT NULL REFERENCES tenant(id),
  metric text NOT NULL,
  period char(7) NOT NULL,
  used int NOT NULL DEFAULT 0,
  limit_value int,
  alerted_at timestamptz,
  PRIMARY KEY (tenant_id, metric, period)
);

-- RLS on tenant-scoped tables
ALTER TABLE distributor_entity ENABLE ROW LEVEL SECURITY;
ALTER TABLE tie_up ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_feature_flag ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_kit ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counter ENABLE ROW LEVEL SECURITY;

-- Seed tie_up_limit data
INSERT INTO tie_up_limit (entity_type, line, max_insurers) VALUES
  ('IMF', 'LIFE', 6),
  ('IMF', 'HEALTH', 6),
  ('IMF', 'GENERAL', 6),
  ('CORPORATE_AGENT', 'LIFE', 9),
  ('CORPORATE_AGENT', 'HEALTH', 9),
  ('CORPORATE_AGENT', 'GENERAL', 9),
  ('INDIVIDUAL_AGENT', 'LIFE', 1),
  ('INDIVIDUAL_AGENT', 'HEALTH', 1),
  ('INDIVIDUAL_AGENT', 'GENERAL', 1),
  ('BROKER', 'LIFE', null),
  ('BROKER', 'HEALTH', null),
  ('BROKER', 'GENERAL', null)
ON CONFLICT DO NOTHING;
