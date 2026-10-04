import { Tabs, StatusChip, Button, type TabDef } from '../../../design-system';
import { ConsentSummaryItem, PartyRoleLink, HouseholdView } from '../api';
import { useT } from '../../../lib/i18n';
import { HeldPoliciesPanel } from '../../book/HeldPoliciesPanel';

interface PartyTabsProps {
  partyId?: string;
  activeTab: string;
  onTabChange: (id: string) => void;
  household?: HouseholdView;
  roles: PartyRoleLink[];
  consentSummary: ConsentSummaryItem[];
  onOpenConsentSheet: () => void;
}

export function PartyTabs({
  partyId,
  activeTab,
  onTabChange,
  household,
  roles,
  consentSummary,
  onOpenConsentSheet,
}: PartyTabsProps) {
  const { t } = useT();

  const tabs: TabDef[] = [
    { id: 'overview', label: t('party.record.tab_overview') },
    { id: 'consent', label: t('party.record.tab_consent') },
    { id: 'policies', label: t('party.record.tab_policies') },
  ];

  return (
    <>
      <Tabs tabs={tabs} value={activeTab} onChange={onTabChange} />

      <div className="tab-content-wrapper">
        {activeTab === 'overview' && (
          <div className="tab-content overview-tab">
            {household && (
              <div className="section">
                <h3>{t('party.record.household_title')}</h3>
                <p>{household.name}</p>
                <ul>
                  {household.members.map((m) => (
                    <li key={m.partyId}>
                      {m.partyId} ({m.relation})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {roles && roles.length > 0 && (
              <div className="section">
                <h3>{t('party.record.roles_title')}</h3>
                <ul>
                  {roles.map((role, idx) => (
                    <li key={idx}>
                      {role.role}
                      {role.label && ` · ${role.label}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === 'consent' && (
          <div className="tab-content consent-tab">
            <div className="consent-summary">
              {consentSummary.map((item) => (
                <div key={`${item.purpose}-${item.channel}`} className="consent-item">
                  <span className="consent-label">
                    {item.purpose} · {item.channel}
                  </span>
                  <StatusChip tone={item.granted ? 'ok' : 'bad'}>
                    {item.granted
                      ? t('party.record.consent_granted')
                      : t('party.record.consent_withdrawn')}
                  </StatusChip>
                  <span className="consent-date">{new Date(item.occurredAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>

            <Button variant="secondary" onClick={onOpenConsentSheet}>
              {t('party.record.record_consent')}
            </Button>
          </div>
        )}

        {activeTab === 'policies' && (
          <div className="tab-content">
            {partyId && <HeldPoliciesPanel partyId={partyId} />}
          </div>
        )}
      </div>
    </>
  );
}
