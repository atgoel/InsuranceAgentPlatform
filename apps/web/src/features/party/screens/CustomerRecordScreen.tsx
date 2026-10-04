import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorState, LoadingSkeleton, PageContainer, PermissionDenied } from '../../../design-system';
import { useApi } from '../../../lib/api';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createPartyApi, type ConsentChannel, type ConsentPurpose } from '../api';
import { PartyCustomFields } from '../components/PartyCustomFields';
import { PartyHeader } from '../components/PartyHeader';
import { PartyTabs } from '../components/PartyTabs';
import { RecordConsentSheet } from '../components/RecordConsentSheet';
import { usePartyBase } from '../partyLabels';
import { useCustomerRecord } from '../useCustomerRecord';
import '../styles/party-frame.css';
import '../styles/CustomerRecordScreen.css';

const INITIAL_CONSENT = {
  purpose: 'SERVICE' as ConsentPurpose,
  channel: 'WHATSAPP' as ConsentChannel,
  granted: true,
  noticeVersion: '1.0',
};

/** CRM09 customer record. Shown under /crm/customers/:id and, at phone width, under /m/customers/:id (D6). */
export function CustomerRecordScreen() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const partyApi = useMemo(() => createPartyApi(api), [api]);
  const { t } = useT();
  const base = usePartyBase();
  const record = useCustomerRecord(partyApi, id);

  const [activeTab, setActiveTab] = useState('overview');
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentError, setConsentError] = useState<string | undefined>();
  const [consentForm, setConsentForm] = useState(INITIAL_CONSENT);

  const saveConsent = async () => {
    if (!id) return;
    setConsentSaving(true);
    setConsentError(undefined);
    try {
      // Recorded by staff on the customer's behalf (M03 consent source ASSISTED).
      await partyApi.recordConsent(id, { ...consentForm, source: 'ASSISTED' });
      const updated = await partyApi.getParty(id);
      record.setParty(() => updated);
      setConsentOpen(false);
    } catch (err) {
      const reason = err instanceof ApiError ? err.title : t('common.error');
      setConsentError(t('party.record.consent_failed', { reason }));
    } finally {
      setConsentSaving(false);
    }
  };

  if (record.error?.status === 403) {
    return <PermissionDenied />;
  }
  if (record.error) {
    return <ErrorState error={record.error} onRetry={record.reload} />;
  }
  if (!record.detail) {
    return <LoadingSkeleton />;
  }

  const { party, contactability } = record.detail;

  return (
    <div className="party-screen-frame">
      <PageContainer width="wide">
        <nav className="record-breadcrumb" aria-label={t('party.record.breadcrumb')}>
          <Link to={`${base}/customers`}>{t('party.customers.title')}</Link>
          <span aria-hidden="true"> › </span>
          <span aria-current="page">{party.displayName}</span>
        </nav>
        <PartyHeader party={party} contactability={contactability} />
        <PartyCustomFields party={party} onUpdated={(updated) => record.setParty((prev) => ({ ...prev, ...updated }))} />
        <PartyTabs
          partyId={party.id}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          household={party.household}
          roles={party.roles}
          consentSummary={party.consentSummary}
          onOpenConsentSheet={() => setConsentOpen(true)}
        />
        <RecordConsentSheet
          open={consentOpen}
          onClose={() => setConsentOpen(false)}
          form={consentForm}
          onFormChange={setConsentForm}
          onSave={saveConsent}
          saving={consentSaving}
          error={consentError}
        />
      </PageContainer>
    </div>
  );
}
