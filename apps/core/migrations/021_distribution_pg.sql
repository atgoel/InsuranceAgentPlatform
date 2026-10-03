-- M02 Postgres adapters: insertion order (matches the in-memory adapters), role-definition columns, insurer-code re-assignment.
alter table org_unit add column if not exists seq bigint generated always as identity;
alter table licence add column if not exists seq bigint generated always as identity;
alter table licence_alert add column if not exists seq bigint generated always as identity;
alter table insurer_code add column if not exists seq bigint generated always as identity;
alter table tenant_role add column if not exists record_scope text check (record_scope in ('OWN','UNIT_SUBTREE','TENANT'));
alter table tenant_role add column if not exists privileged boolean;
alter table tenant_role add column if not exists editable boolean;
grant delete on insurer_code to iap_app;
