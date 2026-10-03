import { MemoryLogSink, LogRecord } from './log-sink';

describe('AC-M00-09 Log Sink (MemoryLogSink)', () => {
  it('stores written records', () => {
    const sink = new MemoryLogSink();
    const record: LogRecord = { ts: '2026-01-01T00:00:00Z', level: 'info', event: 'test', msg: 'Test message' };
    sink.write(record);
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toBe(record);
  });

  it('filters by event', () => {
    const sink = new MemoryLogSink();
    sink.write({ ts: '1', level: 'info', event: 'app.start', msg: 'Started' });
    sink.write({ ts: '2', level: 'info', event: 'request.completed', msg: 'Request' });
    sink.write({ ts: '3', level: 'info', event: 'app.start', msg: 'Started again' });

    const starts = sink.byEvent('app.start');
    expect(starts).toHaveLength(2);
  });

  it('clears all records', () => {
    const sink = new MemoryLogSink();
    sink.write({ ts: '1', level: 'info', event: 'test', msg: 'msg' });
    sink.clear();
    expect(sink.records).toHaveLength(0);
  });
});
