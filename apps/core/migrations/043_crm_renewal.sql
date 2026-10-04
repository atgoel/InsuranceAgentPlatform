create table crm_renewal_opportunity (
 tenant_id text not null references tenant(id), held_policy_id text not null, renewal_date date not null,
 opportunity_id text not null references crm_opportunity(id), primary key (tenant_id,held_policy_id,renewal_date)
);
select iap_enable_tenant_rls('crm_renewal_opportunity');
grant select,insert on crm_renewal_opportunity to iap_app;
