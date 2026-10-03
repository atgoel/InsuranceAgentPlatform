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
    return JSON.stringify(labels);
  }

  serialize(): Array<[string, number]> {
    return Array.from(this.values.entries());
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
    return JSON.stringify(labels);
  }

  serialize(): Array<[string, number]> {
    return Array.from(this.values.entries());
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
    return JSON.stringify(labels);
  }

  serialize(): Array<[string, number[]]> {
    return Array.from(this.observations.entries());
  }
}

export class MetricsRegistry {
  private counters: Map<string, MetricCounter> = new Map();
  private gauges: Map<string, MetricGauge> = new Map();
  private histograms: Map<string, MetricHistogram> = new Map();
  private metrics: Map<string, { help: string; type: string; labelNames?: string[] }> = new Map();
  private maxSeriesPerMetric: number;

  constructor(opts?: { maxSeriesPerMetric?: number }) {
    this.maxSeriesPerMetric = opts?.maxSeriesPerMetric ?? 1000;
  }

  counter(name: string, help: string, labelNames?: string[]): Counter {
    if (!this.counters.has(name)) {
      this.metrics.set(name, { help, type: 'counter', labelNames });
      this.counters.set(name, new MetricCounter());
    }
    return this.counters.get(name)!;
  }

  gauge(name: string, help: string, labelNames?: string[]): Gauge {
    if (!this.gauges.has(name)) {
      this.metrics.set(name, { help, type: 'gauge', labelNames });
      this.gauges.set(name, new MetricGauge());
    }
    return this.gauges.get(name)!;
  }

  histogram(
    name: string,
    help: string,
    labelNames?: string[],
    buckets?: number[]
  ): Histogram {
    if (!this.histograms.has(name)) {
      this.metrics.set(name, { help, type: 'histogram', labelNames });
      this.histograms.set(name, new MetricHistogram(buckets));
    }
    return this.histograms.get(name)!;
  }

  render(): string {
    const lines: string[] = [];

    for (const [name, counter] of this.counters) {
      this.renderMetricLines(lines, name, 'counter', counter.serialize());
    }

    for (const [name, gauge] of this.gauges) {
      this.renderMetricLines(lines, name, 'gauge', gauge.serialize());
    }

    for (const [name, hist] of this.histograms) {
      const meta = this.metrics.get(name)!;
      lines.push(`# HELP ${name} ${meta.help}`);
      lines.push(`# TYPE ${name} histogram`);
      for (const [labels, values] of hist.serialize() as Array<[string, number[]]>) {
        const baseLabelStr = labels ? labels.slice(0, -1) : '';
        const count = values.length;
        const sum = values.reduce((a, b) => a + b, 0);
        this.renderHistogramLines(lines, name, baseLabelStr, { count, sum });
      }
    }

    return lines.join('\n');
  }

  private renderMetricLines(
    lines: string[],
    name: string,
    type: string,
    serialized: Array<[string, number]>
  ): void {
    const meta = this.metrics.get(name)!;
    lines.push(`# HELP ${name} ${meta.help}`);
    lines.push(`# TYPE ${name} ${type}`);
    for (const [labels, value] of serialized) {
      const labelStr = labels ? `{${labels}}` : '';
      lines.push(`${name}${labelStr} ${value}`);
    }
  }

  private renderHistogramLines(
    lines: string[],
    name: string,
    baseLabelStr: string,
    counts: { count: number; sum: number }
  ): void {
    if (baseLabelStr) {
      lines.push(`${name}_count${baseLabelStr}} ${counts.count}`);
      lines.push(`${name}_sum${baseLabelStr}} ${counts.sum}`);
    } else {
      lines.push(`${name}_count ${counts.count}`);
      lines.push(`${name}_sum ${counts.sum}`);
    }
  }
}
