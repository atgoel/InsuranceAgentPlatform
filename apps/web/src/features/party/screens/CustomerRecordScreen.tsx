import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../../../lib/api';
import {
  LoadingSkeleton,
  ErrorState,
  PermissionDenied,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import {
  createPartyApi,
  PartyView,
  HouseholdView,
  ConsentSummaryItem,
  ContactabilityDecision,
  PartyRoleLink,
  ConsentChannel,
  ConsentPurpose,
} from '../api';
import { PartyHeader } from '../components/PartyHeader';
import { PartyTabs } from '../components/PartyTabs';
import { PartyCustomFields } from '../components/PartyCustomFields';
import { RecordConsentSheet } from '../components/RecordConsentSheet';
import '../styles/CustomerRecordScreen.css';

interface DetailState {
  party: PartyView & {
    household?: HouseholdView;
    roles: PartyRoleLink[];
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
  const partyApi = useMemo(() => createPartyApi(api), [api]);
  const { t } = useT();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [detail, setDetail] = useState<DetailState | undefined>();
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [recordingConsent, setRecordingConsent] = useState(false);
  const [consentSheet, setConsentSheet] = useState(false);
  const [consentError, setConsentError] = useState<string | undefined>();
  const [consentForm, setConsentForm] = useState({
    purpose: 'SERVICE' as ConsentPurpose,
    channel: 'WHATSAPP' as ConsentChannel,
    granted: true,
    noticeVersion: '1.0',
  });

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
          contactability: { whatsapp, call },
        });
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, partyApi]);

  const handleBack = () => {
    navigate('/crm/customers');
  };

  const handleRecordConsent = async () => {
    if (!id) return;
    try {
      setRecordingConsent(true);
      setConsentError(undefined);
      // Recorded by staff on the customer's behalf (M03 consent source ASSISTED).
      await partyApi.recordConsent(id, { ...consentForm, source: 'ASSISTED' });
      // Reload party data
      const updated = await partyApi.getParty(id);
      setDetail((prev) => (prev ? { ...prev, party: updated } : undefined));
      setConsentSheet(false);
    } catch {
      setConsentError(t('party.record.consent_failed'));
    } finally {
      setRecordingConsent(false);
    }
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

  return (
    <main className="customer-record-screen" role="main">
      <button className="back-button" onClick={handleBack} aria-label="Back to customers">
        ← {t('common.back')}
      </button>

      <PartyHeader party={party} contactability={contactability} />

      <PartyCustomFields party={party} onUpdated={(updated) => setDetail((prev) => (prev ? { ...prev, party: { ...prev.party, ...updated } } : prev))} />

      <PartyTabs partyId={party.id}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        household={party.household}
        roles={party.roles}
        consentSummary={party.consentSummary}
        onOpenConsentSheet={() => setConsentSheet(true)}
      />

      <RecordConsentSheet
        open={consentSheet}
        onClose={() => setConsentSheet(false)}
        form={consentForm}
        onFormChange={setConsentForm}
        onSave={handleRecordConsent}
        saving={recordingConsent}
        error={consentError}
      />
    </main>
  );
}
