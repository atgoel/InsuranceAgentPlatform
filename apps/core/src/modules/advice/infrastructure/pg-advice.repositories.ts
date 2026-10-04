import { PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { isPgTransaction, PgTransaction, Transaction } from '../../../kernel/persistence/unit-of-work';
import { AdviceRecord, AdviceRecordProps } from '../domain/advice-record';
import { QuoteOptionProps, QuoteRequest, QuoteRequestProps } from '../domain/quote';
import { BiRecord, BiRecordProps } from '../domain/benefit-illustration';
import { AdviceRepository, BiRepository, CalculatorRun, CalculatorRunRepository, QuoteRepository } from '../application/ports';

function pg(tx: Transaction): PgTransaction {
  if (!isPgTransaction(tx)) throw new Error('Postgres repository used outside a Postgres transaction');
  return tx;
}

const iso = (d: Date | null): string | undefined => (d ? d.toISOString() : undefined);
const opt = <K extends string, V>(key: K, value: V | null | undefined): { [P in K]?: V } =>
  value === null || value === undefined ? {} : ({ [key]: value } as { [P in K]?: V });
const nul = <T>(v: T | undefined): T | null => v ?? null;
const json = (v: unknown): string => JSON.stringify(v);

/** bigint columns arrive as text; money is integer paise and must fit a JS safe integer. */
function paise(value: string | number, column: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`${column} is not a safe integer amount of paise: ${String(value)}`);
  return n;
}

const mismatch = (entity: string): PreconditionFailedError =>
  new PreconditionFailedError('version_mismatch', `The ${entity} was changed by someone else; reload and retry`);

interface AdviceRow {
  id: string;
  party_id: string;
  opportunity_id: string | null;
  advisor_member_id: string;
  status: AdviceRecordProps['status'];
  scope: AdviceRecordProps['scope'];
  calculator_runs: AdviceRecordProps['calculatorRuns'];
  recommended: AdviceRecordProps['recommended'];
  customer_choice: AdviceRecordProps['customerChoice'] | null;
  suitability_notes: string;
  finalised_at: Date | null;
  created_at: Date;
  version: number;
}

const toAdvice = (r: AdviceRow): AdviceRecord =>
  AdviceRecord.restore({
    id: r.id,
    partyId: r.party_id,
    ...opt('opportunityId', r.opportunity_id),
    advisorMemberId: r.advisor_member_id,
    calculatorRuns: r.calculator_runs,
    scope: r.scope,
    recommended: r.recommended,
    ...opt('customerChoice', r.customer_choice),
    suitabilityNotes: r.suitability_notes,
    status: r.status,
    ...opt('finalisedAt', iso(r.finalised_at)),
    version: r.version,
    createdAt: r.created_at.toISOString(),
  });

export class PgAdviceRepository implements AdviceRepository {
  async get(tx: Transaction, id: string): Promise<AdviceRecord | undefined> {
    const { rows } = await pg(tx).query<AdviceRow>('select * from advice_record where id = $1', [id]);
    return rows[0] && toAdvice(rows[0]);
  }

  /**
   * Optimistic version. A FINALISED row is evidence: the restrictive RLS policy advice_record_draft_only makes the update fail
   * (Postgres raises on ON CONFLICT DO UPDATE), so a write to a finalised record is an error and never silently ignored.
   */
  async save(tx: Transaction, a: AdviceRecord): Promise<void> {
    const p = a.props;
    const { rowCount } = await pg(tx).query(
      `insert into advice_record (id, tenant_id, party_id, opportunity_id, advisor_member_id, status, scope, calculator_runs, recommended, customer_choice, suitability_notes,
         finalised_at, created_at, updated_at, version)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13,now(),$14)
       on conflict (id) do update set opportunity_id = excluded.opportunity_id, status = excluded.status, scope = excluded.scope, calculator_runs = excluded.calculator_runs,
         recommended = excluded.recommended, customer_choice = excluded.customer_choice, suitability_notes = excluded.suitability_notes, finalised_at = excluded.finalised_at,
         updated_at = excluded.updated_at, version = excluded.version
       where advice_record.version = excluded.version - 1`,
      [
        p.id,
        tx.tenantId,
        p.partyId,
        nul(p.opportunityId),
        p.advisorMemberId,
        p.status,
        json(p.scope),
        json(p.calculatorRuns),
        json(p.recommended),
        p.customerChoice ? json(p.customerChoice) : null,
        p.suitabilityNotes,
        nul(p.finalisedAt),
        p.createdAt,
        p.version + 1,
      ],
    );
    if (rowCount === 0) throw mismatch('advice record');
    a.markSaved();
  }

  async forParty(tx: Transaction, partyId: string): Promise<AdviceRecord[]> {
    const { rows } = await pg(tx).query<AdviceRow>('select * from advice_record where party_id = $1 order by created_at desc, id desc', [
      partyId,
    ]);
    return rows.map(toAdvice);
  }
}

interface RequestRow {
  id: string;
  opportunity_id: string;
  party_id: string;
  line: QuoteRequestProps['line'];
  insured_party_ids: string[];
  requirements: Record<string, string>;
  advice_record_id: string | null;
  status: QuoteRequestProps['status'];
  selected_option_id: string | null;
  shared_at: Date | null;
  selected_at: Date | null;
  created_at: Date;
  version: number;
}

interface OptionRow {
  id: string;
  quote_request_id: string;
  version_id: string;
  insurer_id: string;
  source: QuoteOptionProps['source'];
  insurer_quote_ref: string | null;
  sum_assured_paise: string;
  policy_term_years: number | null;
  premium_paying_term_years: number | null;
  premium_base_paise: string;
  premium_riders_paise: string;
  premium_tax_paise: string;
  premium_total_paise: string;
  premium_frequency: QuoteOptionProps['premium']['frequency'];
  coverage: QuoteOptionProps['coverage'];
  exclusions: string[];
  waiting_periods: QuoteOptionProps['waitingPeriods'];
  assumptions: Record<string, string>;
  valid_until: string;
  captured_by: string;
  captured_at: Date;
}

const OPTION_COLUMNS = `id, quote_request_id, version_id, insurer_id, source, insurer_quote_ref, sum_assured_paise, policy_term_years, premium_paying_term_years, premium_base_paise,
  premium_riders_paise, premium_tax_paise, premium_total_paise, premium_frequency, coverage, exclusions, waiting_periods, assumptions, valid_until::text as valid_until, captured_by, captured_at`;

const toOption = (r: OptionRow): QuoteOptionProps => ({
  id: r.id,
  versionId: r.version_id,
  insurerId: r.insurer_id,
  source: r.source,
  ...opt('insurerQuoteRef', r.insurer_quote_ref),
  sumAssuredPaise: paise(r.sum_assured_paise, 'sum_assured_paise'),
  ...opt('policyTermYears', r.policy_term_years),
  ...opt('premiumPayingTermYears', r.premium_paying_term_years),
  premium: {
    basePaise: paise(r.premium_base_paise, 'premium_base_paise'),
    ridersPaise: paise(r.premium_riders_paise, 'premium_riders_paise'),
    taxPaise: paise(r.premium_tax_paise, 'premium_tax_paise'),
    totalPaise: paise(r.premium_total_paise, 'premium_total_paise'),
    frequency: r.premium_frequency,
  },
  coverage: r.coverage,
  exclusions: r.exclusions,
  waitingPeriods: r.waiting_periods,
  assumptions: r.assumptions,
  validUntil: r.valid_until,
  capturedBy: r.captured_by,
  capturedAt: r.captured_at.toISOString(),
});

const toRequest = (r: RequestRow, options: QuoteOptionProps[]): QuoteRequest =>
  QuoteRequest.restore({
    id: r.id,
    opportunityId: r.opportunity_id,
    partyId: r.party_id,
    line: r.line,
    insuredPartyIds: r.insured_party_ids,
    requirements: r.requirements,
    ...opt('adviceRecordId', r.advice_record_id),
    options,
    status: r.status,
    ...opt('selectedOptionId', r.selected_option_id),
    ...opt('sharedAt', iso(r.shared_at)),
    ...opt('selectedAt', iso(r.selected_at)),
    createdAt: r.created_at.toISOString(),
    version: r.version,
  });

export class PgQuoteRepository implements QuoteRepository {
  private async hydrate(q: PgTransaction, rows: RequestRow[]): Promise<QuoteRequest[]> {
    if (rows.length === 0) return [];
    const { rows: optionRows } = await q.query<OptionRow>(
      `select ${OPTION_COLUMNS} from quote_option where quote_request_id = any($1::text[]) order by quote_request_id, position`,
      [rows.map((r) => r.id)],
    );
    return rows.map((r) => toRequest(r, optionRows.filter((o) => o.quote_request_id === r.id).map(toOption)));
  }

  async get(tx: Transaction, id: string): Promise<QuoteRequest | undefined> {
    const q = pg(tx);
    const { rows } = await q.query<RequestRow>('select * from quote_request where id = $1', [id]);
    return (await this.hydrate(q, rows))[0];
  }

  async save(tx: Transaction, quote: QuoteRequest): Promise<void> {
    const q = pg(tx);
    const p = quote.props;
    const latest = p.options.reduce<string | null>((max, o) => (max === null || o.validUntil > max ? o.validUntil : max), null);
    const { rowCount } = await q.query(
      `insert into quote_request (id, tenant_id, opportunity_id, party_id, line, insured_party_ids, requirements, advice_record_id, status, selected_option_id, shared_at, selected_at,
         latest_valid_until, created_at, updated_at, version)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12,$13::date,$14,now(),$15)
       on conflict (id) do update set advice_record_id = excluded.advice_record_id, status = excluded.status, selected_option_id = excluded.selected_option_id, shared_at = excluded.shared_at,
         selected_at = excluded.selected_at, insured_party_ids = excluded.insured_party_ids, requirements = excluded.requirements, latest_valid_until = excluded.latest_valid_until,
         updated_at = excluded.updated_at, version = excluded.version
       where quote_request.version = excluded.version - 1`,
      [
        p.id,
        tx.tenantId,
        p.opportunityId,
        p.partyId,
        p.line,
        json(p.insuredPartyIds),
        json(p.requirements),
        nul(p.adviceRecordId),
        p.status,
        nul(p.selectedOptionId),
        nul(p.sharedAt),
        nul(p.selectedAt),
        latest,
        p.createdAt,
        p.version + 1,
      ],
    );
    if (rowCount === 0) throw mismatch('quote');
    await q.query('delete from quote_option where quote_request_id = $1 and id <> all($2::text[])', [p.id, p.options.map((o) => o.id)]);
    for (const [position, o] of p.options.entries()) {
      await q.query(
        `insert into quote_option (id, tenant_id, quote_request_id, position, version_id, insurer_id, source, insurer_quote_ref, sum_assured_paise, policy_term_years, premium_paying_term_years,
           premium_base_paise, premium_riders_paise, premium_tax_paise, premium_total_paise, premium_frequency, coverage, exclusions, waiting_periods, assumptions, valid_until, captured_by, captured_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19::jsonb,$20::jsonb,$21::date,$22,$23)
         on conflict (id) do update set position = excluded.position, version_id = excluded.version_id, insurer_id = excluded.insurer_id, source = excluded.source,
           insurer_quote_ref = excluded.insurer_quote_ref, sum_assured_paise = excluded.sum_assured_paise, policy_term_years = excluded.policy_term_years,
           premium_paying_term_years = excluded.premium_paying_term_years, premium_base_paise = excluded.premium_base_paise, premium_riders_paise = excluded.premium_riders_paise,
           premium_tax_paise = excluded.premium_tax_paise, premium_total_paise = excluded.premium_total_paise, premium_frequency = excluded.premium_frequency, coverage = excluded.coverage,
           exclusions = excluded.exclusions, waiting_periods = excluded.waiting_periods, assumptions = excluded.assumptions, valid_until = excluded.valid_until,
           captured_by = excluded.captured_by, captured_at = excluded.captured_at`,
        [
          o.id,
          tx.tenantId,
          p.id,
          position,
          o.versionId,
          o.insurerId,
          o.source,
          nul(o.insurerQuoteRef),
          o.sumAssuredPaise,
          nul(o.policyTermYears),
          nul(o.premiumPayingTermYears),
          o.premium.basePaise,
          o.premium.ridersPaise,
          o.premium.taxPaise,
          o.premium.totalPaise,
          o.premium.frequency,
          json(o.coverage),
          json(o.exclusions),
          json(o.waitingPeriods),
          json(o.assumptions),
          o.validUntil,
          o.capturedBy,
          o.capturedAt,
        ],
      );
    }
    quote.markSaved();
  }

  async forOpportunity(tx: Transaction, opportunityId: string): Promise<QuoteRequest[]> {
    const q = pg(tx);
    const { rows } = await q.query<RequestRow>('select * from quote_request where opportunity_id = $1 order by created_at desc, id desc', [
      opportunityId,
    ]);
    return this.hydrate(q, rows);
  }

  async findOption(tx: Transaction, optionId: string): Promise<{ request: QuoteRequest; option: QuoteOptionProps } | undefined> {
    const q = pg(tx);
    const { rows } = await q.query<{ quote_request_id: string }>('select quote_request_id from quote_option where id = $1', [optionId]);
    if (!rows[0]) return undefined;
    const request = await this.get(tx, rows[0].quote_request_id);
    const option = request?.option(optionId);
    return request && option ? { request, option } : undefined;
  }

  async openWithValidityBefore(tx: Transaction, date: string, limit: number): Promise<QuoteRequest[]> {
    const q = pg(tx);
    const { rows } = await q.query<RequestRow>(
      `select * from quote_request where status in ('OPEN','SHARED') and latest_valid_until < $1::date order by latest_valid_until, id limit $2`,
      [date, limit],
    );
    return this.hydrate(q, rows);
  }
}

interface BiRow {
  id: string;
  quote_option_id: string;
  document_ref: string;
  insurer_bi_version: string;
  uploaded_by: string;
  uploaded_at: Date;
  acknowledgement: BiRecordProps['acknowledgement'] | null;
  version: number;
}

const toBi = (r: BiRow): BiRecord =>
  BiRecord.restore({
    id: r.id,
    quoteOptionId: r.quote_option_id,
    documentRef: r.document_ref,
    insurerBiVersion: r.insurer_bi_version,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at.toISOString(),
    ...opt('acknowledgement', r.acknowledgement),
    version: r.version,
  });

export class PgBiRepository implements BiRepository {
  async get(tx: Transaction, id: string): Promise<BiRecord | undefined> {
    const { rows } = await pg(tx).query<BiRow>('select * from bi_record where id = $1', [id]);
    return rows[0] && toBi(rows[0]);
  }

  async save(tx: Transaction, b: BiRecord): Promise<void> {
    const p = b.props;
    const { rowCount } = await pg(tx).query(
      `insert into bi_record (id, tenant_id, quote_option_id, document_ref, insurer_bi_version, uploaded_by, uploaded_at, acknowledgement, version)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       on conflict (id) do update set document_ref = excluded.document_ref, insurer_bi_version = excluded.insurer_bi_version, acknowledgement = excluded.acknowledgement, version = excluded.version
       where bi_record.version = excluded.version - 1`,
      [
        p.id,
        tx.tenantId,
        p.quoteOptionId,
        p.documentRef,
        p.insurerBiVersion,
        p.uploadedBy,
        p.uploadedAt,
        p.acknowledgement ? json(p.acknowledgement) : null,
        p.version + 1,
      ],
    );
    if (rowCount === 0) throw mismatch('benefit illustration');
    b.markSaved();
  }

  async forOption(tx: Transaction, optionId: string): Promise<BiRecord[]> {
    const { rows } = await pg(tx).query<BiRow>('select * from bi_record where quote_option_id = $1 order by uploaded_at, id', [optionId]);
    return rows.map(toBi);
  }
}

interface RunRow {
  id: string;
  party_id: string;
  calculator: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  assumptions_version: string;
  ran_by: string;
  ran_at: Date;
}

/** Append-only: the app role holds no UPDATE/DELETE on calculator_run. */
export class PgCalculatorRunRepository implements CalculatorRunRepository {
  async add(tx: Transaction, run: CalculatorRun): Promise<void> {
    await pg(tx).query(
      `insert into calculator_run (id, tenant_id, party_id, calculator, inputs, outputs, assumptions_version, ran_by, ran_at) values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)`,
      [run.id, tx.tenantId, run.partyId, run.calculator, json(run.inputs), json(run.outputs), run.assumptionsVersion, run.ranBy, run.ranAt],
    );
  }

  async forParty(tx: Transaction, partyId: string, limit: number): Promise<CalculatorRun[]> {
    const { rows } = await pg(tx).query<RunRow>('select * from calculator_run where party_id = $1 order by ran_at desc, id desc limit $2', [
      partyId,
      limit,
    ]);
    return rows.map((r) => ({
      id: r.id,
      partyId: r.party_id,
      calculator: r.calculator,
      inputs: r.inputs,
      outputs: r.outputs,
      assumptionsVersion: r.assumptions_version,
      ranBy: r.ran_by,
      ranAt: r.ran_at.toISOString(),
    }));
  }
}
