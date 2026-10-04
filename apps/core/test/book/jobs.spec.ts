import {Member} from '../../src/modules/distribution/domain/member';
import {MEMBER_REPOSITORY,MemberRepository} from '../../src/modules/distribution/application/ports';
import {CATALOGUE_QUERY} from '../../src/modules/catalogue/application/ports';
import {PARTY_FACADE,PartyFacade} from '../../src/modules/party/application/ports';
import {req} from './fixtures';
import {BookModule} from '../../src/modules/book/book.module';
import {createTestApp,TestApp} from '../support/test-app';
import {OUTBOX,UNIT_OF_WORK} from '../../src/kernel/tokens';
import {InMemoryOutbox} from '../../src/kernel/outbox/outbox';
import {UnitOfWork} from '../../src/kernel/persistence/unit-of-work';
import {DomainEvent} from '../../src/kernel/domain/domain-event';
import {LifecycleService} from '../../src/modules/book/application/lifecycle.service';
import {RenewalOpportunityJob} from '../../src/modules/book/application/renewal-opportunity.job';
import {BookSubscribers} from '../../src/modules/book/application/subscribers';
import {IssuedPolicyReader,IssuedPolicySnapshot,ISSUED_POLICY_READER,HELD_POLICY_REPOSITORY,HeldPolicyRepository} from '../../src/modules/book/application/ports';
import {policy} from '../../src/modules/book/domain/test-fixture';
import {party,register} from './fixtures';

describe('AC-M07 background consumers',()=>{
 let app:TestApp;let snapshot:IssuedPolicySnapshot|undefined;
 const reader:IssuedPolicyReader={read:async()=>snapshot};
 beforeEach(async()=>{snapshot=undefined;app=await createTestApp({imports:[BookModule],overrides:[{token:ISSUED_POLICY_READER,value:reader},{token:CATALOGUE_QUERY,value:{versionDetails:async()=>[{versionId:'survival-version',keyFacts:[{label:'survivalBenefitYears',value:'1, 3, 5'}]}]}}]});app.clock.set(new Date('2026-10-03T00:00:00Z'));await app.app.get<UnitOfWork>(UNIT_OF_WORK).run('ten_acme',tx=>app.app.get<MemberRepository>(MEMBER_REPOSITORY).save(tx,Member.restore({id:'member_1',displayName:'Seller',contactHash:'seller',roles:['SALESPERSON'],salespersonType:'EMPLOYEE',orgUnitId:'org_1',status:'active',capacityPerDay:25,skills:[],languages:['en'],invitedAt:'2026-01-01T00:00:00Z',inviteExpiresAt:'2026-01-08T00:00:00Z',version:0})));});afterEach(async()=>{await app?.close();});
 it('AC-M07-06 emits stable lifecycle reminders exactly once on replay',async()=>{
  const p=await register(app,{maturityDate:'2027-01-01'});
  const service=app.app.get(LifecycleService);expect((await service.run('ten_acme')).emitted).toBeGreaterThan(0);expect(await service.run('ten_acme')).toEqual({emitted:0});
  const events=app.app.get<InMemoryOutbox>(OUTBOX).events.filter(e=>e.type==='book.lifecycle.alert');expect(events).toHaveLength(1);expect(events[0].data).toMatchObject({policyId:p.id,kind:'MATURITY',date:'2026-10-03'});
  expect(app.metrics.render()).toContain('book_lifecycle_alerts_total{kind="MATURITY"} 1');
 });
 it('AC-M07-06 uses insured DOB and catalogue survival years with concurrent replay safety',async()=>{
  const p=await register(app,{productVersionId:'survival-version',commercials:{category:'TERM',line:'LIFE',businessType:'FRESH',bookedOn:'2025-10-10',commencementDate:'2025-10-10',premiumNetPaise:10000,premiumTaxPaise:0,premiumGrossPaise:10000}});
  const insured=await req(app,'post','/parties').send({kind:'PERSON',displayName:'Insured Person',contacts:[{channel:'MOBILE',value:'+919876500999'}],dateOfBirth:'1990-10-08'});expect(insured.status).toBe(201);
  await app.app.get<UnitOfWork>(UNIT_OF_WORK).run('ten_acme',tx=>app.app.get<PartyFacade>(PARTY_FACADE).linkRole(tx,{partyId:insured.body.party.id,role:'LIFE_ASSURED',subjectType:'HELD_POLICY',subjectId:p.id}));
  const service=app.app.get(LifecycleService);const results=await Promise.all([service.run('ten_acme'),service.run('ten_acme')]);expect(results.reduce((sum,r)=>sum+r.emitted,0)).toBe(3);
  const events=app.app.get<InMemoryOutbox>(OUTBOX).events.filter(e=>e.type==='book.lifecycle.alert');expect(events.map(e=>e.data)).toEqual(expect.arrayContaining([{policyId:p.id,kind:'BIRTHDAY',date:'2026-10-08'},{policyId:p.id,kind:'SURVIVAL_BENEFIT',date:'2026-10-10'},{policyId:p.id,kind:'ANNIVERSARY',date:'2026-10-10'}]));
 });
 it('AC-M07-10 creates one renewal opportunity for the serving member',async()=>{
  const p=await register(app,{line:'HEALTH',mode:'ANNUAL',nextDueDate:undefined,commercials:{category:'HEALTH_INDIVIDUAL',line:'HEALTH',businessType:'FRESH',bookedOn:'2025-10-20',commencementDate:'2025-10-20',expiryDate:'2026-10-19',premiumNetPaise:10000,premiumTaxPaise:0,premiumGrossPaise:10000}});
  const job=app.app.get(RenewalOpportunityJob);expect(await job.run('ten_acme')).toEqual({created:1});expect(await job.run('ten_acme')).toEqual({created:0});expect(p.renewalDate).toBe('2026-10-20');
 });
 const event=(id:string):DomainEvent<{policySaleId:string;opportunityId?:string}>=>({id,type:'proposal.policy.issued',tenantId:'ten_acme',source:'proposal',subject:'sale1',occurredAt:'2026-10-03T00:00:00Z',specVersion:'1.0',dataVersion:1,data:{policySaleId:'sale1'}});
 it('AC-M07-11 imports only insurer-confirmed platform sales and deduplicates sale identity across events',async()=>{
  const partyId=await party(app);const props=policy({proposerPartyId:partyId,servicingMemberId:'member_1',orgUnitId:'org_1',nextDueDate:'2026-10-03'});
  snapshot={insurerConfirmed:true,policySaleId:'sale1',policyNumber:'ISSUED7654',policy:props};
  const subscriber=app.app.get(BookSubscribers);await subscriber.onPolicyIssued(event('event1'));await subscriber.onPolicyIssued(event('event2'));
  const rows=await app.app.get<UnitOfWork>(UNIT_OF_WORK).run('ten_acme',tx=>app.app.get<HeldPolicyRepository>(HELD_POLICY_REPOSITORY).all(tx));expect(rows).toHaveLength(1);expect(rows[0].props.source).toBe('PLATFORM_SALE');expect(rows[0].props.saleRef?.policySaleId).toBe('sale1');
 });
 it('AC-M07-11 rejects unconfirmed sales and leaves failed event retryable',async()=>{
  const subscriber=app.app.get(BookSubscribers);await expect(subscriber.onPolicyIssued(event('retry_event'))).rejects.toMatchObject({code:'dependency_unavailable'});
  const props=policy({proposerPartyId:await party(app),servicingMemberId:'member_1',orgUnitId:'org_1'});snapshot={insurerConfirmed:false,policySaleId:'sale1',policyNumber:'ISSUED7654',policy:props};
  await expect(subscriber.onPolicyIssued(event('retry_event'))).rejects.toMatchObject({code:'insurer_confirmation_required'});
  snapshot={...snapshot,insurerConfirmed:true};await subscriber.onPolicyIssued(event('retry_event'));
  expect((await app.app.get<UnitOfWork>(UNIT_OF_WORK).run('ten_acme',tx=>app.app.get<HeldPolicyRepository>(HELD_POLICY_REPOSITORY).all(tx)))).toHaveLength(1);
 });
});
