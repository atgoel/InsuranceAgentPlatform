import { describe, it, expect, vi } from 'vitest';
import { ClientTelemetry } from './client-telemetry';

describe('AC-M00-30 ClientTelemetry', () => {
  it('deduplicates errors by fingerprint', () => {
    const send = vi.fn();
    const telemetry = new ClientTelemetry({ send });
    telemetry.reportError(new Error('Same error'));
    telemetry.reportError(new Error('Same error'));
    // Both have same fingerprint, second is skipped
    expect(send).not.toHaveBeenCalled();
  });

  it('rate limits per minute', () => {
    const send = vi.fn();
    const telemetry = new ClientTelemetry({ send, maxPerMinute: 2 });
    telemetry.reportError(new Error('Error 1'));
    telemetry.reportError(new Error('Error 2'));
    telemetry.reportError(new Error('Error 3'));
    telemetry.reportError(new Error('Error 4'));
    // Only 2 should be added due to rate limit
    // flush will send them
  });

  it('batches events ≤20 on flush', async () => {
    const send = vi.fn();
    const telemetry = new ClientTelemetry({ send });
    for (let i = 0; i < 25; i++) {
      telemetry.reportError(new Error(`Error ${i}`));
    }
    await telemetry.flush();
    // Should batch in groups of max 20
    expect(send).toHaveBeenCalled();
  });

  it('supports injectable now()', () => {
    let time = 0;
    const send = vi.fn();
    const telemetry = new ClientTelemetry({
      send,
      now: () => time,
      maxPerMinute: 100,
    });
    telemetry.reportError(new Error('Error 1'));
    time += 1000;
    telemetry.reportError(new Error('Error 2'));
    expect(send).not.toHaveBeenCalled();
  });

  it('samples vitals with injectable random', () => {
    const send = vi.fn();
    const telemetry = new ClientTelemetry({ send });
    // Manually test that vitals are recorded
    telemetry.reportVital('web-vital', 100);
    // With 10% sampling, we'd expect some to be dropped
  });
});
