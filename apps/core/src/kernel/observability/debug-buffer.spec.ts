import { DebugBuffer } from './debug-buffer';

describe('AC-M00-09 DebugBuffer', () => {
  it('starts empty', () => {
    const buf = new DebugBuffer();
    expect(buf.entries()).toEqual([]);
    expect(buf.dropped).toBe(0);
  });

  it('adds entries', () => {
    const buf = new DebugBuffer();
    buf.add({ t: 0, level: 'debug', event: 'test', msg: 'Testing' });

    expect(buf.entries()).toHaveLength(1);
    expect(buf.entries()[0].event).toBe('test');
  });

  it('respects max entries limit', () => {
    const buf = new DebugBuffer({ maxEntries: 5 });

    for (let i = 0; i < 10; i++) {
      buf.add({ t: i, level: 'debug', event: `event_${i}`, msg: `msg ${i}` });
    }

    expect(buf.entries().length).toBeLessThanOrEqual(5);
    expect(buf.dropped).toBeGreaterThan(0);
  });

  it('respects max bytes limit', () => {
    const buf = new DebugBuffer({ maxBytes: 200 });

    for (let i = 0; i < 50; i++) {
      buf.add({
        t: i,
        level: 'info',
        event: 'e',
        msg: 'This is a longer message to add bytes',
        ctx: { data: 'x'.repeat(50) },
      });
    }

    expect(buf.dropped).toBeGreaterThan(0);
  });

  it('defaults to 200 max entries', () => {
    const buf = new DebugBuffer();
    expect((buf as unknown as Record<string, unknown>).maxEntries).toBe(200);
  });

  it('defaults to 65536 max bytes', () => {
    const buf = new DebugBuffer();
    expect((buf as unknown as Record<string, unknown>).maxBytes).toBe(65536);
  });

  it('evicts oldest when full', () => {
    const buf = new DebugBuffer({ maxEntries: 3 });

    buf.add({ t: 0, level: 'debug', event: 'first', msg: '' });
    buf.add({ t: 1, level: 'debug', event: 'second', msg: '' });
    buf.add({ t: 2, level: 'debug', event: 'third', msg: '' });
    buf.add({ t: 3, level: 'debug', event: 'fourth', msg: '' });

    const entries = buf.entries();
    expect(entries.map((e) => e.event)).toEqual(['second', 'third', 'fourth']);
  });

  it('increments dropped counter on overflow', () => {
    const buf = new DebugBuffer({ maxEntries: 2 });

    buf.add({ t: 0, level: 'debug', event: 'e1', msg: '' });
    buf.add({ t: 1, level: 'debug', event: 'e2', msg: '' });
    expect(buf.dropped).toBe(0);

    buf.add({ t: 2, level: 'debug', event: 'e3', msg: '' });
    expect(buf.dropped).toBeGreaterThanOrEqual(1);

    buf.add({ t: 3, level: 'debug', event: 'e4', msg: '' });
    expect(buf.dropped).toBeGreaterThanOrEqual(2);
  });

  it('stores all entry types', () => {
    const buf = new DebugBuffer();

    buf.add({ t: 0, level: 'debug', event: 'debug_event', msg: 'Debug message' });
    buf.add({ t: 1, level: 'info', event: 'info_event', msg: 'Info message' });
    buf.add({ t: 2, level: 'warn', event: 'warn_event', msg: 'Warn message' });

    expect(buf.entries()).toHaveLength(3);
    expect(buf.entries()[0].level).toBe('debug');
    expect(buf.entries()[1].level).toBe('info');
    expect(buf.entries()[2].level).toBe('warn');
  });

  it('stores optional context', () => {
    const buf = new DebugBuffer();
    const ctx = { userId: 'usr_123', action: 'create' };

    buf.add({ t: 0, level: 'info', event: 'action', msg: 'User action', ctx });

    expect(buf.entries()[0].ctx).toEqual(ctx);
  });

  it('clear removes all entries', () => {
    const buf = new DebugBuffer();
    buf.add({ t: 0, level: 'debug', event: 'e1', msg: '' });
    buf.add({ t: 1, level: 'debug', event: 'e2', msg: '' });

    expect(buf.entries()).toHaveLength(2);

    buf.clear();

    expect(buf.entries()).toHaveLength(0);
    expect(buf.dropped).toBe(0);
  });

  it('tracks timing with t field', () => {
    const buf = new DebugBuffer();
    buf.add({ t: 0, level: 'debug', event: 'start', msg: '' });
    buf.add({ t: 100, level: 'debug', event: 'mid', msg: '' });
    buf.add({ t: 250, level: 'debug', event: 'end', msg: '' });

    const entries = buf.entries();
    expect(entries[0].t).toBe(0);
    expect(entries[1].t).toBe(100);
    expect(entries[2].t).toBe(250);
  });

  it('returns a snapshot that later adds do not mutate', () => {
    const buf = new DebugBuffer();
    buf.add({ t: 0, level: 'debug', event: 'e', msg: '' });

    const entries = buf.entries();
    buf.add({ t: 1, level: 'info', event: 'e2', msg: '' });
    expect(entries).toHaveLength(1);
  });

  it('approximates JSON bytes for size tracking', () => {
    const buf = new DebugBuffer({ maxBytes: 100 });

    // Add entries that should exceed ~100 bytes when serialized
    for (let i = 0; i < 20; i++) {
      buf.add({
        t: i,
        level: 'debug',
        event: 'event',
        msg: 'Message content here',
        ctx: { key: 'value', number: 123 },
      });
    }

    expect(buf.dropped).toBeGreaterThan(0);
  });
});
