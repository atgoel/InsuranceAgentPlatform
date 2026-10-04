import { BookModule } from '../../src/modules/book/book.module';
import { createTestApp, TestApp } from '../support/test-app';
import { Principal } from '../../src/kernel/tenancy/principal';
import { UNIT_OF_WORK, AUDIT_LOG } from '../../src/kernel/tokens';
import { UnitOfWork } from '../../src/kernel/persistence/unit-of-work';
import { InMemoryAuditLog } from '../../src/kernel/audit/audit-log';
import { HeldPolicy } from '../../src/modules/book/domain/held-policy';
import { ServicingRequest } from '../../src/modules/book/domain/servicing';
import { policy } from '../../src/modules/book/domain/test-fixture';
import { HELD_POLICY_REPOSITORY, HeldPolicyRepository, SERVICING_REPOSITORY, ServicingRepository } from '../../src/modules/book/application/ports';
import { ServicingService } from '../../src/modules/book/application/servicing.service';
import { RenewalOpportunityJob } from '../../src/modules/book/application/renewal-opportunity.job';
import { DueService } from '../../src/modules/book/application/due.service';

const admin:Principal={tenantId:'ten_acme',userRef:'admin_user',roles:['TENANT_ADMIN'],realm:'workforce'};
const seller:Principal={tenantId:'ten_acme',userRef:'seller_user',memberId:'member_1',roles:['SALESPERSON'],realm:'workforce'};
describe('AC-M07 service boundaries through real repositories',()=>{
 let app:TestApp;
 beforeEach(async()=>{app=await createTestApp({imports:[BookModule]});app.clock.set(new Date('2026-10-03T00:00:00Z'));});
 afterEach(async()=>{await app.close();});
 const savePolicy=(key:string,extra:Parameters<typeof policy>[0]={})=>app.app.get<UnitOfWork>(UNIT_OF_WORK).run('ten_acme',async tx=>{
  const p=HeldPolicy.restore(policy({id:key,policyNumberHash:`hash-${key}`,nextDueDate:'2026-10-03',servicingMemberId:'member_1',...extra}));await app.app.get<HeldPolicyRepository>(HELD_POLICY_REPOSITORY).save(tx,p);return p;
 });
 it('AC-M07-12 preserves authored notes across a guarded status and follow-up change',async()=>{
  const p=await savePolicy('service');const service=app.app.get(ServicingService);
  const created=await service.create(admin,p.props.id,{kind:'CLAIM',insurerRef:'INS-1',followUpOn:'2026-10-05'});
  const noted=await service.note(admin,created.id,'Documents received');expect(noted.notes).toEqual([{at:'2026-10-03T00:00:00.000Z',by:'admin_user',text:'Documents received'}]);
  const submitted=await service.patch(admin,created.id,{status:'SUBMITTED_TO_INSURER',followUpOn:'2026-10-03',portalUrl:'https://insurer.example/claim'},noted.version);
  expect(submitted).toMatchObject({status:'SUBMITTED_TO_INSURER',followUpOn:'2026-10-03',portalUrl:'https://insurer.example/claim',notes:noted.notes});
  await expect(service.patch(admin,created.id,{insurerRef:'INS-2'},noted.version)).rejects.toMatchObject({code:'version_mismatch'});
  const resolved=await service.patch(admin,created.id,{status:'RESOLVED'},submitted.version);
  expect(resolved.notes).toEqual(noted.notes);expect((await service.list(admin,'2026-10-03')).items).toEqual([]);
  expect((await service.list(admin)).items).toHaveLength(1);
  expect(app.app.get<InMemoryAuditLog>(AUDIT_LOG).events.filter(e=>e.action==='book.servicing.changed')).toHaveLength(4);
 });
 it('AC-M07-12 follow-up queues omit missing and out-of-scope policies without exposing requests',async()=>{
  const own=await savePolicy('own'),other=await savePolicy('other',{servicingMemberId:'member_2'});const service=app.app.get(ServicingService);
  const due=await service.create(admin,own.props.id,{kind:'ADDRESS_CHANGE',followUpOn:'2026-10-03'});
  await service.create(admin,own.props.id,{kind:'LOAN',followUpOn:'2026-10-04'});
  await service.create(admin,other.props.id,{kind:'CLAIM',followUpOn:'2026-10-02'});
  await app.app.get<UnitOfWork>(UNIT_OF_WORK).run('ten_acme',tx=>app.app.get<ServicingRepository>(SERVICING_REPOSITORY).save(tx,ServicingRequest.create({id:'orphan',heldPolicyId:'missing-policy',kind:'OTHER',followUpOn:'2026-10-01',now:app.clock.now()})));
  expect((await service.list(seller,'2026-10-03')).items.map(r=>r.id)).toEqual([due.id]);
  expect((await service.list(seller)).items).toHaveLength(2);
  await expect(service.note(seller,'missing-request','Documents received')).rejects.toMatchObject({code:'servicing_request_not_found'});
  await expect(service.note(seller,'orphan','Documents received')).rejects.toMatchObject({code:'held_policy_not_found'});
  const note=await service.note(seller,due.id,'Sent to insurer');expect(note.notes[0].by).toBe('member_1');
 });
 it('AC-M07-10 renewal sweep skips canceled, unassigned, life and distant contracts and replays an eligible one',async()=>{
  const annual={line:'HEALTH' as const,mode:'ANNUAL' as const,renewalDate:'2026-10-20',nextDueDate:undefined};
  await savePolicy('canceled',{...annual,status:'CANCELLED'});await savePolicy('surrendered',{...annual,status:'SURRENDERED'});await savePolicy('claimed',{...annual,status:'CLAIMED'});
  await savePolicy('unassigned',{...annual,servicingMemberId:undefined});await savePolicy('distant',{...annual,renewalDate:'2026-12-01'});await savePolicy('life',{renewalDate:'2026-10-20'});
  const job=app.app.get(RenewalOpportunityJob);expect(await job.run('ten_acme')).toEqual({created:0});
  await savePolicy('eligible',annual);expect(await job.run('ten_acme')).toEqual({created:1});expect(await job.run('ten_acme')).toEqual({created:0});
  expect(await job.run('ten_zen')).toEqual({created:0});
 });
 it('AC-M07-04 Today and calendars contain no dues for single, settled or undated contracts',async()=>{
  await savePolicy('single',{mode:'SINGLE'});await savePolicy('closed',{status:'MATURED'});await savePolicy('undated',{nextDueDate:undefined});
  const dues=app.app.get(DueService);expect(await dues.today(seller)).toEqual({dueToday:[],inGrace:[],lapsingSoon:[]});expect(await dues.calendar(seller,'2026-10-01','2026-10-31')).toEqual({days:[]});
  expect(await dues.today({...seller,tenantId:'ten_zen'})).toEqual({dueToday:[],inGrace:[],lapsingSoon:[]});
 });
});
