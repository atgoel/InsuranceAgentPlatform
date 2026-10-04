export type Operation = 'QUOTE' | 'SUBMIT_PROPOSAL' | 'GET_STATUS' | 'PAYMENT_LINK'
  | 'POLICY_DOCUMENT' | 'COMMISSION_STATEMENT' | 'RENEWAL_NOTICE';
export type RouteKind = 'API' | 'FILE' | 'ASSISTED';
export type OperationSpec = {
  operation: Operation;
  schemaVersions: string[];
  rateLimitPerMinute?: number;
} & (
  | { route: 'API' | 'FILE'; mode: 'SYNC' | 'ASYNC'; timeoutMs: number }
  | { route: 'ASSISTED'; mode: 'ASYNC'; timeoutMs?: never }
);
export interface CapabilityManifest {
  adapterId: string;
  adapterVersion: string;
  counterparty: { kind: 'INSURER' | 'VENDOR'; insurerId?: string; name: string };
  lines: Array<{ line: 'LIFE' | 'HEALTH' | 'GENERAL'; operations: OperationSpec[] }>;
  auth: 'API_KEY' | 'OAUTH2_CLIENT' | 'MTLS' | 'NONE';
  sandboxUrl?: string;
  slaP95Ms?: number;
}

const callable = new Set<Operation>(['QUOTE', 'SUBMIT_PROPOSAL', 'GET_STATUS', 'PAYMENT_LINK']);
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export class ManifestValidator {
  validate(manifest: CapabilityManifest): string[] {
    const errors: string[] = [];
    const version = semver.exec(manifest.adapterVersion);
    if (!version || this.invalidPrerelease(version[4])) {
      errors.push('adapterVersion must be semver');
    }
    const seen = new Set<string>();
    for (const line of manifest.lines) {
      for (const operation of line.operations) {
        const key = `${line.line}:${operation.operation}:${operation.route}`;
        if (seen.has(key)) {
          errors.push('operation must be unique per line and route');
        }
        seen.add(key);
        errors.push(...this.operationErrors(operation, manifest.auth));
      }
    }
    return errors;
  }

  private invalidPrerelease(prerelease: string | undefined): boolean {
    return prerelease?.split('.').some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0')) ?? false;
  }

  private operationErrors(operation: OperationSpec, auth: CapabilityManifest['auth']): string[] {
    const errors: string[] = [];
    if (!operation.schemaVersions.includes('v1')) {
      errors.push('operation must support v1');
    }
    if (operation.rateLimitPerMinute !== undefined && !this.positiveInteger(operation.rateLimitPerMinute)) {
      errors.push('rateLimitPerMinute must be a positive integer');
    }
    if (operation.route === 'ASSISTED') {
      return [...errors, ...this.assistedErrors(operation, auth)];
    }
    return [...errors, ...this.automatedErrors(operation)];
  }

  private assistedErrors(operation: OperationSpec, auth: CapabilityManifest['auth']): string[] {
    if (operation.timeoutMs !== undefined || operation.mode !== 'ASYNC' || auth !== 'NONE') {
      return ['assisted requires ASYNC, auth NONE and no timeout'];
    }
    return [];
  }

  private automatedErrors(operation: Exclude<OperationSpec, { route: 'ASSISTED' }>): string[] {
    const errors: string[] = [];
    if (operation.mode !== 'SYNC' && operation.mode !== 'ASYNC') {
      errors.push('automated operation requires SYNC or ASYNC');
    }
    if (!this.positiveInteger(operation.timeoutMs) || operation.timeoutMs > 30_000) {
      errors.push('timeoutMs must be an integer in 1..30000');
    }
    if (!callable.has(operation.operation)) {
      errors.push('operation is reserved for a future SPI');
    }
    return errors;
  }

  private positiveInteger(value: number): boolean {
    return Number.isInteger(value) && value > 0;
  }
}
