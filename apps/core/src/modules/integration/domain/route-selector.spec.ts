import { CapabilityManifest, RouteKind } from './capability-manifest';
import { RouteSelector } from './route-selector';

function manifest(adapterId: string, route: Exclude<RouteKind, 'ASSISTED'> = 'API'): CapabilityManifest {
  return {
    adapterId,
    adapterVersion: '1.0.0',
    counterparty: { kind: 'INSURER', insurerId: 'ins_1', name: 'Insurer' },
    auth: 'API_KEY',
    lines: [{ line: 'LIFE', operations: [{ operation: 'QUOTE', route, mode: 'SYNC', timeoutMs: 1000, schemaVersions: ['v1'] }] }],
  };
}

function input(manifests: CapabilityManifest[]) {
  return {
    manifests,
    line: 'LIFE' as const,
    insurerId: 'ins_1',
    operation: 'QUOTE' as const,
    tenantPins: manifests.map(value => ({ adapterId: value.adapterId, version: value.adapterVersion })),
    certifications: manifests.map(value => ({ adapterId: value.adapterId, adapterVersion: value.adapterVersion, status: 'PASSED' as const })),
    breakerStates: [],
  };
}

describe('AC-M08-01 route selection', () => {
  const selector = new RouteSelector();

  it('AC-M08-01 prefers API over FILE and uses adapterId for stable ties', () => {
    expect(selector.select(input([manifest('a-file', 'FILE'), manifest('z-api'), manifest('b-api')]))).toEqual({
      route: 'API', adapterId: 'b-api', adapterVersion: '1.0.0', reason: 'api_available', skipped: [],
    });
    expect(selector.select(input([manifest('a-file', 'FILE')]))).toMatchObject({ route: 'FILE', reason: 'file_available' });
  });

  it('AC-M08-01 skips OPEN breakers but permits HALF_OPEN candidates', () => {
    const value = input([manifest('api'), manifest('file', 'FILE')]);
    const open = { adapterId: 'api', adapterVersion: '1.0.0', operation: 'QUOTE' as const, state: 'OPEN' as const };
    expect(selector.select({ ...value, breakerStates: [open] })).toMatchObject({
      adapterId: 'file', skipped: [{ adapterId: 'api', reason: 'breaker_open' }],
    });
    expect(selector.select({ ...value, breakerStates: [{ ...open, state: 'HALF_OPEN' }] })).toMatchObject({ adapterId: 'api' });
  });

  it('AC-M08-01 requires the exact pinned version and certification of that version', () => {
    const value = input([manifest('api')]);
    expect(selector.select({ ...value, tenantPins: [] })).toMatchObject({
      route: 'ASSISTED', skipped: [{ adapterId: 'api', reason: 'not_pinned' }],
    });
    expect(selector.select({ ...value, tenantPins: [{ adapterId: 'api', version: '2.0.0' }] })).toMatchObject({
      route: 'ASSISTED', skipped: [{ adapterId: 'api', reason: 'version_mismatch' }],
    });
    expect(selector.select({ ...value, certifications: [{ adapterId: 'api', adapterVersion: '2.0.0', status: 'PASSED' }] }))
      .toMatchObject({ route: 'ASSISTED', skipped: [{ adapterId: 'api', reason: 'uncertified' }] });
    expect(selector.select({ ...value, certifications: [{ adapterId: 'api', adapterVersion: '1.0.0', status: 'FAILED' }] }))
      .toMatchObject({ route: 'ASSISTED', skipped: [{ adapterId: 'api', reason: 'uncertified' }] });
  });

  it('AC-M08-01 prevents routing an insurer call to another counterparty or unsupported line', () => {
    const value = input([manifest('api')]);
    expect(selector.select({ ...value, insurerId: 'ins_2' })).toMatchObject({
      route: 'ASSISTED', skipped: [{ adapterId: 'api', reason: 'counterparty_mismatch' }],
    });
    expect(selector.select({ ...value, line: 'GENERAL' })).toMatchObject({
      route: 'ASSISTED', skipped: [{ adapterId: 'api', reason: 'capability_missing' }],
    });
    expect(selector.select({ ...value, operation: 'GET_STATUS' })).toMatchObject({
      route: 'ASSISTED', skipped: [{ adapterId: 'api', reason: 'capability_missing' }],
    });
  });

  it('AC-M08-01 defaults to assisted without a pin, certification or credentials', () => {
    expect(selector.select(input([]))).toEqual({
      route: 'ASSISTED', adapterId: 'assisted', adapterVersion: '1.0.0', reason: 'assisted_fallback', skipped: [],
    });
  });
});
