export type Labels = Record<string, string>;

export interface Counter {
  inc(labels?: Labels, by?: number): void;
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

class MetricCounter implements Counter {
  private values: Map<string, number> = new Map();

  inc(labels?: Labels, by: number = 1): void {
    const key = this.labelsToKey(labels);
    const current = this.values.get(key) ?? 0;
    this.values.set(key, current + by);
  }

  get(labels?: Labels): number {
    const key = this.labelsToKey(labels);
    return this.values.get(key) ?? 0;
  }

  private labelsToKey(labels?: Labels): string {
    if (!labels || Object.keys(labels).length === 0) return '';
    const sorted = Object.keys(labels).sort();
    return JSON.stringify(Object.fromEntries(sorted.map(k => [k, labels[k]])));
  }

  serialize(): Array<[Labels | undefined, number]> {
    return Array.from(this.values.entries()).map(([key, value]) => [
      key ? JSON.parse(key) : undefined,
      value
    ]);
  }
}

class MetricGauge implements Gauge {
  private values: Map<string, number> = new Map();

  set(value: number, labels?: Labels): void {
    const key = this.labelsToKey(labels);
    this.values.set(key, value);
  }

  inc(labels?: Labels, by: number = 1): void {
    const key = this.labelsToKey(labels);
    const current = this.values.get(key) ?? 0;
    this.values.set(key, current + by);
  }

  dec(labels?: Labels, by: number = 1): void {
    const key = this.labelsToKey(labels);
    const current = this.values.get(key) ?? 0;
    this.values.set(key, current - by);
  }

  get(labels?: Labels): number {
    const key = this.labelsToKey(labels);
    return this.values.get(key) ?? 0;
  }

  private labelsToKey(labels?: Labels): string {
    if (!labels || Object.keys(labels).length === 0) return '';
    const sorted = Object.keys(labels).sort();
    return JSON.stringify(Object.fromEntries(sorted.map(k => [k, labels[k]])));
  }

  serialize(): Array<[Labels | undefined, number]> {
    return Array.from(this.values.entries()).map(([key, value]) => [
      key ? JSON.parse(key) : undefined,
      value
    ]);
  }
}

class MetricHistogram implements Histogram {
  private observations: Map<string, number[]> = new Map();
  private buckets: number[];

  constructor(buckets?: number[]) {
    this.buckets = buckets ?? [25, 50, 100, 200, 400, 800, 1600, 3200];
  }

  observe(value: number, labels?: Labels): void {
    const key = this.labelsToKey(labels);
    const list = this.observations.get(key) ?? [];
    list.push(value);
    this.observations.set(key, list);
  }

  count(labels?: Labels): number {
    const key = this.labelsToKey(labels);
    return (this.observations.get(key) ?? []).length;
  }

  sum(labels?: Labels): number {
    const key = this.labelsToKey(labels);
    return (this.observations.get(key) ?? []).reduce((a, b) => a + b, 0);
  }

  private labelsToKey(labels?: Labels): string {
    if (!labels || Object.keys(labels).length === 0) return '';
    const sorted = Object.keys(labels).sort();
    return JSON.stringify(Object.fromEntries(sorted.map(k => [k, labels[k]])));
  }

  serialize(): Array<[Labels | undefined, number[]]> {
    return Array.from(this.observations.entries()).map(([key, value]) => [
      key ? JSON.parse(key) : undefined,
      value
    ]);
  }

  getBuckets(): number[] {
    return this.buckets;
  }
}

function formatLabels(labels?: Labels): string {
  if (!labels || Object.keys(labels).length === 0) return '';
  const sorted = Object.keys(labels).sort();
  const pairs = sorted.map(k => `${k}="${labels[k]}"`).join(',');
  return `{${pairs}}`;
}

function mergeLabels(baseLabels?: Labels, additional?: Labels): Labels {
  if (!baseLabels && !additional) return {};
  return { ...baseLabels, ...additional };
}

export class MetricsRegistry {
  private counters: Map<string, MetricCounter> = new Map();
  private gauges: Map<string, MetricGauge> = new Map();
  private histograms: Map<string, MetricHistogram> = new Map();
  private metrics: Map<string, { help: string; type: string; labelNames?: string[] }> = new Map();
  private maxSeriesPerMetric: number;
  private cardinalityRejected: Map<string, number> = new Map();

  constructor(opts?: { maxSeriesPerMetric?: number }) {
    this.maxSeriesPerMetric = opts?.maxSeriesPerMetric ?? 1000;
  }

  counter(name: string, help: string, labelNames?: string[]): Counter {
    if (this.counters.has(name)) {
      return this.counters.get(name)!;
    }
    if (this.metrics.has(name) && this.metrics.get(name)!.type !== 'counter') {
      throw new Error(`Metric ${name} already exists with different type`);
    }
    this.metrics.set(name, { help, type: 'counter', labelNames });
    this.counters.set(name, new MetricCounter());
    return this.counters.get(name)!;
  }

  gauge(name: string, help: string, labelNames?: string[]): Gauge {
    if (this.gauges.has(name)) {
      return this.gauges.get(name)!;
    }
    if (this.metrics.has(name) && this.metrics.get(name)!.type !== 'gauge') {
      throw new Error(`Metric ${name} already exists with different type`);
    }
    this.metrics.set(name, { help, type: 'gauge', labelNames });
    this.gauges.set(name, new MetricGauge());
    return this.gauges.get(name)!;
  }

  histogram(name: string, help: string, labelNames?: string[], buckets?: number[]): Histogram {
    if (this.histograms.has(name)) {
      return this.histograms.get(name)!;
    }
    if (this.metrics.has(name) && this.metrics.get(name)!.type !== 'histogram') {
      throw new Error(`Metric ${name} already exists with different type`);
    }
    this.metrics.set(name, { help, type: 'histogram', labelNames });
    this.histograms.set(name, new MetricHistogram(buckets));
    return this.histograms.get(name)!;
  }

  render(): string {
    const lines: string[] = [];

    for (const [name, counter] of this.counters) {
      const meta = this.metrics.get(name)!;
      lines.push(`# HELP ${name} ${meta.help}`);
      lines.push(`# TYPE ${name} counter`);
      for (const [labels, value] of counter.serialize()) {
        const labelStr = formatLabels(labels);
        lines.push(`${name}${labelStr} ${value}`);
      }
    }

    for (const [name, gauge] of this.gauges) {
      const meta = this.metrics.get(name)!;
      lines.push(`# HELP ${name} ${meta.help}`);
      lines.push(`# TYPE ${name} gauge`);
      for (const [labels, value] of gauge.serialize()) {
        const labelStr = formatLabels(labels);
        lines.push(`${name}${labelStr} ${value}`);
      }
    }

    for (const [name, hist] of this.histograms) {
      const meta = this.metrics.get(name)!;
      lines.push(`# HELP ${name} ${meta.help}`);
      lines.push(`# TYPE ${name} histogram`);
      for (const [labels, values] of hist.serialize()) {
        this.renderHistogramMetrics(lines, name, labels, values, hist.getBuckets());
      }
    }

    // Add cardinality rejection metrics
    if (this.cardinalityRejected.size > 0) {
      lines.push(`# HELP metrics_cardinality_rejected_total Cardinality rejections`);
      lines.push(`# TYPE metrics_cardinality_rejected_total counter`);
      for (const [metric, count] of this.cardinalityRejected) {
        lines.push(`metrics_cardinality_rejected_total{metric="${metric}"} ${count}`);
      }
    }

    return lines.join('\n');
  }

  private renderHistogramMetrics(
    lines: string[],
    name: string,
    labels: Labels | undefined,
    values: number[],
    buckets: number[]
  ): void {
    const sorted = values.sort((a, b) => a - b);

    for (const bucket of buckets) {
      const count = sorted.filter(v => v <= bucket).length;
      const mergedLabels = mergeLabels(labels, { le: bucket.toString() });
      const labelStr = formatLabels(mergedLabels);
      lines.push(`${name}_bucket${labelStr} ${count}`);
    }

    const infCount = sorted.length;
    const mergedLabels = mergeLabels(labels, { le: '+Inf' });
    const labelStr = formatLabels(mergedLabels);
    lines.push(`${name}_bucket${labelStr} ${infCount}`);

    const sum = sorted.reduce((a, b) => a + b, 0);
    const sumLabelStr = formatLabels(labels);
    lines.push(`${name}_sum${sumLabelStr} ${sum}`);
    lines.push(`${name}_count${sumLabelStr} ${sorted.length}`);
  }
}
