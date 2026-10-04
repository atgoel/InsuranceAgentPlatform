import { Inject, Injectable } from '@nestjs/common';
import { Money } from '../../../kernel/domain';
import { isPgTransaction, Transaction } from '../../../kernel/persistence/unit-of-work';
import { TenantBuckets } from '../../../kernel/persistence/tenant-buckets';
import { Opportunity } from '../domain/opportunity';
import { CRM_PORT_FACTORY, CrmPortFactory, OPPORTUNITY_REPOSITORY, OpportunityRepository } from './ports';
import { CrmContext } from './crm-context';
import { RenewalOpportunityInput, RenewalOpportunityPort } from './renewal-opportunity.port';

@Injectable()
export class RenewalOpportunityService implements RenewalOpportunityPort {
 private readonly mappings = new TenantBuckets<Map<string,string>>(()=>new Map());
 private readonly queues = new Map<string,Promise<unknown>>();
 constructor(@Inject(CRM_PORT_FACTORY) private readonly factory:CrmPortFactory,@Inject(OPPORTUNITY_REPOSITORY) private readonly opportunities:OpportunityRepository,private readonly ctx:CrmContext) {}
 async ensure(tx:Transaction,input:RenewalOpportunityInput):Promise<{opportunityId:string;created:boolean}> {
  Money.ofPaise(input.premiumPaise);
  if(isPgTransaction(tx)) {
   await tx.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`${tx.tenantId}:${input.heldPolicyId}`]);
   return this.ensureLocked(tx,input);
  }
  const key=`${tx.tenantId}:${input.heldPolicyId}`;
  const previous=this.queues.get(key)??Promise.resolve();
  const current=previous.catch(()=>undefined).then(()=>this.ensureLocked(tx,input));
  this.queues.set(key,current);
  try{return await current;} finally {if(this.queues.get(key)===current)this.queues.delete(key);}
 }
 private async ensureLocked(tx:Transaction,input:RenewalOpportunityInput):Promise<{opportunityId:string;created:boolean}> {
  const key=`${input.heldPolicyId}:${input.renewalDate}`;
  const mappings=isPgTransaction(tx)?(await tx.query<{renewal_date:string;opportunity_id:string}>('select renewal_date::text,opportunity_id from crm_renewal_opportunity where held_policy_id=$1',[input.heldPolicyId])).rows.map(r=>({key:`${input.heldPolicyId}:${r.renewal_date}`,id:r.opportunity_id})): [...this.mappings.of(tx)].filter(([k])=>k.startsWith(`${input.heldPolicyId}:`)).map(([key,id])=>({key,id}));
  const exact=mappings.find(m=>m.key===key);
  if(exact)return {opportunityId:exact.id,created:false};
  for(const mapping of mappings){
   const opportunity=await this.opportunities.get(tx,mapping.id);
   if(opportunity&&!['ISSUED','LOST'].includes(opportunity.props.stage)) {
    await this.remember(tx,input,opportunity.props.id);
    return {opportunityId:opportunity.props.id,created:false};
   }
  }
  const opportunity=Opportunity.open({id:this.ctx.ids.next('opp'),partyId:input.partyId,ownerMemberId:input.ownerMemberId,orgUnitId:input.orgUnitId,productInterest:input.line==='HEALTH'?'HEALTH':'OTHER',title:`Renewal — ${input.productName}`,expectedPremium:Money.ofPaise(input.premiumPaise),startStage:'DISCOVERY',now:this.ctx.clock.now()});
  await (await this.factory.forTenant(tx.tenantId)).saveOpportunity(tx,opportunity);
  await this.remember(tx,input,opportunity.props.id);
  return {opportunityId:opportunity.props.id,created:true};
 }
 private async remember(tx:Transaction,input:RenewalOpportunityInput,id:string):Promise<void>{
  if(isPgTransaction(tx)) await tx.query('insert into crm_renewal_opportunity (tenant_id,held_policy_id,renewal_date,opportunity_id) values ($1,$2,$3,$4)',[tx.tenantId,input.heldPolicyId,input.renewalDate,id]);
  else this.mappings.of(tx).set(`${input.heldPolicyId}:${input.renewalDate}`,id);
 }
}
