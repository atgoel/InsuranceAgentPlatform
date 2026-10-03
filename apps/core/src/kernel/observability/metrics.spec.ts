import { MetricsRegistry } from './metrics';

describe('AC-M00-14 MetricsRegistry', () => {
  it('creates counter', () => {
    const reg = new MetricsRegistry();
    const counter = reg.counter('test_total', 'Test counter');
    expect(counter).toBeDefined();
  });

  it('creates gauge', () => {
    const reg = new MetricsRegistry();
    const gauge = reg.gauge('test_gauge', 'Test gauge');
    expect(gauge).toBeDefined();
  });

  it('creates histogram', () => {
    const reg = new MetricsRegistry();
    const hist = reg.histogram('test_hist', 'Test histogram');
    expect(hist).toBeDefined();
  });

  describe('counter operations', () => {
    it('increments counter', () => {
      const reg = new MetricsRegistry();
      const counter = reg.counter('test', 'test');
      counter.inc();
      expect(counter.get()).toBe(1);
    });

    it('increments by amount', () => {
      const reg = new MetricsRegistry();
      const counter = reg.counter('test', 'test');
      counter.inc(undefined, 5);
      expect(counter.get()).toBe(5);
    });
  });

  describe('gauge operations', () => {
    it('sets gauge value', () => {
      const reg = new MetricsRegistry();
      const gauge = reg.gauge('test', 'test');
      gauge.set(42);
      expect(gauge.get()).toBe(42);
    });

    it('increments gauge', () => {
      const reg = new MetricsRegistry();
      const gauge = reg.gauge('test', 'test');
      gauge.inc(undefined, 10);
      expect(gauge.get()).toBe(10);
    });

    it('decrements gauge', () => {
      const reg = new MetricsRegistry();
      const gauge = reg.gauge('test', 'test');
      gauge.set(20);
      gauge.dec(undefined, 5);
      expect(gauge.get()).toBe(15);
    });
  });

  describe('cardinality cap', () => {
    it('enforces maxSeriesPerMetric limit', () => {
      const reg = new MetricsRegistry({ maxSeriesPerMetric: 2 });
      const counter = reg.counter('test', 'test', ['label']);
      counter.inc({ label: 'a' });
      counter.inc({ label: 'b' });
      counter.inc({ label: 'c' }); // Should be rejected

      // Verify cardinality counter incremented
      const card = reg.counter('metrics_cardinality_rejected_total', '');
      expect(card.get()).toBeGreaterThan(0);
    });

    it('rejects unknown label names', () => {
      const reg = new MetricsRegistry();
      const counter = reg.counter('test', 'test', ['label1']);

      expect(() => {
        counter.inc({ unknown: 'value' });
      }).toThrow();
    });
  });

  describe('Prometheus rendering', () => {
    it('renders counter with # HELP and # TYPE', () => {
      const reg = new MetricsRegistry();
      const counter = reg.counter('test_total', 'A test counter');
      counter.inc();
      const text = reg.render();

      expect(text).toContain('# HELP test_total A test counter');
      expect(text).toContain('# TYPE test_total counter');
      expect(text).toContain('test_total 1');
    });

    it('renders counter with labels, sorted', () => {
      const reg = new MetricsRegistry();
      const counter = reg.counter('http_requests_total', 'Requests', ['method', 'status']);
      counter.inc({ method: 'POST', status: '200' });
      counter.inc({ method: 'GET', status: '404' });

      const text = reg.render();
      // Labels should be sorted: method before status
      expect(text).toContain('http_requests_total{method="GET",status="404"} 1');
      expect(text).toContain('http_requests_total{method="POST",status="200"} 1');
    });

    it('renders histogram with _bucket{le=...}, _sum, _count', () => {
      const reg = new MetricsRegistry();
      const hist = reg.histogram('response_time', 'Response time');
      hist.observe(50);
      hist.observe(150);
      hist.observe(300);

      const text = reg.render();
      expect(text).toContain('response_time_bucket{le="25"}');
      expect(text).toContain('response_time_bucket{le="+Inf"}');
      expect(text).toContain('response_time_sum');
      expect(text).toContain('response_time_count');
    });

    it('renders Prometheus text format version 0.0.4', () => {
      const reg = new MetricsRegistry();
      reg.counter('test', 'test').inc();
      const text = reg.render();

      expect(text).toContain('# HELP');
      expect(text).toContain('# TYPE');
    });
  });

  describe('metric instance reuse', () => {
    it('same name returns same instance', () => {
      const reg = new MetricsRegistry();
      const c1 = reg.counter('test', 'test');
      const c2 = reg.counter('test', 'test');
      expect(c1).toBe(c2);
    });

    it('different type same name throws error', () => {
      const reg = new MetricsRegistry();
      reg.counter('test', 'test');

      expect(() => {
        reg.gauge('test', 'test');
      }).toThrow();
    });
  });
});
