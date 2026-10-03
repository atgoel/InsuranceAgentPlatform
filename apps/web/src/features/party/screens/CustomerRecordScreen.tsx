import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../../../lib/api';
import {
  Button,
  Tabs,
  StatusChip,
  LoadingSkeleton,
  ErrorState,
  PermissionDenied,
  BottomSheet,
  ConsentCheckbox,
  type TabDef,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import {
  createPartyApi,
  PartyView,
  HouseholdView,
  ConsentSummaryItem,
  ContactabilityDecision,
  ConsentChannel,
  ConsentPurpose,
} from '../api';
import '../styles/CustomerRecordScreen.css';

interface DetailState {
  party: PartyView & {
    household?: HouseholdView;
    roles: Array<{ role: string; label?: string }>;
    consentSummary: ConsentSummaryItem[];
  };
  contactability: {
    whatsapp?: ContactabilityDecision;
    call?: ContactabilityDecision;
  };
}

export function CustomerRecordScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const api = useApi();
  const partyApi = createPartyApi(api);
  const { t } = useT();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [detail, setDetail] = useState<DetailState | undefined>();
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [recordingConsent, setRecordingConsent] = useState(false);
  const [recordingError, setRecordingError] = useState<string | undefined>();

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      try {
        setLoading(true);
        setError(undefined);
        const [party, whatsapp, call] = await Promise.all([
          partyApi.getParty(id),
          partyApi.checkContactability(id, 'WHATSAPP', 'SERVICE').catch(() => undefined),
          partyApi.checkContactability(id, 'CALL', 'SERVICE').catch(() => undefined),
        ]);
        setDetail({
          party,
          contactability: {
            whatsapp,
            call,
          },
        });
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 403) {
            setError(err);
          } else {
            setError(err);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, partyApi]);

  const handleRecordConsent = async (input: {
    purpose: ConsentPurpose;
    channel: ConsentChannel;
    granted: boolean;
    noticeVersion: string;
  }) => {
    if (!id) return;
    try {
      setRecordingConsent(true);
      setRecordingError(undefined);
      await partyApi.recordConsent(id, {
        ...input,
        source: 'WEB_FORM',
      });
      // Reload the party data
      const updated = await partyApi.getParty(id);
      setDetail((prev) =>
        prev ? { ...prev, party: updated } : undefined
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setRecordingError(err.title);
      }
    } finally {
      setRecordingConsent(false);
    }
  };

  const handleBack = () => {
    navigate('/crm/customers');
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    if (error.status === 403) {
      return <PermissionDenied />;
    }
    return <ErrorState error={error} onRetry={() => window.location.reload()} />;
  }

  if (!detail) {
    return <LoadingSkeleton />;
  }

  const { party, contactability } = detail;
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const whatsappDisabled = contactability.whatsapp && !contactability.whatsapp.allowed;
  const callDisabled = contactability.call && !contactability.call.allowed;

  const tabs: TabDef[] = [
    {
      id: 'overview',
      label: t('party.record.tab_overview'),
      content: (
        <div className="tab-content overview-tab">
          {party.household && (
            <div className="section">
              <h3>{t('party.record.household_title')}</h3>
              <p>{party.household.name}</p>
              <ul>
                {party.household.members.map((m) => (
                  <li key={m.partyId}>
                    {m.partyId} ({m.relation})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {party.roles && party.roles.length > 0 && (
            <div className="section">
              <h3>{t('party.record.roles_title')}</h3>
              <ul>
                {party.roles.map((role, idx) => (
                  <li key={idx}>
                    {role.role}
                    {role.label && ` · ${role.label}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'consent',
      label: t('party.record.tab_consent'),
      content: (
        <div className="tab-content consent-tab">
          <div className="consent-summary">
            {party.consentSummary.map((item) => (
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

          <Button
            variant="secondary"
            onClick={() => setActiveTab('consent-record')}
          >
            {t('party.record.record_consent')}
          </Button>
        </div>
      ),
    },
    {
      id: 'policies',
      label: t('party.record.tab_policies'),
      content: (
        <div className="tab-content">
          <p>{t('party.record.coming_soon')}</p>
        </div>
      ),
    },
  ];

  return (
    <div className="customer-record-screen">
      <button className="back-button" onClick={handleBack} aria-label="Back to customers">
        ← {t('common.back')}
      </button>

      <div className="record-header">
        <div className="header-content">
          <div className="initials-avatar">{getInitials(party.displayName)}</div>
          <div className="header-info">
            <h1>{party.displayName}</h1>
            {party.household && <p className="household-name">{party.household.name}</p>}
            <div className="preferences">
              <span className="preference">
                {t('party.record.language')}: {party.preferredLanguage}
              </span>
              {party.preferredChannel && (
                <span className="preference">
                  {t('party.record.channel')}: {party.preferredChannel}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="header-actions">
          <Button
            variant={callDisabled ? 'secondary' : 'primary'}
            disabled={callDisabled}
            title={callDisabled ? contactability.call?.reason : undefined}
          >
            {t('party.record.call_button')}
          </Button>
          <Button
            variant={whatsappDisabled ? 'secondary' : 'primary'}
            disabled={whatsappDisabled}
            title={whatsappDisabled ? contactability.whatsapp?.reason : undefined}
          >
            {t('party.record.whatsapp_button')}
          </Button>
        </div>
      </div>

      <Tabs
        tabs={tabs}
        active={activeTab}
        onChange={setActiveTab}
        aria-label="Customer record tabs"
      />

      {recordingError && (
        <div className="error-banner">{recordingError}</div>
      )}
    </div>
  );
}
