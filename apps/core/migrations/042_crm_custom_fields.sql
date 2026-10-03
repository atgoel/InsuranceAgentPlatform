-- CR-001 M04: custom-field values on leads and opportunities (descriptive only; never projected to Twenty).
alter table crm_lead add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table crm_lead add column if not exists custom_schema_version int not null default 1;
alter table crm_opportunity add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table crm_opportunity add column if not exists custom_schema_version int not null default 1;
