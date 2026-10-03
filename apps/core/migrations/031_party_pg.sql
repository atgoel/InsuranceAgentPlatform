-- M03 Postgres adapters: stable ordering of child rows (contact points, household members) and a candidate-queue index.
alter table contact_point add column if not exists position int not null default 0;
alter table household_member add column if not exists position int not null default 0;
create index if not exists duplicate_candidate_queue_idx on duplicate_candidate (tenant_id, status, score desc, created_at, id);
create index if not exists household_member_household_idx on household_member (tenant_id, household_id, position);
