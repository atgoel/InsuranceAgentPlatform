import { useState, useEffect } from 'react';
import { useApi } from '../../../lib/api';
import { Button, Card, StatusChip, LoadingSkeleton, ErrorState, PermissionDenied } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import {
  createDistributionApi,
  OrgUnitNode,
  MemberDetail,
  ChecklistItem,
  ChecklistItemKey,
} from '../api';
import '../styles/OnboardingHierarchyScreen.css';

interface StageStats {
  invited: number;
  onboarding: number;
  active: number;
  suspended: number;
}

interface OrgTreeProps {
  node: OrgUnitNode;
  selectedUnitId?: string;
  onSelectUnit: (unitId: string) => void;
  filterText: string;
}

function OrgTreeNode({ node, selectedUnitId, onSelectUnit, filterText }: OrgTreeProps) {
  const matchesFilter =
    !filterText || node.name.toLowerCase().includes(filterText.toLowerCase());
  const childrenMatch =
    !filterText || node.children.some((child) => matchesFilter || child.name.toLowerCase().includes(filterText.toLowerCase()));

  if (!matchesFilter && !childrenMatch) return null;

  return (
    <div className={`tree-node ${selectedUnitId === node.id ? 'selected' : ''}`}>
      <div
        className="tree-node-header"
        onClick={() => onSelectUnit(node.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onSelectUnit(node.id);
          }
        }}
      >
        <div className="node-name">{node.name}</div>
        {node.memberCount !== undefined && (
          <span className="member-count" title={`${node.memberCount} members`}>
            {node.memberCount}
          </span>
        )}
      </div>
      {node.children && node.children.length > 0 && (
        <div className="tree-children">
          {node.children.map((child) => (
            <OrgTreeNode
              key={child.id}
              node={child}
              selectedUnitId={selectedUnitId}
              onSelectUnit={onSelectUnit}
              filterText={filterText}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ChecklistSectionProps {
  checklist?: ChecklistItem[];
  t: ReturnType<typeof useT>['t'];
}

function ChecklistSection({ checklist, t }: ChecklistSectionProps) {
  if (!checklist || checklist.length === 0) {
    return (
      <div className="checklist-section">
        <h3>{t('distribution.onboarding.checklist')}</h3>
        <div className="no-items">{t('common.no_items')}</div>
      </div>
    );
  }

  return (
    <div className="checklist-section">
      <h3>{t('distribution.onboarding.checklist')}</h3>
      <div className="checklist-items">
        {checklist.map((item) => (
          <div key={item.key} className={`checklist-item ${item.done ? 'done' : ''}`}>
            <div className="item-checkbox">
              <input type="checkbox" checked={item.done} disabled readOnly aria-label={item.key} />
            </div>
            <div className="item-content">
              <div className="item-key">{item.key}</div>
              {item.key === 'TRAINING' && item.hoursLogged !== undefined && item.hoursRequired && (
                <div className="item-detail">
                  {item.hoursLogged}/{item.hoursRequired} hours
                </div>
              )}
              {item.note && <div className="item-note">{item.note}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OnboardingHierarchyScreen() {
  const api = useApi();
  const distributionApi = createDistributionApi(api);
  const { t } = useT();

  const [tree, setTree] = useState<OrgUnitNode | undefined>();
  const [selectedMember, setSelectedMember] = useState<MemberDetail | undefined>();
  const [selectedUnitId, setSelectedUnitId] = useState<string>();
  const [stats, setStats] = useState<StageStats>({ invited: 0, onboarding: 0, active: 0, suspended: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [filterText, setFilterText] = useState('');
  const [activatingMemberId, setActivatingMemberId] = useState<string>();
  const [activationError, setActivationError] = useState<string>();
  const [missingItems, setMissingItems] = useState<ChecklistItemKey[]>([]);

  // Load org tree
  useEffect(() => {
    const loadTree = async () => {
      try {
        setLoading(true);
        const response = await distributionApi.getOrgTree();
        setTree(response.root);
        setSelectedUnitId(response.root.id);
      } catch (err) {
        setError(err instanceof ApiError ? err : new ApiError(0, 'unknown', 'Failed to load org tree'));
      } finally {
        setLoading(false);
      }
    };
    loadTree();
  }, [distributionApi, t]);

  // Calculate stats
  useEffect(() => {
    const calculateStats = async () => {
      try {
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
  }, [distributionApi]);

  const handleActivate = async () => {
    if (!selectedMember) return;

    try {
      setActivatingMemberId(selectedMember.id);
      setActivationError(undefined);
      setMissingItems([]);

      await distributionApi.activateMember(selectedMember.id);

      // Reload member detail to show updated status
      const updated = await distributionApi.getMember(selectedMember.id);
      setSelectedMember(updated);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 422 &&
        err.code === 'onboarding_incomplete'
      ) {
        const errorData = err as ApiError & { missing?: ChecklistItemKey[] };
        setMissingItems(errorData.missing || []);
        setActivationError(t('distribution.onboarding.missing_items'));
      } else {
        setActivationError(
          err instanceof ApiError ? err.title : 'Failed to activate member'
        );
      }
    } finally {
      setActivatingMemberId(undefined);
    }
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  if (!tree) {
    return <PermissionDenied />;
  }

  const isChecklistComplete = !selectedMember?.checklist ||
    selectedMember.checklist.every((item) => item.done);

  return (
    <div className="onboarding-hierarchy-screen">
      <div className="page-header">
        <h1>{t('distribution.onboarding.title')}</h1>
        <p>{t('distribution.onboarding.description')}</p>
      </div>

      {/* KPI Tiles */}
      <div className="kpi-tiles">
        <Card>
          <div className="kpi-content">
            <div className="kpi-value">{stats.invited}</div>
            <div className="kpi-label">{t('distribution.onboarding.invited')}</div>
          </div>
        </Card>
        <Card>
          <div className="kpi-content">
            <div className="kpi-value">{stats.onboarding}</div>
            <div className="kpi-label">{t('distribution.onboarding.in_progress')}</div>
          </div>
        </Card>
        <Card>
          <div className="kpi-content">
            <div className="kpi-value">{stats.active}</div>
            <div className="kpi-label">{t('distribution.onboarding.active')}</div>
          </div>
        </Card>
        <Card>
          <div className="kpi-content">
            <div className="kpi-value">{stats.suspended}</div>
            <div className="kpi-label">{t('distribution.onboarding.suspended')}</div>
          </div>
        </Card>
      </div>

      <div className="hierarchy-container">
        {/* Org Tree */}
        <div className="hierarchy-tree-panel">
          <div className="tree-filter">
            <input
              type="text"
              placeholder={t('common.filter')}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              aria-label={t('common.filter')}
            />
          </div>
          <div className="tree-content">
            {tree && (
              <OrgTreeNode
                node={tree}
                selectedUnitId={selectedUnitId}
                onSelectUnit={setSelectedUnitId}
                filterText={filterText}
              />
            )}
          </div>
        </div>

        {/* Member Detail Panel */}
        <div className="member-detail-panel">
          {selectedMember ? (
            <Card>
              <div className="member-header">
                <h2>{selectedMember.displayName}</h2>
                <StatusChip tone={selectedMember.status === 'active' ? 'ok' : 'info'}>
                  {selectedMember.status}
                </StatusChip>
              </div>

              <div className="member-contact">
                {selectedMember.phoneMasked && <div>{selectedMember.phoneMasked}</div>}
                {selectedMember.emailMasked && <div>{selectedMember.emailMasked}</div>}
              </div>

              {selectedMember.checklist && (
                <>
                  <ChecklistSection checklist={selectedMember.checklist} t={t} />

                  {activationError && (
                    <div className="error-message">
                      {activationError}
                      {missingItems.length > 0 && (
                        <ul className="missing-items">
                          {missingItems.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <div className="button-group">
                    <Button
                      onClick={handleActivate}
                      disabled={activatingMemberId === selectedMember.id || !isChecklistComplete}
                      variant="primary"
                      size="md"
                    >
                      {activatingMemberId === selectedMember.id ? t('common.loading') : t('distribution.onboarding.activate')}
                    </Button>
                    {!isChecklistComplete && (
                      <span className="help-text">
                        {t('distribution.onboarding.complete_checklist_first')}
                      </span>
                    )}
                  </div>
                </>
              )}
            </Card>
          ) : (
            <Card>
              <div className="empty-message">{t('distribution.onboarding.select_member')}</div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
