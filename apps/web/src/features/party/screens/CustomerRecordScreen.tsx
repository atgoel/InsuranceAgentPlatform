import { useState, useEffect } from 'react';
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
} from '../api';
import { PartyHeader } from '../components/PartyHeader';
import { PartyTabs } from '../components/PartyTabs';
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
  const partyApi = createPartyApi(api);
  const { t } = useT();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [detail, setDetail] = useState<DetailState | undefined>();
  const [activeTab, setActiveTab] = useState<string>('overview');

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
    <div className="customer-record-screen">
      <button className="back-button" onClick={handleBack} aria-label="Back to customers">
        ← {t('common.back')}
      </button>

      <PartyHeader party={party} contactability={contactability} />

      <PartyTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        household={party.household}
        roles={party.roles}
        consentSummary={party.consentSummary}
      />
    </div>
  );
}
