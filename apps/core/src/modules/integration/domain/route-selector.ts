import { CapabilityManifest, Operation, RouteKind } from './capability-manifest';

type SkippedReason = 'not_pinned' | 'version_mismatch' | 'uncertified' | 'breaker_open'
  | 'capability_missing' | 'counterparty_mismatch';
interface SelectionInput {
  manifests: readonly CapabilityManifest[];
  line: 'LIFE' | 'HEALTH' | 'GENERAL';
  insurerId: string;
  operation: Operation;
  tenantPins: readonly { adapterId: string; version: string }[];
  breakerStates: readonly {
    adapterId: string;
    adapterVersion: string;
    operation: Operation;
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  }[];
  certifications: readonly { adapterId: string; adapterVersion: string; status: 'PASSED' | 'FAILED' }[];
}
interface Selection {
  route: RouteKind;
  adapterId: string;
  adapterVersion: string;
  reason: 'api_available' | 'file_available' | 'assisted_fallback';
  skipped: Array<{ adapterId: string; reason: SkippedReason }>;
}
type Candidate = { manifest: CapabilityManifest; route: 'API' | 'FILE' };

export class RouteSelector {
  select(input: SelectionInput): Selection {
    const skipped: Selection['skipped'] = [];
    const candidates: Candidate[] = [];
    for (const manifest of input.manifests) {
      if (manifest.adapterId === 'assisted') {
        continue;
      }
      const reason = this.skipReason(manifest, input);
      if (reason) {
        skipped.push({ adapterId: manifest.adapterId, reason });
        continue;
      }
      for (const route of ['API', 'FILE'] as const) {
        if (this.supports(manifest, input, route)) {
          candidates.push({ manifest, route });
        }
      }
    }
    candidates.sort((left, right) => {
      const preference = Number(left.route === 'FILE') - Number(right.route === 'FILE');
      return preference || left.manifest.adapterId.localeCompare(right.manifest.adapterId);
    });
    return this.result(candidates[0], skipped);
  }

  private result(selected: Candidate | undefined, skipped: Selection['skipped']): Selection {
    if (!selected) {
      return { route: 'ASSISTED', adapterId: 'assisted', adapterVersion: '1.0.0', reason: 'assisted_fallback', skipped };
    }
    return {
      route: selected.route,
      adapterId: selected.manifest.adapterId,
      adapterVersion: selected.manifest.adapterVersion,
      reason: selected.route === 'API' ? 'api_available' : 'file_available',
      skipped,
    };
  }

  private supports(manifest: CapabilityManifest, input: SelectionInput, route: RouteKind): boolean {
    return manifest.lines.some(line => line.line === input.line
      && line.operations.some(spec => spec.operation === input.operation && spec.route === route));
  }

  private skipReason(manifest: CapabilityManifest, input: SelectionInput): SkippedReason | undefined {
    if (manifest.counterparty.kind !== 'INSURER' || manifest.counterparty.insurerId !== input.insurerId) {
      return 'counterparty_mismatch';
    }
    const pin = input.tenantPins.find(pin => pin.adapterId === manifest.adapterId);
    if (!pin) {
      return 'not_pinned';
    }
    if (pin.version !== manifest.adapterVersion) {
      return 'version_mismatch';
    }
    const certified = input.certifications.some(item => item.adapterId === manifest.adapterId
      && item.adapterVersion === manifest.adapterVersion && item.status === 'PASSED');
    if (!certified) {
      return 'uncertified';
    }
    if (!this.supports(manifest, input, 'API') && !this.supports(manifest, input, 'FILE')) {
      return 'capability_missing';
    }
    const open = input.breakerStates.some(item => item.adapterId === manifest.adapterId
      && item.adapterVersion === manifest.adapterVersion && item.operation === input.operation && item.state === 'OPEN');
    return open ? 'breaker_open' : undefined;
  }
}
