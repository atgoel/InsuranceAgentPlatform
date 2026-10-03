import { describe, it, expect } from 'vitest';
import { MemoryStorage } from '../../../test/render';
import { isRetryable, LogQueue } from './log-queue';

describe('AC-M04-29 LogQueue (offline Log actions)', () => {
  const refs = () => {
    let n = 0;
    return () => `ref-${(n += 1)}`;
  };

  it('AC-M04-29 assigns a clientRef once per action and stores ids and enums only', () => {
    const storage = new MemoryStorage();
    const queue = new LogQueue(storage, refs());
    queue.add({ leadId: 'lead_1', kind: 'CALL', outcome: 'NO_ANSWER', occurredAt: '2026-10-03T09:00:00.000Z' });
    queue.add({ leadId: 'lead_2', kind: 'NOTE', occurredAt: '2026-10-03T09:05:00.000Z' });
    expect(storage.snapshot()).toEqual({
      'crm:log-queue:v1': [
        { leadId: 'lead_1', kind: 'CALL', outcome: 'NO_ANSWER', occurredAt: '2026-10-03T09:00:00.000Z', clientRef: 'ref-1' },
        { leadId: 'lead_2', kind: 'NOTE', occurredAt: '2026-10-03T09:05:00.000Z', clientRef: 'ref-2' },
      ],
    });
  });

  it('AC-M04-29 the clientRef survives a reload (a new queue over the same storage)', () => {
    const storage = new MemoryStorage();
    new LogQueue(storage, refs()).add({ leadId: 'lead_1', kind: 'CALL', outcome: 'CONNECTED', occurredAt: '2026-10-03T09:00:00.000Z' });
    expect(new LogQueue(storage, () => 'different').all().map((q) => q.clientRef)).toEqual(['ref-1']);
  });

  it('AC-M04-29 removing the last entry clears the storage key', () => {
    const storage = new MemoryStorage();
    const queue = new LogQueue(storage, refs());
    queue.add({ leadId: 'lead_1', kind: 'NOTE', occurredAt: '2026-10-03T09:00:00.000Z' });
    queue.add({ leadId: 'lead_2', kind: 'NOTE', occurredAt: '2026-10-03T09:00:00.000Z' });
    queue.remove('ref-1');
    expect(queue.all().map((q) => q.clientRef)).toEqual(['ref-2']);
    queue.remove('ref-2');
    expect(storage.length).toBe(0);
  });

  it('AC-M04-29 corrupt or foreign entries in storage are ignored, never thrown', () => {
    const storage = new MemoryStorage();
    storage.setItem('crm:log-queue:v1', JSON.stringify([{ clientRef: 'ok', leadId: 'lead_1', kind: 'CALL', occurredAt: 'x' }, { clientRef: 'bad', leadId: 'lead_1', kind: 'DELETE_ALL', occurredAt: 'x' }, 42]));
    expect(new LogQueue(storage).all().map((q) => q.clientRef)).toEqual(['ok']);
    storage.setItem('crm:log-queue:v1', '{not json');
    expect(new LogQueue(storage).all()).toEqual([]);
  });

  it.each([[0, true], [408, true], [429, true], [500, true], [503, true], [400, false], [403, false], [404, false], [422, false]])(
    'AC-M04-29 status %i is retryable: %s', (status, expected) => {
      expect(isRetryable(status)).toBe(expected);
    },
  );
});
