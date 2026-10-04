import { Tabs, type TabDef } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { ConsentSummaryItem, HouseholdView, PartyRoleLink } from '../api';
import { HeldPoliciesPanel } from '../../book/HeldPoliciesPanel';
import { ConsentTab } from './ConsentTab';
import { OverviewTab } from './OverviewTab';

interface PartyTabsProps {
  partyId: string;
  activeTab: string;
  onTabChange: (id: string) => void;
  household?: HouseholdView;
  roles: PartyRoleLink[];
  consentSummary: ConsentSummaryItem[];
  onOpenConsentSheet: () => void;
}

function LaterModule() {
  const { t } = useT();
  return <p className="tab-later">{t('party.record.coming_soon')}</p>;
}

/** CRM09 tabs. Activity and Documents wait for later modules (M04, M13) and say so. */
export function PartyTabs({ partyId, activeTab, onTabChange, household, roles, consentSummary, onOpenConsentSheet }: PartyTabsProps) {
  const { t } = useT();
  const tabs: TabDef[] = [
    { id: 'overview', label: t('party.record.tab_overview') },
    { id: 'policies', label: t('party.record.tab_policies') },
    { id: 'activity', label: t('party.record.tab_activity') },
    { id: 'documents', label: t('party.record.tab_documents') },
    { id: 'consent', label: t('party.record.tab_consent') },
  ];

  return (
    <>
      <div className="record-tabs">
        <Tabs tabs={tabs} value={activeTab} onChange={onTabChange} />
      </div>
      <div className="tab-content" role="tabpanel" id={`panel-${activeTab}`}>
        {activeTab === 'overview' && <OverviewTab household={household} roles={roles} />}
        {activeTab === 'policies' && <HeldPoliciesPanel partyId={partyId} />}
        {(activeTab === 'activity' || activeTab === 'documents') && <LaterModule />}
        {activeTab === 'consent' && <ConsentTab summary={consentSummary} onRecord={onOpenConsentSheet} />}
      </div>
    </>
  );
}
