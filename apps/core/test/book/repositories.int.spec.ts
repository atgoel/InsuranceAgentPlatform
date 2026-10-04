import {Pool} from 'pg';
import {runMigrations,MIGRATIONS_DIR} from '../../src/kernel/db/migrate';
import {PgUnitOfWork} from '../../src/kernel/persistence/pg-unit-of-work';
import {Tracer} from '../../src/kernel/observability/tracer';
import {FixedClock} from '../../src/kernel/domain/clock';
import {MetricsRegistry} from '../../src/kernel/observability/metrics';
import {PgHeldPolicyRepository,PgImportBatchRepository,PgServicingRepository,PgAlertLedger} from '../../src/modules/book/infrastructure/pg-book.repositories';
import {bookRepositoryContract} from './repositories.contract';
const run=process.env.DATABASE_URL?describe:describe.skip;
run('AC-M07-14 Postgres book isolation',()=>{
 const owner=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL??process.env.DATABASE_URL});
 const app=new Pool({connectionString:process.env.DATABASE_URL});const suffix=`pg_${Date.now()}`;
 const uow=new PgUnitOfWork(app,new Tracer(new FixedClock(new Date('2026-10-03Z')),new MetricsRegistry()));
 bookRepositoryContract('postgres',async()=>{
  await runMigrations(owner,MIGRATIONS_DIR);for(const tenant of [`${suffix}_a`,`${suffix}_b`]){
   await owner.query("insert into tenant(id,slug,display_name,kind,status,plan_code,deployment_mode,crm_mode) values($1,$1,$1,'ORGANISATION','active','TEAM','pooled','solo_lite')",[tenant]);
   if(tenant.endsWith('_a'))await uow.run(tenant,async tx=>{if(tx.kind==='pg')await (tx as import('../../src/kernel/persistence/unit-of-work').PgTransaction).query("insert into party(id,tenant_id,kind,display_name,display_name_norm,source_kind,status,created_at,updated_at) values($1,$2,'PERSON','Person','person','BOOK','ACTIVE',now(),now())",[`${suffix}_party`,tenant]);});
  }
  return {policies:new PgHeldPolicyRepository(),imports:new PgImportBatchRepository(),servicing:new PgServicingRepository(),ledger:new PgAlertLedger(),tenantA:`${suffix}_a`,tenantB:`${suffix}_b`,suffix,run:(tenant,work)=>uow.run(tenant,work)};
 });
 afterAll(async()=>{await owner.end();await app.end();});
 it('AC-M07-14 persists normalized encrypted rows after repository recreation and purges import raw rows',async()=>{
  const client=await app.connect();try{await client.query('begin');await client.query("select set_config('app.tenant_id',$1,true)",[`${suffix}_a`]);
   const row=(await client.query('select policy_number_enc,policy_number_hash,premium_gross_paise from held_policy where id=$1',[`${suffix}_roundtrip`])).rows[0];
   expect(row.policy_number_enc).toBe('encrypted:POL1234');expect(Number(row.premium_gross_paise)).toBe(10000);
   expect((await client.query('select raw from book_import_row where batch_id=$1',[`${suffix}_batch`])).rows).toEqual([]);
   expect((await client.query('select text from servicing_note where request_id=$1',[`${suffix}_service`])).rows).toEqual([{text:'Documents received'}]);
   await client.query("select set_config('app.tenant_id',$1,true)",[`${suffix}_b`]);
   for(const table of ['held_policy','premium_payment','book_import_batch','book_import_row','servicing_request','servicing_note','lifecycle_alert_ledger'])expect((await client.query(`select * from ${table}`)).rows).toHaveLength(0);
  }finally{await client.query('rollback');client.release();}
  const policy=await uow.run(`${suffix}_a`,tx=>new PgHeldPolicyRepository().get(tx,`${suffix}_roundtrip`));expect(policy?.props.policyNumberHash).toBe(`${suffix}_hash_roundtrip`);
 });
});
