import { StatusChip } from '../../../design-system';
import { useLabel } from '../../../lib/i18n/labels';

/** A role code shown as its localised name (never the raw code). */
export function RoleName({ role }: { role: string }) {
  return <>{useLabel('role', role)}</>;
}

export function RoleChip({ role }: { role: string }) {
  return (
    <StatusChip tone="neutral">
      <RoleName role={role} />
    </StatusChip>
  );
}

/** A record scope code shown as its localised name. */
export function ScopeName({ scope }: { scope: string }) {
  return <>{useLabel('recordScope', scope)}</>;
}
