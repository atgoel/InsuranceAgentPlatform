import { HeadSampler } from './head-sampler';

describe('AC-M00-16 HeadSampler', () => {
  describe('excluded routes', () => {
    it('excludes /health/live, /health/ready, /metrics by default', () => {
      const sampler = new HeadSampler();
      expect(sampler.decide('/health/live', 200)).toBe('exclude');
      expect(sampler.decide('/health/ready', 200)).toBe('exclude');
      expect(sampler.decide('/metrics', 200)).toBe('exclude');
    });

    it('can customize excluded routes', () => {
      const sampler = new HeadSampler({ excluded: ['/custom/exclude'] });
      expect(sampler.decide('/custom/exclude', 200)).toBe('exclude');
      expect(sampler.decide('/metrics', 200)).not.toBe('exclude');
    });
  });

  describe('error status handling', () => {
    it('always logs status >= 400', () => {
      const sampler = new HeadSampler();
      expect(sampler.decide('/api/test', 400)).toBe('log');
      expect(sampler.decide('/api/test', 404)).toBe('log');
      expect(sampler.decide('/api/test', 500)).toBe('log');
    });

    it('logs errors even at rate 0', () => {
      const sampler = new HeadSampler({ rates: { '/api/test': 0 }, random: () => 0 });
      expect(sampler.decide('/api/test', 400)).toBe('log');
    });
  });

  describe('rate-based sampling', () => {
    it('applies per-route sampling rates', () => {
      const sampler = new HeadSampler({ rates: { '/api/list': 0.1 }, random: () => 0.05 });
      expect(sampler.decide('/api/list', 200)).toBe('log');

      const sampler2 = new HeadSampler({ rates: { '/api/list': 0.1 }, random: () => 0.15 });
      expect(sampler2.decide('/api/list', 200)).toBe('skip');
    });

    it('uses rate 1.0 by default (log all)', () => {
      const sampler = new HeadSampler({ random: () => 0.99 });
      expect(sampler.decide('/api/unknown', 200)).toBe('log');
    });

    it('respects random() < rate decision', () => {
      const sampler1 = new HeadSampler({ rates: { '/api/list': 0.5 }, random: () => 0.3 });
      expect(sampler1.decide('/api/list', 200)).toBe('log');

      const sampler2 = new HeadSampler({ rates: { '/api/list': 0.5 }, random: () => 0.7 });
      expect(sampler2.decide('/api/list', 200)).toBe('skip');
    });

    it('rate 0 skips all success responses', () => {
      const sampler = new HeadSampler({ rates: { '/api/test': 0 } });
      expect(sampler.decide('/api/test', 200)).toBe('skip');
    });

    it('rate 1 logs all success responses', () => {
      const sampler = new HeadSampler({ rates: { '/api/test': 1 }, random: () => 0.999 });
      expect(sampler.decide('/api/test', 200)).toBe('log');
    });
  });
});
