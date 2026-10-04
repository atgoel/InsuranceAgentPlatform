import { ValidationError, DependencyUnavailableError } from '../../../kernel/errors/domain-errors';
import { ManifestValidator } from '../domain/capability-manifest';
import { AdapterRegistry, CredentialVault, InsurerAdapter } from '../application/ports';
export class RegisteredAdapters implements AdapterRegistry {
  constructor(private readonly adapters: InsurerAdapter[]) {
    const validator = new ManifestValidator();
    for (const adapter of adapters) {
      if (validator.validate(adapter.manifest()).length > 0 || !this.methodsPresent(adapter)) {
        throw new ValidationError('validation_failed', 'Invalid integration adapter manifest');
      }
    }
    const keys = adapters.map((adapter) => `${adapter.manifest().adapterId}:${adapter.manifest().adapterVersion}`);
    if (new Set(keys).size !== keys.length)
      throw new ValidationError('validation_failed', 'Duplicate integration adapter version');
  }
  all(): InsurerAdapter[] {
    return [...this.adapters];
  }
  get(adapterId: string, version?: string): InsurerAdapter | undefined {
    const matches = this.adapters.filter((adapter) => adapter.manifest().adapterId === adapterId
      && (version === undefined || adapter.manifest().adapterVersion === version));
    return matches.length === 1 ? matches[0] : undefined;
  }
  private methodsPresent(adapter: InsurerAdapter): boolean {
    if (typeof adapter.probe !== 'function') return false;
    const methods = {
      QUOTE: adapter.quote,
      SUBMIT_PROPOSAL: adapter.submitProposal,
      GET_STATUS: adapter.getStatus,
      PAYMENT_LINK: adapter.paymentLink,
      POLICY_DOCUMENT: undefined,
      COMMISSION_STATEMENT: undefined,
      RENEWAL_NOTICE: undefined,
    };
    return adapter.manifest().lines.every((line) => line.operations.every((operation) => typeof methods[operation.operation] === 'function'));
  }
}
export class UnboundCredentialVault implements CredentialVault {
  async resolve(_tenantId: string, _adapterId: string): Promise<Record<string, string>> {
    throw new DependencyUnavailableError('integration_credentials');
  }
}
