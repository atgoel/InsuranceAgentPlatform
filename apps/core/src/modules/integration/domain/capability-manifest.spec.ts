import { CapabilityManifest, ManifestValidator, OperationSpec } from './capability-manifest';

function manifest(spec: Partial<OperationSpec> = {}): CapabilityManifest {
  return {
    adapterId: 'insurer-api',
    adapterVersion: '1.0.0',
    counterparty: { kind: 'INSURER', insurerId: 'ins_1', name: 'Sandbox insurer' },
    auth: 'API_KEY',
    lines: [{ line: 'LIFE', operations: [{ operation: 'QUOTE', route: 'API', mode: 'SYNC', timeoutMs: 1000,
      schemaVersions: ['v1'], ...spec } as OperationSpec] }],
  };
}

describe('AC-M08-01 capability validation', () => {
  const validator = new ManifestValidator();

  it.each(['1.0.0', '0.0.1', '2.10.20-alpha.1+build.4'])('AC-M08-01 accepts valid semver %s', version => {
    expect(validator.validate({ ...manifest(), adapterVersion: version })).toEqual([]);
  });

  it.each(['1', '1.0', 'v1.0.0', '01.0.0', '1.0.0-01', '1.0.0-'])('AC-M08-01 rejects invalid semver %s', version => {
    expect(validator.validate({ ...manifest(), adapterVersion: version })).toEqual(['adapterVersion must be semver']);
  });

  it.each([0, -1, 1.5, 30_001, NaN])('AC-M08-01 rejects timeout %s', timeoutMs => {
    expect(validator.validate(manifest({ timeoutMs }))).toEqual(['timeoutMs must be an integer in 1..30000']);
  });

  it.each([1, 30_000])('AC-M08-01 accepts timeout boundary %s', timeoutMs => {
    expect(validator.validate(manifest({ timeoutMs }))).toEqual([]);
  });

  it('AC-M08-01 assisted is asynchronous with no timeout or credentials', () => {
    const assisted = { ...manifest({ route: 'ASSISTED', mode: 'ASYNC', timeoutMs: undefined }), auth: 'NONE' as const };
    expect(validator.validate(assisted)).toEqual([]);
    expect(validator.validate({ ...assisted, auth: 'API_KEY' })).toEqual(['assisted requires ASYNC, auth NONE and no timeout']);
    const wrong = structuredClone(assisted);
    Object.assign(wrong.lines[0].operations[0], { mode: 'SYNC', timeoutMs: 1 });
    expect(validator.validate(wrong)).toEqual(['assisted requires ASYNC, auth NONE and no timeout']);
  });

  it('AC-M08-01 requires v1 and rejects duplicate capabilities across repeated line blocks', () => {
    expect(validator.validate(manifest({ schemaVersions: ['v2'] }))).toEqual(['operation must support v1']);
    const value = manifest();
    value.lines.push(structuredClone(value.lines[0]));
    expect(validator.validate(value)).toEqual(['operation must be unique per line and route']);
  });

  it.each([0, -1, 0.5, Infinity])('AC-M08-01 rejects nonpositive or noninteger rate limit %s', rateLimitPerMinute => {
    expect(validator.validate(manifest({ rateLimitPerMinute }))).toEqual(['rateLimitPerMinute must be a positive integer']);
  });

  it('AC-M08-01 accepts a positive integer rate limit', () => {
    expect(validator.validate(manifest({ rateLimitPerMinute: 60 }))).toEqual([]);
  });

  it('AC-M08-01 rejects an invalid runtime automated mode', () => {
    const value = manifest();
    Object.assign(value.lines[0].operations[0], { mode: 'BOGUS' });
    expect(validator.validate(value)).toEqual(['automated operation requires SYNC or ASYNC']);
  });

  it.each(['POLICY_DOCUMENT', 'COMMISSION_STATEMENT', 'RENEWAL_NOTICE'] as const)(
    'AC-M08-01 rejects reserved automated capability %s until its SPI exists', operation => {
      expect(validator.validate(manifest({ operation }))).toEqual(['operation is reserved for a future SPI']);
    },
  );
});
