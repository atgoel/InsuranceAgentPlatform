import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { TenantBuckets } from '../../../kernel/persistence/tenant-buckets';
import { PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { AdviceRecord, AdviceRecordProps } from '../domain/advice-record';
import { QuoteOptionProps, QuoteRequest, QuoteRequestProps } from '../domain/quote';
import { BiRecord, BiRecordProps } from '../domain/benefit-illustration';
import { AdviceRepository, BiRepository, CalculatorRun, CalculatorRunRepository, QuoteRepository } from '../application/ports';

/** Optimistic save shared by the aggregate stores: stored version must equal the aggregate's. */
function saveVersioned<P extends { id: string; version: number }>(bucket: Map<string, P>, props: P, entity: string): void {
  const stored = bucket.get(props.id);
  if (stored && stored.version !== props.version) throw new PreconditionFailedError('version_mismatch', `The ${entity} was changed by someone else; reload and retry`);
  bucket.set(props.id, structuredClone({ ...props, version: props.version + 1 }));
}

export class InMemoryAdviceRepository implements AdviceRepository {
  private readonly rows = new TenantBuckets<Map<string, AdviceRecordProps>>(() => new Map());

  async get(tx: Transaction, id: string): Promise<AdviceRecord | undefined> {
    const p = this.rows.of(tx).get(id);
    return p && AdviceRecord.restore(structuredClone(p));
  }

  async save(tx: Transaction, a: AdviceRecord): Promise<void> {
    saveVersioned(this.rows.of(tx), a.props as AdviceRecordProps, 'advice record');
    a.markSaved();
  }

  async forParty(tx: Transaction, partyId: string): Promise<AdviceRecord[]> {
    return [...this.rows.of(tx).values()]
      .filter((p) => p.partyId === partyId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => AdviceRecord.restore(structuredClone(p)));
  }
}

export class InMemoryQuoteRepository implements QuoteRepository {
  private readonly rows = new TenantBuckets<Map<string, QuoteRequestProps>>(() => new Map());

  async get(tx: Transaction, id: string): Promise<QuoteRequest | undefined> {
    const p = this.rows.of(tx).get(id);
    return p && QuoteRequest.restore(structuredClone(p));
  }

  async save(tx: Transaction, q: QuoteRequest): Promise<void> {
    saveVersioned(this.rows.of(tx), q.props as QuoteRequestProps, 'quote');
    q.markSaved();
  }

  async forOpportunity(tx: Transaction, opportunityId: string): Promise<QuoteRequest[]> {
    return [...this.rows.of(tx).values()]
      .filter((p) => p.opportunityId === opportunityId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => QuoteRequest.restore(structuredClone(p)));
  }

  async findOption(tx: Transaction, optionId: string): Promise<{ request: QuoteRequest; option: QuoteOptionProps } | undefined> {
    for (const p of this.rows.of(tx).values()) {
      const option = p.options.find((o) => o.id === optionId);
      if (option) return { request: QuoteRequest.restore(structuredClone(p)), option: structuredClone(option) };
    }
    return undefined;
  }

  async openWithValidityBefore(tx: Transaction, date: string, limit: number): Promise<QuoteRequest[]> {
    return [...this.rows.of(tx).values()]
      .filter((p) => (p.status === 'OPEN' || p.status === 'SHARED') && p.options.length > 0 && p.options.every((o) => o.validUntil < date))
      .slice(0, limit)
      .map((p) => QuoteRequest.restore(structuredClone(p)));
  }
}

export class InMemoryBiRepository implements BiRepository {
  private readonly rows = new TenantBuckets<Map<string, BiRecordProps>>(() => new Map());

  async get(tx: Transaction, id: string): Promise<BiRecord | undefined> {
    const p = this.rows.of(tx).get(id);
    return p && BiRecord.restore(structuredClone(p));
  }

  async save(tx: Transaction, b: BiRecord): Promise<void> {
    saveVersioned(this.rows.of(tx), b.props as BiRecordProps, 'benefit illustration');
    b.markSaved();
  }

  async forOption(tx: Transaction, optionId: string): Promise<BiRecord[]> {
    return [...this.rows.of(tx).values()]
      .filter((p) => p.quoteOptionId === optionId)
      .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))
      .map((p) => BiRecord.restore(structuredClone(p)));
  }
}

export class InMemoryCalculatorRunRepository implements CalculatorRunRepository {
  private readonly rows = new TenantBuckets<CalculatorRun[]>(() => []);

  async add(tx: Transaction, run: CalculatorRun): Promise<void> {
    this.rows.of(tx).push(structuredClone(run));
  }

  async forParty(tx: Transaction, partyId: string, limit: number): Promise<CalculatorRun[]> {
    return this.rows.of(tx)
      .filter((r) => r.partyId === partyId)
      .map((r, index) => ({ r: structuredClone(r), index }))
      .sort((a, b) => b.r.ranAt.localeCompare(a.r.ranAt) || b.index - a.index)
      .map((x) => x.r)
      .slice(0, limit);
  }
}
