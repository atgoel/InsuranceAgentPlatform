import { ClientEvent, ClientTelemetry, fingerprintOf } from './client-telemetry';

function setup(opts: { now?: () => number; random?: () => number; maxPerMinute?: number } = {}) {
  const sent: ClientEvent[][] = [];
  const telemetry = new ClientTelemetry({ send: async (events) => void sent.push(events), ...opts });
  return { telemetry, sent, flat: () => sent.flat() };
}

describe('AC-M00-30 ClientTelemetry', () => {
  it('deduplicates errors by fingerprint, treating numbers as equal', async () => {
    const { telemetry, flat } = setup();
    telemetry.reportError(new Error('order 123 failed'));
    telemetry.reportError(new Error('order 456 failed'));
    await telemetry.flush();
    expect(flat()).toHaveLength(1);
    expect(fingerprintOf('Error: order 1 failed')).toBe(fingerprintOf('Error: order 99 failed'));
  });

  it('allows at most maxPerMinute errors in any rolling 60 s window', async () => {
    let t = 0;
    const { telemetry, flat } = setup({ now: () => t, maxPerMinute: 10 });
    for (let i = 0; i < 11; i++) telemetry.reportError(new Error(`distinct failure ${String.fromCharCode(97 + i)}`));
    await telemetry.flush();
    expect(flat()).toHaveLength(10);

    t = 60_001;
    telemetry.reportError(new Error('after the window'));
    await telemetry.flush();
    expect(flat()).toHaveLength(11);
  });

  it('samples vitals and sends them without a fingerprint (backend contract)', async () => {
    const values = [0.05, 0.5];
    const { telemetry, flat } = setup({ random: () => values.shift() ?? 1 });
    telemetry.reportVital('LCP', 2500);
    telemetry.reportVital('INP', 150);
    await telemetry.flush();
    expect(flat()).toEqual([{ kind: 'vital', name: 'LCP', value: 2500, release: undefined }]);
  });

  it('never reports query strings and truncates messages to 500 chars', async () => {
    const { telemetry, flat } = setup();
    telemetry.reportError(new Error('x'.repeat(900)), '/crm/leads?phone=9876543210');
    await telemetry.flush();
    const event = flat()[0] as Extract<ClientEvent, { kind: 'error' }>;
    expect(event.route).toBe('/crm/leads');
    expect(event.message?.length).toBe(500);
  });

  it('flushes in batches of at most 20 and swallows send failures', async () => {
    let calls = 0;
    const telemetry = new ClientTelemetry({ send: async (e) => { calls += 1; expect(e.length).toBeLessThanOrEqual(20); }, maxPerMinute: 100 });
    for (let i = 0; i < 45; i++) telemetry.reportError(new Error(`e-${'z'.repeat(i)}`));
    await telemetry.flush();
    expect(calls).toBe(3);

    const failing = new ClientTelemetry({ send: async () => { throw new Error('offline'); } });
    failing.reportError(new Error('boom'));
    await expect(failing.flush()).resolves.toBeUndefined();
  });
});
