-- M08: tenant operational data, encrypted payloads and durable resend barriers.
create table integration_pin (
 tenant_id text not null references tenant(id), adapter_id text not null,
 props jsonb not null, primary key(tenant_id,adapter_id)
);
create table integration_certification (
 tenant_id text not null references tenant(id), adapter_id text not null, adapter_version text not null,
 status text not null check(status in ('PASSED','FAILED')), props jsonb not null,
 primary key(tenant_id,adapter_id,adapter_version)
);
create table integration_submission (
 tenant_id text not null references tenant(id), id text not null, idempotency_key text not null,
 state text not null check(state in ('SENDING','PENDING','COMPLETED','DEAD_LETTER')),
 attempts integer not null check(attempts >= 0), next_attempt_at timestamptz, lease_until timestamptz,
 created_at timestamptz not null, props jsonb not null,
 primary key(tenant_id,id), unique(tenant_id,idempotency_key),
 check(not (props ? 'resultKind') or props->>'resultKind' in ('DIRECT','RECONCILED'))
);
create index integration_submission_due_idx on integration_submission(tenant_id,state,next_attempt_at,lease_until);
create table dead_letter (
 tenant_id text not null references tenant(id), id text not null,
 status text not null check(status in ('OPEN','REPLAYED','DISCARDED')),
 attempts integer not null check(attempts >= 0), created_at timestamptz not null,
 replayed_from_id text, props jsonb not null,
 primary key(tenant_id,id), unique(tenant_id,replayed_from_id),
 check(props->>'ownerTeam' = 'INTEGRATION_OPS'),
 check(status <> 'DISCARDED' or length(btrim(props->>'discardReason')) between 1 and 500)
);
create index dead_letter_list_idx on dead_letter(tenant_id,created_at desc,id);
create table integration_payload (
 tenant_id text not null references tenant(id), id text not null, payload_enc text not null,
 expires_at timestamptz not null, primary key(tenant_id,id)
);
create table integration_call_log (
 tenant_id text not null references tenant(id), id text not null,
 at timestamptz not null, outcome text not null check(outcome in ('success','failure','unknown')),
 props jsonb not null, primary key(tenant_id,id)
);
create index integration_call_log_retention_idx on integration_call_log(tenant_id,at);
create table callback_raw (
 tenant_id text not null references tenant(id), callback_id text not null, adapter_id text not null,
 adapter_version text not null, event_id text not null, idempotency_key text not null,
 occurred_at timestamptz not null, received_at timestamptz not null, expires_at timestamptz not null,
 raw_body_hash text not null, raw_payload_enc text, canonical_payload_enc text,
 primary key(tenant_id,callback_id), unique(tenant_id,adapter_id,event_id)
);
create table integration_callback_cursor (
 tenant_id text not null references tenant(id), adapter_id text not null, idempotency_key text not null,
 occurred_at timestamptz, status_hash text,
 primary key(tenant_id,adapter_id,idempotency_key)
);
create table integration_health (
 tenant_id text not null references tenant(id), adapter_id text not null, adapter_version text not null,
 props jsonb not null, primary key(tenant_id,adapter_id,adapter_version)
);
create table integration_breaker_state (
 adapter_id text not null, adapter_version text not null, operation text not null,
 state text not null check(state in ('CLOSED','OPEN','HALF_OPEN')), props jsonb not null,
 primary key(adapter_id,adapter_version,operation)
);
select iap_enable_tenant_rls('integration_pin');
select iap_enable_tenant_rls('integration_certification');
select iap_enable_tenant_rls('integration_submission');
select iap_enable_tenant_rls('dead_letter');
select iap_enable_tenant_rls('integration_payload');
select iap_enable_tenant_rls('integration_call_log');
select iap_enable_tenant_rls('callback_raw');
select iap_enable_tenant_rls('integration_callback_cursor');
select iap_enable_tenant_rls('integration_health');
grant select,insert,update,delete on integration_pin,integration_certification,integration_submission,
 dead_letter,integration_payload,integration_call_log,callback_raw,integration_callback_cursor,integration_health to iap_app;
comment on column integration_submission.props is 'P3: proposalEnc/resultEnc are FieldCipher ciphertext; safety barrier retained';
comment on column callback_raw.raw_payload_enc is 'P3: encrypted exact callback bytes, purged at 180 days';
comment on column callback_raw.canonical_payload_enc is 'P3: encrypted canonical callback, purged at 180 days';
comment on column integration_payload.payload_enc is 'P3: encrypted replay payload, purged at 180 days';
