import { useLabel } from '../../lib/i18n/labels';

export function RoleName({ role }: { role: string }) {
  return <>{useLabel('role', role)}</>;
}
