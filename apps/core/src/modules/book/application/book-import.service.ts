import { Injectable } from '@nestjs/common';
import { Principal } from '../../../kernel/tenancy/principal';
import { CustomFieldValidator, CustomFieldDefinition } from '../../../kernel/custom-fields';
import { BusinessRuleError, DomainError, ForbiddenError } from '../../../kernel/errors/domain-errors';
import { validateCommissionReceived } from '../../commission/application/commission-validation';
import { ImportBatch, ImportFormat, ColumnMapping, ImportRow, ImportSummary, suggestMapping, ParsedPolicy } from '../domain/book-import';
import { Transaction } from './ports';
import { BookContext } from './book-context';
import { BookScope } from './book-scope';
import { HeldPolicyService } from './held-policy.service';
import { HeldPolicy } from '../domain/held-policy';
import { BOOK_IMPORT_COMMITTED, BOOK_STATUS_CHANGED } from '../domain/events';
import { isPgTransaction } from '../../../kernel/persistence/unit-of-work';
import { importMoney, importDate } from '../domain/book-import-values';
import { BookImportLookups } from './book-import-lookups';
import { BookImportResources } from './book-resources';

interface UploadInput { format: ImportFormat; fileChecksum: string; asOf: string; rows: Record<string, string>[] }
interface ImportContext { principal: Principal; batch: ImportBatch; row: ImportRow; hash: string }

@Injectable()
export class BookImportService {
    constructor(
        private readonly resources: BookImportResources,
        private readonly lookups: BookImportLookups,
        private readonly held: HeldPolicyService,
        private readonly scope: BookScope,
        private readonly ctx: BookContext,
    ) {}
    private get batches(){return this.resources.batches;}
    private get policies(){return this.resources.policies;}
    private get cipher(){return this.resources.cipher;}
    private get commissions(){return this.resources.commissions;}

    view(batch: ImportBatch) {
        const props = batch.props;
        return {
            ...props, rows: undefined, suggestedMapping: suggestMapping(Object.keys(props.rows[0]?.raw ?? {})),
            summary: {
                ...props.summary, total: props.rows.length,
                problems: props.rows.filter(row => row.problems.length).length,
                duplicates: props.rows.filter(row => row.match?.kind.startsWith('DUPLICATE')).length,
                updates: props.rows.filter(row => row.match?.kind === 'UPDATE').length,
            },
        };
    }

    upload(principal: Principal, input: UploadInput) {
        const key = `${principal.tenantId}:import-checksum:${input.fileChecksum}`;
        return this.ctx.exclusive(key, () => this.ctx.uow.run(principal.tenantId, async tx => {
            await this.lock(tx, key);
            const existing = await this.batches.findByChecksum(tx, input.fileChecksum);
            if (existing) return this.view(await this.scope.batch(tx, principal, existing, existing.props.id));
            const batch = ImportBatch.upload({
                ...input, id: this.ctx.ids.next('imp'), ownerMemberId: principal.memberId ?? principal.userRef,
                orgUnitId: principal.orgUnitId, now: this.ctx.clock.now(),
            });
            await this.scope.batch(tx, principal, batch, batch.props.id);
            await this.batches.save(tx, batch);
            return this.view(batch);
        }));
    }

    get(principal: Principal, id: string) {
        return this.ctx.uow.run(principal.tenantId, async tx =>
            this.view(await this.scope.batch(tx, principal, await this.batches.get(tx, id), id)));
    }

    map(principal: Principal, id: string, mapping: ColumnMapping) {
        return this.exclusiveBatch(principal, id, async (tx, batch) => {
            batch.map(mapping);
            const seen = new Set<string>();
            await batch.validate({ validate: () => [] }, { match: parsed => this.match(tx, principal, batch, parsed, seen) });
            const rows = batch.props.rows;
            for (const row of rows) await this.validateEnrichment(tx, row, { principal, asOf: batch.props.asOf });
            batch.replaceRows(rows);
            await this.batches.save(tx, batch);
            return this.view(batch);
        });
    }

    private async match(tx: Transaction, principal: Principal, batch: ImportBatch, parsed: ParsedPolicy, seen: Set<string>): Promise<ImportRow['match']> {
        const hash = this.numberHash(tx, parsed.policyNumber);
        if (seen.has(hash)) return { kind: 'DUPLICATE_IN_FILE' };
        seen.add(hash);
        const existing = await this.policies.findByNumberHash(tx, hash);
        if (!existing) return { kind: 'NEW' };
        await this.scope.policy(tx, principal, existing, existing.props.id);
        return { kind: existing.props.asOf < batch.props.asOf ? 'UPDATE' : 'DUPLICATE_IN_BOOK', heldPolicyId: existing.props.id };
    }

    private async validateEnrichment(tx: Transaction, row: ImportRow, context: { principal: Principal; asOf: string }) {
        if (!row.parsed) return;
        try {
            await this.lookups.enrichProduct(row.parsed, context.asOf);
            const defs = await this.ctx.defs.activeFor(tx, 'held_policy');
            row.parsed.customFields = CustomFieldValidator.validate(defs, this.typedCustom(defs, row.parsed.customFields));
            await this.held.validatePreview(tx, this.policyInput(row.parsed, 'preview', context.asOf));
            this.validateCommission(row.parsed, context.asOf);
        } catch (error) {
            if (!(error instanceof DomainError)) throw error;
            row.problems.push(error.code, ...this.fieldProblems(error));
        }
        const name = row.parsed.commercials.referredBy?.name;
        if (name) row.referrerSuggestions = await this.lookups.suggestions(tx, context.principal, name);
    }

    private fieldProblems(error: DomainError): string[] {
        if (!('errors' in error) || !Array.isArray(error.errors)) return [];
        return error.errors.map((field: { code: string; path: string }) => `${field.code}:${field.path}`);
    }

    private validateCommission(parsed: ParsedPolicy, asOf: string) {
        if (parsed.commissionAmount === undefined) return;
        validateCommissionReceived({
            heldPolicyId: 'preview', sellerMemberId: 'preview', importKey: 'preview', amountPaise: parsed.commissionAmount,
            ratePct: parsed.commissionRatePct, reason: parsed.commissionRemarks, invoiceNo: parsed.invoiceNo, occurredOn: asOf,
        });
    }

    private typedCustom(defs: readonly CustomFieldDefinition[], values: Record<string, unknown>) {
        const parsed: Record<string, unknown> = { ...values };
        for (const def of defs) {
            const raw = values[def.key];
            if (typeof raw === 'string') parsed[def.key] = this.customValue(def, raw);
        }
        return parsed;
    }

    private customValue(def: CustomFieldDefinition, raw: string): unknown {
        if (!raw.trim()) return undefined;
        switch (def.type) {
            case 'number': return Number(raw);
            case 'money': return importMoney(raw) ?? raw;
            case 'date': return importDate(raw) ?? raw;
            case 'boolean': return ({ true: true, false: false, yes: true, no: false } as Record<string, boolean>)[raw.toLowerCase()] ?? raw;
            default: return raw;
        }
    }

    rows(principal: Principal, id: string, filter: string) {
        return this.ctx.uow.run(principal.tenantId, async tx => {
            const batch = await this.scope.batch(tx, principal, await this.batches.get(tx, id), id);
            const defs = await this.ctx.defs.activeFor(tx, 'held_policy');
            return { items: batch.props.rows.filter(row => this.rowMatches(row, filter)).map(row => this.safeRow(row, defs)) };
        });
    }

    private rowMatches(row: ImportRow, filter: string): boolean {
        if (filter === 'problems') return row.problems.length > 0;
        if (filter === 'duplicates') return row.match?.kind.startsWith('DUPLICATE') === true;
        return true;
    }

    private safeRisk(risk: ParsedPolicy['risk']) {
        if (risk?.schemaId !== 'motor' || typeof risk.details !== 'object' || risk.details === null) return risk;
        const { registrationNo, ...details } = risk.details as Record<string, unknown>;
        return { ...risk, details: { ...details, registrationNoLast4: String(registrationNo).slice(-4) } };
    }

    private safeRow(row: ImportRow, defs: readonly CustomFieldDefinition[]) {
        if (!row.parsed) return { ...row, raw: undefined };
        const { mobile, email, dob: _dob, policyNumber, risk, ...safe } = row.parsed;
        void _dob;
        return {
            ...row, raw: undefined,
            parsed: {
                ...safe, customFields: CustomFieldValidator.mask(defs, safe.customFields), policyNumber: `XXXX${policyNumber.slice(-4)}`,
                mobile: mobile ? `+91******${mobile.slice(-4)}` : undefined,
                email: email ? `${email[0]}***@${email.split('@')[1]}` : undefined, risk: this.safeRisk(risk),
            },
        };
    }

    decide(principal: Principal, id: string, rowNo: number, decision: ImportRow['decision']) {
        return this.exclusiveBatch(principal, id, async (tx, batch) => {
            batch.decide(rowNo, decision);
            await this.batches.save(tx, batch);
            return this.view(batch);
        });
    }

    referrer(principal: Principal, id: string, rowNo: number, link: { memberId?: string; partyId?: string }) {
        return this.exclusiveBatch(principal, id, async (tx, batch) => {
            if (link.partyId) await this.scope.party(tx, principal, link.partyId);
            const name = batch.props.rows.find(row => row.rowNo === rowNo)?.parsed?.commercials.referredBy?.name;
            if (!name) throw new ForbiddenError('invalid_referrer', 'Referrer is unavailable');
            const suggestions = await this.lookups.suggestions(tx, principal, name);
            this.checkReferrer(suggestions, link);
            batch.confirmReferrer(rowNo, link);
            await this.batches.save(tx, batch);
            return this.view(batch);
        });
    }

    private checkReferrer(suggestions: NonNullable<ImportRow['referrerSuggestions']>, link: { memberId?: string; partyId?: string }) {
        const validMember = !link.memberId || suggestions.some(suggestion => suggestion.memberId === link.memberId);
        const validParty = !link.partyId || suggestions.some(suggestion => suggestion.partyId === link.partyId);
        if (!validMember || !validParty) throw new ForbiddenError('invalid_referrer', 'Confirm an exact-name suggestion in your scope');
    }

    private exclusiveBatch<T>(principal: Principal, id: string, work: (tx: Transaction, batch: ImportBatch) => Promise<T>) {
        return this.ctx.exclusive(`${principal.tenantId}:import:${id}`, () => this.ctx.uow.run(principal.tenantId, async tx =>
            work(tx, await this.mutableBatch(tx, principal, id))));
    }

    private async lock(tx: Transaction, key: string) {
        if (isPgTransaction(tx)) await tx.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
    }

    private async mutableBatch(tx: Transaction, principal: Principal, id: string) {
        await this.lock(tx, `${tx.tenantId}:import:${id}`);
        return this.scope.batch(tx, principal, await this.batches.get(tx, id), id);
    }

    commit(principal: Principal, id: string) {
        return this.ctx.exclusive(`${principal.tenantId}:import:${id}`, () => this.commitExclusive(principal, id));
    }

    private replay(summary: ImportSummary): ImportSummary {
        return { imported: 0, updated: 0, skipped: summary.imported + summary.updated + summary.skipped, parties: { created: 0, linked: 0 } };
    }

    private async commitExclusive(principal: Principal, id: string) {
        const initial = await this.ctx.uow.run(principal.tenantId, tx => this.mutableBatch(tx, principal, id));
        if (initial.props.state === 'COMMITTED') return this.replay(initial.props.summary);
        this.ensureReady(initial);
        const pending = initial.props.rows.filter(row => !row.committed).map(row => row.rowNo);
        for (let offset = 0; offset < pending.length; offset += 200) await this.commitChunk(principal, id, pending.slice(offset, offset + 200));
        return this.finalize(principal, id);
    }

    private finalize(principal: Principal, id: string) {
        return this.ctx.uow.run(principal.tenantId, async tx => {
            const batch = await this.mutableBatch(tx, principal, id);
            if (batch.props.state === 'COMMITTED') return this.replay(batch.props.summary);
            if (batch.props.rows.some(row => !row.committed)) throw new BusinessRuleError('import_not_ready', 'Rows remain uncommitted');
            const summary = batch.props.summary;
            batch.committed(summary);
            await this.batches.save(tx, batch);
            await this.ctx.recorder.record(tx, {
                event: { type: BOOK_IMPORT_COMMITTED, subject: id, data: { batchId: id, imported: summary.imported, updated: summary.updated, skipped: summary.skipped } },
                audit: { action: BOOK_IMPORT_COMMITTED, entityType: 'book_import', entityId: id },
            });
            this.ctx.logger.info(BOOK_IMPORT_COMMITTED, 'Book import committed', { batchId: id, imported: summary.imported, updated: summary.updated, skipped: summary.skipped });
            return summary;
        });
    }

    private ensureReady(batch: ImportBatch) {
        if (!batch.readyToCommit()) throw new BusinessRuleError('import_not_ready', 'Resolve row problems and decisions before committing');
    }

    private commitChunk(principal: Principal, id: string, rowNos: number[]) {
        return this.ctx.uow.run(principal.tenantId, async tx => {
            const batch = await this.mutableBatch(tx, principal, id);
            if (batch.props.state === 'COMMITTED') return;
            this.ensureReady(batch);
            const summary = structuredClone(batch.props.summary);
            for (const row of batch.props.rows.filter(row => rowNos.includes(row.rowNo) && !row.committed)) {
                if (row.decision === 'SKIP') { summary.skipped++; this.rowMetric('skipped'); continue; }
                if (!row.parsed) throw new BusinessRuleError('import_not_ready', 'Validated row is missing');
                await this.commitRow(tx, { principal, batch, row, hash: this.numberHash(tx, row.parsed.policyNumber) }, row.parsed, summary);
            }
            batch.finishRows(rowNos, summary);
            await this.batches.save(tx, batch);
        });
    }

    private async commitRow(tx: Transaction, context: ImportContext, parsed: ParsedPolicy, summary: ImportSummary) {
        let policy = await this.policies.findByNumberHash(tx, context.hash);
        if (policy) {
            await this.scope.policy(tx, context.principal, policy, policy.props.id);
            if (context.row.decision !== 'UPDATE' || policy.props.asOf >= context.batch.props.asOf) {
                summary.skipped++; this.rowMetric('skipped'); return;
            }
            await this.updatePolicy(tx, policy, parsed, context.batch.props.asOf);
            summary.updated++;
        } else {
            policy = await this.createPolicy(tx, context, parsed, summary);
            summary.imported++;
        }
        await this.recordCommission(tx, policy, parsed, context);
        this.rowMetric(context.row.decision === 'UPDATE' ? 'updated' : 'imported');
    }

    private async updatePolicy(tx: Transaction, policy: HeldPolicy, parsed: ParsedPolicy, asOf: string) {
        policy.updateStatusFromSource(parsed.status, asOf, 'IMPORT');
        if (parsed.risk) {
            const safe = await this.held.prepareRisk(tx, this.policyInput(parsed, policy.props.proposerPartyId, asOf));
            policy.replaceRisk(safe.risk, safe);
        }
        policy.replaceCommercials(parsed.commercials, policy.props.risk, this.ctx.clock.now());
        await this.held.refreshBookingChannel(tx, policy);
        policy.replaceCustomFields(CustomFieldValidator.validate(await this.ctx.defs.activeFor(tx, 'held_policy'), { ...parsed.customFields }));
        await this.policies.save(tx, policy);
        await this.held.record(tx, policy, BOOK_STATUS_CHANGED);
    }

    private async createPolicy(tx: Transaction, context: ImportContext, parsed: ParsedPolicy, summary: ImportSummary): Promise<HeldPolicy> {
        const holder = await this.createHolder(tx, context.principal, parsed);
        await this.scope.party(tx, context.principal, holder.partyId);
        if (holder.created) summary.parties.created++; else summary.parties.linked++;
        const view = await this.held.registerIn(tx, context.principal, this.policyInput(parsed, holder.partyId, context.batch.props.asOf), 'IMPORT', {
            sourceRef: `${context.batch.props.id}:${context.row.rowNo}`,
        });
        const policy = await this.policies.get(tx, view.id);
        if (!policy) throw new BusinessRuleError('import_policy_missing', 'Committed policy could not be read');
        return policy;
    }

    private createHolder(tx: Transaction, principal: Principal, parsed: ParsedPolicy) {
        const contacts = [];
        if (parsed.mobile) contacts.push({ channel: 'MOBILE' as const, value: parsed.mobile });
        if (parsed.email) contacts.push({ channel: 'EMAIL' as const, value: parsed.email });
        return this.scope.parties.findOrCreate(tx, {
            kind: 'PERSON', displayName: parsed.holderName, contacts, dateOfBirth: parsed.dob,
            source: { kind: 'BOOK' }, ownerMemberId: principal.memberId, orgUnitId: principal.orgUnitId, onDuplicate: 'link',
        });
    }

    private async recordCommission(tx: Transaction, policy: HeldPolicy, parsed: ParsedPolicy, context: ImportContext) {
        if (parsed.commissionAmount === undefined) return;
        const { principal, batch, row, hash } = context;
        await this.commissions.recordReceived(tx, {
            heldPolicyId: policy.props.id, insurerId: policy.props.insurerId,
            sellerMemberId: policy.props.servicingMemberId ?? principal.memberId ?? principal.userRef,
            amountPaise: parsed.commissionAmount, ratePct: parsed.commissionRatePct, reason: parsed.commissionRemarks, invoiceNo: parsed.invoiceNo,
            occurredOn: batch.props.asOf, importKey: this.cipher.hash(tx.tenantId, `${batch.props.fileChecksum}:${row.rowNo}:${hash}`),
        });
    }

    private numberHash(tx: Transaction, number: string): string { return this.cipher.hash(tx.tenantId, number.trim().toUpperCase()); }
    private rowMetric(outcome: string) { this.ctx.metrics.counter('book_import_rows_total', 'Book rows imported', ['outcome']).inc({ outcome }); }

    private policyInput(parsed: ParsedPolicy, partyId: string, asOf: string) {
        return {
            policyNumber: parsed.policyNumber, insurerId: parsed.insurerId, insurerName: parsed.insurerName,
            productVersionId: parsed.productVersionId, productName: parsed.productName, mode: parsed.mode, commercials: parsed.commercials,
            line: parsed.commercials.line, proposerPartyId: partyId, asOf, confidence: 'MEDIUM' as const, status: parsed.status, sumAssuredPaise: parsed.sumAssuredPaise,
            nextDueDate: parsed.nextDueDate, maturityDate: parsed.maturityDate, renewalDate: parsed.renewalDate, risk: parsed.risk, customFields: parsed.customFields,
        };
    }
}
