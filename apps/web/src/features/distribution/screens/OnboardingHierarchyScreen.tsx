import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../../lib/api';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageContainer,
  PageHeader,
  PermissionDenied,
} from '../../../design-system';
import { usePermissions } from '../../../lib/auth/me';
import { useT } from '../../../lib/i18n';
import { useMembers } from '../hooks/useMembers';
import { useOnboarding } from '../hooks/useOnboarding';
import { flattenUnits, unitSubtreeIds } from '../hooks/useOrgUnits';
import { createDistributionApi } from '../api';
import { InviteMemberSheet, MemberDetailPanel, OnboardingPipeline, OrgTreePanel, StatsKPIs } from '../components';
import '../styles/OnboardingHierarchyScreen.css';

const INVITE_ROLES = [{ role: 'SALESPERSON' }];
const LICENCE_WINDOW_DAYS = 60;

export function OnboardingHierarchyScreen() {
  const api = useApi();
  const { t } = useT();
  const { can } = usePermissions();
  const distributionApi = useMemo(() => createDistributionApi(api), [api]);
  const onboarding = useOnboarding({ apiClient: api });
  const membersHook = useMembers({ apiClient: api });

  const [selectedUnitId, setSelectedUnitId] = useState<string>();
  const [filterText, setFilterText] = useState('');
  const [licences, setLicences] = useState<number | undefined>();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);

  // Depend on the hooks' stable callbacks, not the hook objects (new every render, which would loop).
  const { loadTree, selectMember, activateMember, tree } = onboarding;
  const { loadMembers, inviteMember } = membersHook;

  useEffect(() => {
    loadTree()
      .then((root) => setSelectedUnitId(root.id))
      .catch(() => undefined); // surfaces through hook state
    loadMembers({ limit: 100 }).catch(() => undefined);
  }, [loadTree, loadMembers]);

  useEffect(() => {
    distributionApi
      .listExpiringLicences(LICENCE_WINDOW_DAYS)
      .then((response) => setLicences(response.items.length))
      .catch(() => setLicences(undefined)); // the tile is optional
  }, [distributionApi]);

  const closeInvite = useCallback(() => setInviteOpen(false), []);
  const units = useMemo(() => (tree ? flattenUnits(tree) : []), [tree]);

  const activate = async () => {
    if (!onboarding.selectedMember) return;
    await activateMember(onboarding.selectedMember.id).catch(() => undefined); // reported through activationError
    await loadMembers({ limit: 100 });
  };

  const exit = async (memberId: string, transferToMemberId: string | undefined, reason: string) => {
    await distributionApi.exitMember(memberId, { transferToMemberId, reason });
    await Promise.all([loadMembers({ limit: 100 }), selectMember(memberId)]);
  };

  const invite = async (input: Parameters<typeof inviteMember>[0]) => {
    setInviting(true);
    try {
      await inviteMember(input);
      setInviteOpen(false);
    } finally {
      setInviting(false);
    }
  };

  if (onboarding.loading) return <LoadingSkeleton />;
  if (!tree) {
    if (onboarding.error?.status === 403) return <PermissionDenied />;
    if (onboarding.error) return <ErrorState error={onboarding.error} onRetry={() => void loadTree().catch(() => undefined)} />;
    return <EmptyState title={t('distribution.onboarding.no_units')} />;
  }

  const unitIds = selectedUnitId ? unitSubtreeIds(tree, selectedUnitId) : [];
  const inUnit = membersHook.members.filter((m) => unitIds.length === 0 || unitIds.includes(m.orgUnitId));
  const inOnboarding = membersHook.members.filter((m) => m.status === 'invited' || m.status === 'onboarding').length;

  return (
    <PageContainer>
      <PageHeader
        title={t('distribution.onboarding.title')}
        subtitle={t('distribution.onboarding.description')}
        actions={
          <Button variant="primary" size="md" onClick={() => setInviteOpen(true)}>
            {t('distribution.onboarding.invite')}
          </Button>
        }
      />
      <StatsKPIs inOnboarding={inOnboarding} licencesExpiring={licences} />
      <div className="hierarchy-container">
        <OrgTreePanel
          tree={tree}
          selectedUnitId={selectedUnitId}
          onSelectUnit={setSelectedUnitId}
          filterText={filterText}
          onFilterChange={setFilterText}
        />
        <div className="member-detail-panel">
          <Card title={t('distribution.onboarding.pipeline_title')}>
            <OnboardingPipeline members={inUnit} selectedId={onboarding.selectedMember?.id} onSelect={(id) => void selectMember(id)} />
          </Card>
          <MemberDetailPanel
            member={onboarding.selectedMember}
            error={onboarding.error?.title}
            activatingMemberId={onboarding.activatingMemberId}
            activationError={onboarding.activationError}
            missingItems={onboarding.missingItems}
            canExit={can('distribution.member.write')}
            exitTargets={membersHook.members.filter((m) => m.status === 'active')}
            onActivate={activate}
            onExit={exit}
          />
        </div>
      </div>
      <InviteMemberSheet
        isOpen={inviteOpen}
        roles={INVITE_ROLES}
        units={units}
        onClose={closeInvite}
        onSubmit={invite}
        isLoading={inviting}
      />
    </PageContainer>
  );
}
