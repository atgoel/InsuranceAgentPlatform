import { KpiRow, KpiTile } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { MemberView } from '../api';

/** The four tiles of the UsersRoles artboard, computed from the members the caller may see. */
export function UsersKpis({ members }: { members: MemberView[] }) {
  const { t } = useT();
  const active = members.filter((m) => m.status === 'active');
  const privileged = active.filter((m) => m.mfaRequired);
  return (
    <KpiRow>
      <KpiTile label={t('distribution.users.kpi_active')} value={active.length} />
      <KpiTile label={t('distribution.users.kpi_privileged')} value={privileged.length} caption={t('distribution.users.kpi_privileged_caption')} />
      <KpiTile
        label={t('distribution.users.kpi_invited')}
        value={members.filter((m) => m.status === 'invited').length}
        tone="warn"
      />
      <KpiTile label={t('distribution.users.kpi_deactivated')} value={members.filter((m) => m.status === 'suspended').length} />
    </KpiRow>
  );
}
