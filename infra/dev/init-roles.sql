-- Roles per docs/spec/03-data-model.md: the owner runs migrations and cross-tenant platform work; the app role is
-- what the API connects as. Neither is a superuser and neither bypasses RLS, so FORCE ROW LEVEL SECURITY applies to both.
CREATE ROLE iap_owner LOGIN PASSWORD 'iap' NOSUPERUSER NOCREATEROLE NOBYPASSRLS;
CREATE ROLE iap_app LOGIN PASSWORD 'iap' NOSUPERUSER NOCREATEROLE NOBYPASSRLS;
CREATE DATABASE iap OWNER iap_owner;
\connect iap
ALTER SCHEMA public OWNER TO iap_owner;
GRANT USAGE ON SCHEMA public TO iap_app;
