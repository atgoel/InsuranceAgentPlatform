-- CR-001 M03: custom-field values on party (descriptive only; never projected to Twenty).
alter table party add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table party add column if not exists custom_schema_version int not null default 1;   -- envelope version of custom_fields (CR-001 section 3.3)
