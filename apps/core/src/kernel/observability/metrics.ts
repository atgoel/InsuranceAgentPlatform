/**
 * In-process metrics registry with Prometheus text exposition (spec 02 §5, M00 §4.9).
 * Memory is bounded: series per metric are capped and histograms keep bucket counts, never raw samples.
 */
export type Labels = Record<string, string>;

export interface Counter {
  inc(labels?: Labels, by?: number): void;
  /** Without labels on a labelled counter, returns the total across all series. */
  get(labels?: Labels): number;
}

export interface Gauge {
  set(value: number, labels?: Labels): void;
  inc(labels?: Labels, by?: number): void;
  dec(labels?: Labels, by?: number): void;
  get(labels?: Labels): number;
}

export interface Histogram {
  observe(value: number, labels?: Labels): void;
  count(labels?: Labels): number;
  sum(labels?: Labels): number;
}

type MetricType = 'counter' | 'gauge' | 'histogram';
type OnReject = (metric: string) => void;

export const DEFAULT_BUCKETS = [25, 50, 100, 200, 400, 800, 1600, 3200];
const REJECTED_METRIC = 'metrics_cardinality_rejected_total';

/** Shared series bookkeeping: label validation, stable keys and the cardinality cap. */
class SeriesStore<V> {
  private readonly series = new Map<string, { labels: Labels; value: V }>();

  constructor(
    private readonly name: string,
    private readonly labelNames: readonly string[],
    private readonly maxSeries: number,
    private readonly onReject: OnReject,
  ) {}

  /** Returns the series value holder, creating it when allowed; undefined when the cap rejects a new series. */
  upsert(labels: Labels | undefined, init: () => V): { value: V } | undefined {
    const normalised = this.validate(labels);
    const key = keyOf(normalised);
    const existing = this.series.get(key);
    if (existing) return existing;
    if (this.series.size >= this.maxSeries) {
      this.onReject(this.name);
      return undefined;
    }
    const created = { labels: normalised, value: init() };
    this.series.set(key, created);
    return created;
  }

  find(labels: Labels | undefined): V | undefined {
    return this.series.get(keyOf(this.validate(labels)))?.value;
  }

  hasLabels(): boolean {
    return this.labelNames.length > 0;
  }

  entries(): Array<{ labels: Labels; value: V }> {
    return [...this.series.values()];
  }

  private validate(labels: Labels | undefined): Labels {
    const out: Labels = {};
    for (const [k, v] of Object.entries(labels ?? {})) {
      if (!this.labelNames.includes(k)) throw new Error(`Unknown label "${k}" for metric ${this.name}`);
      out[k] = v;
    }
    return out;
  }
}

function keyOf(labels: Labels): string {
  return Object.keys(labels).sort().map((k) => `${k}=${labels[k]}`).join('\u0001');
}

function formatLabels(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return '';
  return `{${keys.map((k) => `${k}="${escapeLabel(labels[k])}"`).join(',')}}`;
}

function escapeLabel(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

class CounterImpl implements Counter {
  constructor(readonly store: SeriesStore<number[]>) {}

  inc(labels?: Labels, by = 1): void {
    const s = this.store.upsert(labels, () => [0]);
    if (s) s.value[0] += by;
  }

  get(labels?: Labels): number {
    if (!labels && this.store.hasLabels()) return this.store.entries().reduce((a, e) => a + e.value[0], 0);
    return this.store.find(labels)?.[0] ?? 0;
  }
}

class GaugeImpl implements Gauge {
  constructor(readonly store: SeriesStore<number[]>) {}

  set(value: number, labels?: Labels): void {
    const s = this.store.upsert(labels, () => [0]);
    if (s) s.value[0] = value;
  }

  inc(labels?: Labels, by = 1): void {
    const s = this.store.upsert(labels, () => [0]);
    if (s) s.value[0] += by;
  }

  dec(labels?: Labels, by = 1): void {
    this.inc(labels, -by);
  }

  get(labels?: Labels): number {
    return this.store.find(labels)?.[0] ?? 0;
  }
}

interface HistogramState {
  bucketCounts: number[];
  count: number;
  sum: number;
}

class HistogramImpl implements Histogram {
  constructor(readonly store: SeriesStore<HistogramState>, readonly buckets: readonly number[]) {}

  observe(value: number, labels?: Labels): void {
    const s = this.store.upsert(labels, () => ({ bucketCounts: this.buckets.map(() => 0), count: 0, sum: 0 }));
    if (!s) return;
    this.buckets.forEach((le, i) => {
      if (value <= le) s.value.bucketCounts[i] += 1;
    });
    s.value.count += 1;
    s.value.sum += value;
  }

  count(labels?: Labels): number {
    return this.store.find(labels)?.count ?? 0;
  }

  sum(labels?: Labels): number {
    return this.store.find(labels)?.sum ?? 0;
  }
}

interface Registered {
  type: MetricType;
  help: string;
  impl: CounterImpl | GaugeImpl | HistogramImpl;
}

export class MetricsRegistry {
  private readonly metrics = new Map<string, Registered>();
  private readonly maxSeries: number;
  private readonly rejected: CounterImpl;

  constructor(opts?: { maxSeriesPerMetric?: number }) {
    this.maxSeries = opts?.maxSeriesPerMetric ?? 1000;
    // The rejection counter has one series per metric name; it is uncapped by design (bounded by metric count).
    this.rejected = new CounterImpl(new SeriesStore(REJECTED_METRIC, ['metric'], Number.MAX_SAFE_INTEGER, () => undefined));
    this.metrics.set(REJECTED_METRIC, { type: 'counter', help: 'Observations dropped by the per-metric series cap', impl: this.rejected });
  }

  counter(name: string, help: string, labelNames: string[] = []): Counter {
    return this.register(name, 'counter', help, () => new CounterImpl(this.store(name, labelNames))) as CounterImpl;
  }

  gauge(name: string, help: string, labelNames: string[] = []): Gauge {
    return this.register(name, 'gauge', help, () => new GaugeImpl(this.store(name, labelNames))) as GaugeImpl;
  }

  histogram(name: string, help: string, labelNames: string[] = [], buckets: number[] = DEFAULT_BUCKETS): Histogram {
    const sorted = [...buckets].sort((a, b) => a - b);
    return this.register(name, 'histogram', help, () => new HistogramImpl(this.store(name, labelNames), sorted)) as HistogramImpl;
  }

  render(): string {
    const lines: string[] = [];
    for (const [name, m] of this.metrics) {
      if (m.impl instanceof CounterImpl || m.impl instanceof GaugeImpl) {
        if (m.impl.store.entries().length === 0) continue;
        lines.push(`# HELP ${name} ${m.help}`, `# TYPE ${name} ${m.type}`);
        for (const e of m.impl.store.entries()) lines.push(`${name}${formatLabels(e.labels)} ${e.value[0]}`);
      } else {
        if (m.impl.store.entries().length === 0) continue;
        lines.push(`# HELP ${name} ${m.help}`, `# TYPE ${name} histogram`);
        for (const e of m.impl.store.entries()) this.renderHistogram(lines, name, e.labels, e.value, m.impl.buckets);
      }
    }
    return lines.join('\n') + '\n';
  }

  private renderHistogram(lines: string[], name: string, labels: Labels, s: HistogramState, buckets: readonly number[]): void {
    buckets.forEach((le, i) => lines.push(`${name}_bucket${formatLabels({ ...labels, le: String(le) })} ${s.bucketCounts[i]}`));
    lines.push(`${name}_bucket${formatLabels({ ...labels, le: '+Inf' })} ${s.count}`);
    lines.push(`${name}_sum${formatLabels(labels)} ${s.sum}`);
    lines.push(`${name}_count${formatLabels(labels)} ${s.count}`);
  }

  private store<V>(name: string, labelNames: string[]): SeriesStore<V> {
    return new SeriesStore<V>(name, labelNames, this.maxSeries, (metric) => this.rejected.inc({ metric }));
  }

  private register(name: string, type: MetricType, help: string, create: () => Registered['impl']): Registered['impl'] {
    const existing = this.metrics.get(name);
    if (existing) {
      if (existing.type !== type) throw new Error(`Metric ${name} is already registered as a ${existing.type}`);
      return existing.impl;
    }
    const impl = create();
    this.metrics.set(name, { type, help, impl });
    return impl;
  }
}
