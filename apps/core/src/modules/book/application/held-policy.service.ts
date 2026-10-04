import { Injectable } from '@nestjs/common';
import { CustomFieldValidator, CustomFieldValues } from '../../../kernel/custom-fields';
import { istDate } from '../../../kernel/domain/ist';
import { PolicyCommercials, PolicyCommercialsProps } from '../../../kernel/insurance/policy-commercials';
import { createRiskSchemaRegistry, checkRiskAgainstCommercials, riskSchemaFor } from '../../../kernel/insurance/risk-details';
import { ConflictError, PreconditionFailedError, ValidationError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { HeldPolicy, HeldPolicyProps } from '../domain/held-policy';
import { BOOK_POLICY_REGISTERED, BOOK_PAYMENT_RECORDED, BOOK_STATUS_CHANGED } from '../domain/events';
import { DueEngine } from '../domain/due-engine';
import { LIFE_GRACE, scheduleFrom } from '../domain/premium-schedule';
import { HeldPolicyFilter, Transaction } from './ports';
import { BookContext } from './book-context';
import { BookScope } from './book-scope';
import { isPgTransaction } from '../../../kernel/persistence/unit-of-work';
import { BookPolicyResources } from './book-resources';
export interface RegisterPolicyInput {
  line: HeldPolicyProps['line'];
  insurerId?: string;
  insurerName: string;
  productVersionId?: string;
  productName: string;
  policyNumber: string;
  proposerPartyId: string;
  sumAssuredPaise?: number;
  mode: HeldPolicyProps['mode'];
  commercials: PolicyCommercialsProps;
  nextDueDate?: string;
  maturityDate?: string;
  premiumPayingTermYears?: number;
  policyTermYears?: number;
  renewalDate?: string;
  status?: HeldPolicyProps['status'];
  statusAsOf?: string;
  asOf: string;
  confidence?: HeldPolicyProps['confidence'];
  servicingMemberId?: string;
  orgUnitId?: string;
  risk?: HeldPolicyProps['risk'];
  customFields?: CustomFieldValues;
  distanceSale?: boolean;
}
export type PolicyPatch = {
  status?: HeldPolicyProps['status'];
  asOf?: string;
  servicingMemberId?: string;
  orgUnitId?: string;
  renewal?: {
    renewalDate: string;
    premiumPaise: number;
  };
  commercials?: PolicyCommercialsProps;
  risk?: HeldPolicyProps['risk'];
  customFields?: CustomFieldValues;
};
@Injectable()
export class HeldPolicyService {
  constructor(
    private readonly resources: BookPolicyResources,
    readonly scope: BookScope,
    readonly ctx: BookContext,
  ) {}
  get policies() {
    return this.resources.policies;
  }
  private get cipher() {
    return this.resources.cipher;
  }
  private get servicing() {
    return this.resources.servicing;
  }
  private get members() {
    return this.resources.members;
  }
  private get codes() {
    return this.resources.codes;
  }
  async prepareRisk(tx: Transaction, input: RegisterPolicyInput) {
    if (!input.risk) return {};
    const schema = riskSchemaFor(input.commercials.category);
    if (!schema || schema.id !== input.risk.schemaId || schema.version !== input.risk.schemaVersion)
      throw new ValidationError('risk_schema_mismatch', 'Risk schema does not match the category');
    const details = createRiskSchemaRegistry().parse<Record<string, unknown>>(schema.id, schema.version, input.risk.details);
    checkRiskAgainstCommercials(schema.id, details, PolicyCommercials.create(input.commercials), istDate(this.ctx.clock.now()));
    if (schema.id !== 'motor') return { risk: { ...input.risk, details } };
    const number = String(details.registrationNo);
    const { registrationNo: _number, ...safe } = details;
    void _number;
    return {
      risk: { ...input.risk, details: safe },
      registrationNoEnc: await this.cipher.encrypt(tx.tenantId, number),
      registrationNoHash: this.cipher.hash(tx.tenantId, number),
      registrationNoLast4: number.slice(-4),
    };
  }
  register(p: Principal, input: RegisterPolicyInput) {
    return this.ctx.uow.run(p.tenantId, async (tx) => {
      await this.scope.party(tx, p, input.proposerPartyId);
      return this.registerIn(tx, p, input);
    });
  }
  async validatePreview(tx: Transaction, input: RegisterPolicyInput) {
    HeldPolicy.register({
      ...input,
      id: 'import-preview',
      source: 'IMPORT',
      status: input.status ?? 'IN_FORCE',
      statusAsOf: input.asOf,
      confidence: 'MEDIUM',
      policyNumberEnc: 'preview',
      policyNumberHash: 'preview',
      policyNumberLast4: input.policyNumber.slice(-4),
      customFields: input.customFields ?? {},
      premiumPaise: input.commercials.premiumGrossPaise,
      commencementDate: input.commercials.commencementDate,
      ...(await this.prepareRisk(tx, input)),
      now: this.ctx.clock.now(),
    });
  }
  async registerIn(
    tx: Transaction,
    p: Principal,
    input: RegisterPolicyInput,
    source: HeldPolicyProps['source'] = 'MANUAL',
    extra: Partial<HeldPolicyProps> = {},
  ) {
    if (source !== 'PLATFORM_SALE') await this.assignment(tx, input.servicingMemberId, input.orgUnitId);
    const policyNumber = input.policyNumber.trim().toUpperCase();
    const hash = this.cipher.hash(tx.tenantId, policyNumber);
    if (await this.policies.findByNumberHash(tx, hash)) throw new ConflictError('policy_number_taken', 'Policy already exists');
    const fields = CustomFieldValidator.validate(await this.ctx.defs.activeFor(tx, 'held_policy'), { ...(input.customFields ?? {}) });
    const now = this.ctx.clock.now();
    const { policyNumber: _plaintext, ...safeInput } = input;
    void _plaintext;
    const policy = HeldPolicy.register({
      ...safeInput,
      ...this.defaults(p, input),
      ...extra,
      bookingChannel: await this.bookingChannel(tx, input, input.servicingMemberId ?? p.memberId),
      id: extra.id ?? this.ctx.ids.next('hp'),
      source,
      policyNumberEnc: await this.cipher.encrypt(tx.tenantId, policyNumber),
      policyNumberHash: hash,
      policyNumberLast4: policyNumber.slice(-4),
      premiumPaise: input.commercials.premiumGrossPaise,
      commencementDate: input.commercials.commencementDate,
      customFields: fields,
      ...(await this.prepareRisk(tx, input)),
      now,
    });
    // A caller cannot assign a new record outside the caller's authorized scope.
    await this.scope.policy(tx, p, policy, policy.props.id);
    await this.policies.save(tx, policy);
    await this.scope.parties.linkRole(tx, {
      partyId: input.proposerPartyId,
      role: 'PROPOSER',
      subjectType: 'HELD_POLICY',
      subjectId: policy.props.id,
    });
    await this.record(tx, policy, BOOK_POLICY_REGISTERED);
    return this.view(tx, policy);
  }
  private defaults(p: Principal, input: RegisterPolicyInput) {
    return {
      confidence: input.confidence ?? 'HIGH',
      status: input.status ?? 'IN_FORCE',
      statusAsOf: input.statusAsOf ?? input.asOf,
      servicingMemberId: input.servicingMemberId ?? p.memberId,
      orgUnitId: input.orgUnitId ?? p.orgUnitId,
    };
  }
  async view(tx: Transaction, policy: HeldPolicy) {
    const { policyNumberEnc: _enc, policyNumberHash: _hash, registrationNoEnc: _motor, registrationNoHash: _mh, ...props } = policy.props;
    void _enc;
    void _hash;
    void _motor;
    void _mh;
    const defs = await this.ctx.defs.activeFor(tx, 'held_policy');
    return {
      ...props,
      policyNumber: `XXXX${props.policyNumberLast4}`,
      holderName: (await this.scope.parties.summary(tx, props.proposerPartyId))?.displayName ?? 'Customer',
      customFields: CustomFieldValidator.mask(defs, props.customFields),
    };
  }
  get(p: Principal, id: string) {
    return this.ctx.uow.run(p.tenantId, async (tx) => {
      const policy = await this.scope.policy(tx, p, await this.policies.get(tx, id), id);
      return {
        ...(await this.view(tx, policy)),
        schedule: scheduleFrom(policy.props, policy.props.nextDueDate ?? policy.props.commencementDate, 12),
        due: new DueEngine(LIFE_GRACE).classify(policy.props, istDate(this.ctx.clock.now())),
        servicingRequests: (await this.servicing.forPolicy(tx, id)).map((r) => r.props),
      };
    });
  }
  list(p: Principal, filter: Omit<HeldPolicyFilter, 'scope'>) {
    return this.ctx.uow.run(p.tenantId, async (tx) => {
      const defs = await this.ctx.defs.activeFor(tx, 'held_policy');
      this.validateFilters(defs, filter.custom);
      const scope = await this.scope.scopes.resolve(tx, p);
      const result = filter.q ? await this.search(tx, { ...filter, scope }, filter.q) : await this.policies.list(tx, { ...filter, scope });
      return { ...result, items: await Promise.all(result.items.map((policy) => this.view(tx, policy))) };
    });
  }
  private validateFilters(defs: Awaited<ReturnType<BookContext['defs']['activeFor']>>, custom?: Record<string, string>) {
    for (const key of Object.keys(custom ?? {}))
      if (!defs.some((d) => d.key === key && d.reportable && d.piiClass !== 'P2'))
        throw new ValidationError('custom_field_not_reportable', 'Custom field cannot be used as a report filter');
  }
  private async search(tx: Transaction, filter: HeldPolicyFilter, q: string) {
    const matching: HeldPolicy[] = [];
    let cursor = filter.cursor;
    do {
      const page = await this.policies.list(tx, { ...filter, q: undefined, limit: 200, cursor });
      for (const policy of page.items) if (await this.searchMatches(tx, policy, q)) matching.push(policy);
      cursor = page.nextCursor;
    } while (cursor && matching.length <= filter.limit);
    return {
      items: matching.slice(0, filter.limit),
      nextCursor: matching.length > filter.limit ? matching[filter.limit - 1]?.props.id : undefined,
    };
  }
  private async searchMatches(tx: Transaction, policy: HeldPolicy, q: string): Promise<boolean> {
    const name = (await this.scope.parties.summary(tx, policy.props.proposerPartyId))?.displayName ?? '';
    const search = q.toLowerCase();
    return policy.props.policyNumberLast4.includes(search) || name.toLowerCase().includes(search);
  }
  payment(p: Principal, id: string, input: { installmentDue: string; paidOn: string }) {
    return this.mutate(p, id, async (tx) => {
      const policy = await this.scope.policy(tx, p, await this.policies.get(tx, id), id);
      if (await this.policies.paymentRecorded(tx, id, input.installmentDue)) return this.view(tx, policy);
      const candidate = HeldPolicy.restore(policy.props);
      candidate.recordPayment(input.installmentDue, input.paidOn, this.ctx.clock.now());
      const added = await this.policies.recordPayment(tx, { policyId: id, ...input, id: this.ctx.ids.next('pay') });
      if (!added) return this.view(tx, policy);
      await this.policies.save(tx, candidate);
      await this.record(tx, candidate, BOOK_PAYMENT_RECORDED);
      return this.view(tx, candidate);
    });
  }
  patch(p: Principal, id: string, input: PolicyPatch, version: number) {
    return this.mutate(p, id, async (tx) => {
      const policy = await this.scope.policy(tx, p, await this.policies.get(tx, id), id);
      if (policy.props.version !== version) throw new PreconditionFailedError();
      this.applyState(policy, input);
      await this.assignment(tx, input.servicingMemberId, input.orgUnitId);
      if (input.servicingMemberId) await this.scope.policy(tx, p, policy, id);
      await this.applyCommercials(tx, policy, input);
      if (input.commercials || input.servicingMemberId) await this.refreshBookingChannel(tx, policy);
      if (input.customFields)
        policy.replaceCustomFields(CustomFieldValidator.validate(await this.ctx.defs.activeFor(tx, 'held_policy'), input.customFields));
      await this.policies.save(tx, policy);
      await this.record(tx, policy, BOOK_STATUS_CHANGED);
      return this.view(tx, policy);
    });
  }
  private mutate<T>(principal: Principal, id: string, work: (tx: Transaction) => Promise<T>) {
    const key = `${principal.tenantId}:held-policy:${id}`;
    return this.ctx.exclusive(key, () =>
      this.ctx.uow.run(principal.tenantId, async (tx) => {
        if (isPgTransaction(tx)) await tx.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
        return work(tx);
      }),
    );
  }
  private async assignment(tx: Transaction, memberId?: string, orgUnitId?: string) {
    if (!memberId) return;
    const member = await this.members.get(tx, memberId);
    if (!member || member.props.orgUnitId !== orgUnitId)
      throw new ValidationError('invalid_servicing_member', 'Servicing member and org unit must match a tenant member');
  }
  async refreshBookingChannel(tx: Transaction, policy: HeldPolicy): Promise<void> {
    policy.replaceBookingChannel(await this.bookingChannel(tx, policy.props, policy.props.servicingMemberId));
  }
  private async bookingChannel(tx: Transaction, input: Pick<RegisterPolicyInput, 'commercials' | 'insurerId'>, memberId?: string) {
    const code = input.commercials.bookingChannelCode;
    if (!code) return undefined;
    if (!memberId || !input.insurerId) return { code };
    const found = (await this.codes.list(tx, memberId)).some((row) => row.insurerId === input.insurerId && row.code === code);
    return found ? { code, insurerCodeId: `${memberId}:${input.insurerId}` } : { code };
  }
  private applyState(policy: HeldPolicy, input: PolicyPatch) {
    if (input.status) {
      if (!input.asOf) throw new ValidationError('as_of_required', 'Status update needs asOf');
      policy.updateStatusFromSource(input.status, input.asOf, 'MANUAL');
    }
    if (input.servicingMemberId) {
      if (!input.orgUnitId) throw new ValidationError('org_unit_required', 'Servicing assignment needs an org unit');
      policy.assignServicing(input.servicingMemberId, input.orgUnitId);
    }
    if (input.renewal) policy.renew(input.renewal.renewalDate, input.renewal.premiumPaise, this.ctx.clock.now());
  }
  private async applyCommercials(tx: Transaction, policy: HeldPolicy, input: PolicyPatch) {
    if (!input.commercials && !input.risk) return;
    const commercials = input.commercials ?? policy.props.commercials;
    if (input.risk) {
      const safe = await this.prepareRisk(tx, { ...policy.props, policyNumber: '', commercials, risk: input.risk });
      policy.replaceRisk(safe.risk, safe);
    }
    policy.replaceCommercials(commercials, policy.props.risk, this.ctx.clock.now());
  }
  async record(tx: Transaction, policy: HeldPolicy, event: string) {
    await this.ctx.recorder.record(tx, {
      event: {
        type: event,
        subject: policy.props.id,
        data: { policyId: policy.props.id, status: policy.props.status, source: policy.props.source },
      },
      audit: { action: event, entityType: 'held_policy', entityId: policy.props.id },
    });
    this.ctx.logger.info(event, 'Held policy changed', { policyId: policy.props.id, last4: policy.props.policyNumberLast4 });
  }
}
