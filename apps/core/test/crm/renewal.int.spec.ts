import { Pool } from 'pg';
import { createTestApp, TestApp } from '../support/test-app';
import { CrmModule } from '../../src/modules/crm/crm.module';
import { CrmContext } from '../../src/modules/crm/application/crm-context';
import { RenewalOpportunityService } from '../../src/modules/crm/application/renewal-opportunity.service';
import { PgOpportunityRepository } from '../../src/modules/crm/infrastructure/pg-crm.repositories';
import { runMigrations, MIGRATIONS_DIR } from '../../src/kernel/db/migrate';
import { PgUnitOfWork } from '../../src/kernel/persistence/pg-unit-of-work';
import { Tracer } from '../../src/kernel/observability/tracer';
import { FixedClock } from '../../src/kernel/domain/clock';
import { MetricsRegistry } from '../../src/kernel/observability/metrics';
const run=process.env.DATABASE_URL?describe:describe.skip;
run('AC-M07-10 durable renewal mapping',()=>{
 const owner=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL??process.env.DATABASE_URL});
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 const uow=new PgUnitOfWork(pool,new Tracer(new FixedClock(new Date('2026-10-03T00:00:00Z')),new MetricsRegistry()));
 const tenant=`ten_renew_${Date.now()}`;let app:TestApp;
 const repo=new PgOpportunityRepository();
 const input={heldPolicyId:'hp1',renewalDate:'2027-10-03',partyId:`pty_${tenant}`,ownerMemberId:'mem1',productName:'Health',line:'HEALTH' as const,premiumPaise:10000};
 const service=()=>new RenewalOpportunityService({forTenant:async()=>({saveOpportunity:(tx,o)=>repo.save(tx,o),saveLead:async()=>undefined,saveTask:async()=>undefined})},repo,app.app.get(CrmContext));
 beforeAll(async()=>{
  app=await createTestApp({imports:[CrmModule]});await runMigrations(owner,MIGRATIONS_DIR);
  await owner.query("insert into tenant (id,slug,display_name,kind,status,plan_code,deployment_mode,crm_mode) values ($1,$1,$1,'ORGANISATION','active','TEAM','pooled','solo_lite')",[tenant]);
  await uow.run(tenant,async tx=>{if(tx.kind==='pg')await (tx as import('../../src/kernel/persistence/unit-of-work').PgTransaction).query("insert into party (id,tenant_id,kind,display_name,display_name_norm,source_kind,status,created_at,updated_at) values ($1,$2,'PERSON','Person','person','BOOK','ACTIVE',now(),now())",[input.partyId,tenant]);});
 });
 afterAll(async()=>{await app.close();await owner.end();await pool.end();});
 it('serializes concurrent creates, survives adapter recreation and keeps one open cycle',async()=>{
  const results=await Promise.all([service(),service()].map(s=>uow.run(tenant,tx=>s.ensure(tx,input))));
  expect(results.filter(r=>r.created)).toHaveLength(1);expect(results[0].opportunityId).toBe(results[1].opportunityId);
  expect(await uow.run(tenant,tx=>service().ensure(tx,input))).toEqual({opportunityId:results[0].opportunityId,created:false});
  expect(await uow.run(tenant,tx=>service().ensure(tx,{...input,renewalDate:'2028-10-03'}))).toEqual({opportunityId:results[0].opportunityId,created:false});
  const c=await pool.connect();try{await c.query('begin');await c.query("select set_config('app.tenant_id',$1,true)",['unrelated']);expect((await c.query('select * from crm_renewal_opportunity')).rows).toHaveLength(0);}finally{await c.query('rollback');c.release();}
 });
});
