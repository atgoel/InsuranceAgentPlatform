import { useEffect, useState } from 'react';
import { BottomSheet, formatIstDate, LoadingSkeleton } from '../../design-system';
import { useT } from '../../lib/i18n';
import { formatMoney } from '../../lib/format';
import { usePermissions } from '../../lib/auth/me';
import type { ApiError } from '../../lib/api/api-error';
import { CustomFieldsSection } from '../party/components/CustomFieldsSection';
import { useCustomFieldDefinitions } from '../party/useCustomFieldDefinitions';
import type { PolicyDetail } from './api';
import { asError, BookError, SourceBanner, useBookApi } from './shared';
import { ServicingCard, NewServicingForm } from './ServicingCard';
import { displayField, fieldLabel } from './display';

export function HeldPolicyDetail({ id, onClose }: { id: string; onClose(): void }) {
  const api = useBookApi();
  const { t, lang } = useT();
  const { can } = usePermissions();
  const definitions = useCustomFieldDefinitions('held_policy');
  const [policy, setPolicy] = useState<PolicyDetail>();
  const [error, setError] = useState<ApiError>();
  useEffect(() => {
    let live = true;
    async function load() {
      setPolicy(undefined);
      setError(undefined);
      try {
        const p = await api.policy(id);
        if (live) setPolicy(p);
      } catch (e) {
        if (live) setError(asError(e));
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [api, id]);
  return (
    <BottomSheet open title={t('book.details')} onClose={onClose}>
      <BookError error={error} />
      {!policy && !error && <LoadingSkeleton />}
      {policy?.id === id && !error && (
        <div className="book-screen">
          <h2>{policy.productName}</h2>
          <p>
            {policy.insurerName} · {policy.policyNumber}
          </p>
          <SourceBanner {...policy} />
          <h3>{t('book.commercials')}</h3>
          <dl>
            {Object.entries(policy.commercials)
              .filter(([key]) => key !== 'referredBy')
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{fieldLabel(key, t)}</dt>
                  <dd>{key.endsWith('Paise') && typeof value === 'number' ? formatMoney(value) : displayField(key, value, t)}</dd>
                </div>
              ))}
            {policy.commercials.referredBy && (
              <div>
                <dt>{t('book.field.referredBy')}</dt>
                <dd>{policy.commercials.referredBy.name}</dd>
              </div>
            )}
          </dl>
          {policy.risk && (
            <>
              <h3>{t('book.risk')}</h3>
              {policy.registrationNoLast4 && (
                <p>
                  {t('book.registration')} XXXX{policy.registrationNoLast4}
                </p>
              )}
              <dl>
                {Object.entries(policy.risk.details).map(([key, value]) => (
                  <div key={key}>
                    <dt>{fieldLabel(key, t)}</dt>
                    <dd>{key.endsWith('Paise') && typeof value === 'number' ? formatMoney(value) : displayField(key, value, t)}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          <CustomFieldsSection
            entity="held_policy"
            definitions={definitions}
            values={policy.customFields ?? {}}
            version={policy.version}
            canEdit={can('book.write')}
            onSave={async (values, version) => {
              const updated = await api.updatePolicy(id, values, version);
              setPolicy({ ...policy, ...updated });
            }}
          />
          <h3>{t('book.schedule')}</h3>
          <p>{t(`book.enum.${policy.due.status}`)}</p>
          {policy.schedule.length === 0 && <p>{t('book.no_schedule')}</p>}
          <ul>
            {policy.schedule.map((s) => (
              <li key={s.dueDate}>
                {formatIstDate(s.dueDate, lang)} · {formatMoney(s.amountPaise)}
              </li>
            ))}
          </ul>
          <h3>{t('book.servicing_title')}</h3>
          {policy.servicingRequests.map((r) => (
            <ServicingCard
              key={r.id}
              request={r}
              onUpdated={(updated) =>
                setPolicy({
                  ...policy,
                  servicingRequests: policy.servicingRequests.map((item) => (item.id === updated.id ? updated : item)),
                })
              }
            />
          ))}
          {can('book.servicing') && (
            <NewServicingForm
              policyId={id}
              onCreated={(r) => setPolicy({ ...policy, servicingRequests: [...policy.servicingRequests, r] })}
            />
          )}
        </div>
      )}
    </BottomSheet>
  );
}
