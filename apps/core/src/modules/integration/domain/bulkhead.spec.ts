import { Bulkhead } from './bulkhead';

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('AC-M08-03 bounded bulkhead', () => {
  it('AC-M08-03 caps concurrency, bounds the FIFO queue and reserves released slots', async () => {
    const bulkhead = new Bulkhead(1, 1);
    const first = deferred<string>();
    const second = deferred<string>();
    const calls: string[] = [];
    const running = bulkhead.run(() => {
      calls.push('first');
      return first.promise;
    });
    const queued = bulkhead.run(() => {
      calls.push('second');
      return second.promise;
    });
    await expect(bulkhead.run(async () => 'overflow')).rejects.toMatchObject({
      code: 'dependency_unavailable',
      details: { dependency: 'bulkhead_full' },
    });
    expect(calls).toEqual(['first']);
    first.resolve('one');
    await expect(running).resolves.toBe('one');
    expect(calls).toEqual(['first', 'second']);
    second.resolve('two');
    await expect(queued).resolves.toBe('two');
    await expect(bulkhead.run(async () => 'three')).resolves.toBe('three');
  });

  it('AC-M08-03 holds a slot until the real promise settles and releases on rejection', async () => {
    const bulkhead = new Bulkhead(1, 0);
    const first = deferred<string>();
    const work = bulkhead.run(() => first.promise);
    const rejection = expect(work).rejects.toThrow('failed');
    await expect(bulkhead.run(async () => 'too soon')).rejects.toMatchObject({ httpStatus: 503 });
    first.reject(new Error('failed'));
    await rejection;
    await expect(bulkhead.run(async () => 'recovered')).resolves.toBe('recovered');
  });

  it('AC-M08-03 releases a slot after a synchronous adapter throw', async () => {
    const bulkhead = new Bulkhead(1, 0);
    await expect(bulkhead.run(() => {
      throw new Error('sync');
    })).rejects.toThrow('sync');
    await expect(bulkhead.run(async () => 42)).resolves.toBe(42);
  });
});
