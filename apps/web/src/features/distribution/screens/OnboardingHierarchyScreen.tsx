import { useState, useEffect } from 'react';
import { useApi } from '../../../lib/api';
import { LoadingSkeleton, ErrorState, PermissionDenied } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { useOnboarding } from '../hooks/useOnboarding';
import { createDistributionApi } from '../api';
import { OrgTreePanel, ChecklistPanel, StatsKPIs } from '../components';
import '../styles/OnboardingHierarchyScreen.css';

interface StageStats {
  invited: number;
  onboarding: number;
  active: number;
  suspended: number;
}

export function OnboardingHierarchyScreen() {
  const api = useApi();
  const { t } = useT();
  const { tree, selectedMember, loading, error, activatingMemberId, activationError, missingItems, loadTree, activateMember } = useOnboarding({
    apiClient: api,
  });

  const [selectedUnitId, setSelectedUnitId] = useState<string>();
  const [stats, setStats] = useState<StageStats>({ invited: 0, onboarding: 0, active: 0, suspended: 0 });
  const [filterText, setFilterText] = useState('');

  // Load org tree on mount
  useEffect(() => {
    const init = async () => {
      const root = await loadTree();
      if (root) {
        setSelectedUnitId(root.id);
      }
    };
    init().catch(() => {
      // Error handled in state
    });
  }, [loadTree]);

  // Calculate stats
  useEffect(() => {
    const calculateStats = async () => {
      try {
        const distributionApi = createDistributionApi(api);
        const response = await distributionApi.listMembers({ limit: 1000 });
        const counts: StageStats = { invited: 0, onboarding: 0, active: 0, suspended: 0 };
        response.items.forEach((member) => {
          counts[member.status as keyof StageStats]++;
        });
        setStats(counts);
      } catch {
        // Stats are non-critical
      }
    };
    calculateStats();
  }, [api]);

  const handleActivate = async () => {
    if (!selectedMember) return;
    try {
      await activateMember(selectedMember.id);
    } catch {
      // Error handled in state
    }
  };

  const isChecklistComplete = !selectedMember?.checklist ||
    selectedMember.checklist.every((item) => item.done);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  if (!tree) {
    return <PermissionDenied />;
  }

  return (
    <div className="onboarding-hierarchy-screen">
      <div className="page-header">
        <h1>{t('distribution.onboarding.title')}</h1>
        <p>{t('distribution.onboarding.description')}</p>
      </div>

      <StatsKPIs stats={stats} />

      <div className="hierarchy-container">
        <OrgTreePanel
          tree={tree}
          selectedUnitId={selectedUnitId}
          onSelectUnit={setSelectedUnitId}
          filterText={filterText}
          onFilterChange={setFilterText}
        />

        <div className="member-detail-panel">
          {selectedMember ? (
            <ChecklistPanel
              member={selectedMember}
              isChecklistComplete={isChecklistComplete}
              activatingMemberId={activatingMemberId}
              activationError={activationError}
              missingItems={missingItems}
              onActivate={handleActivate}
            />
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: '#5F6776' }}>
              {t('distribution.onboarding.select_member')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
