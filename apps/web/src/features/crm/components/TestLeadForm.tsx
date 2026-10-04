import { useId, useState } from 'react';
import { Button } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import type { CrmApi, LeadSource, ProductLine, RoutingDecision } from '../api';

const PRODUCTS: ProductLine[] = ['TERM_LIFE', 'SAVINGS_LIFE', 'HEALTH', 'HEALTH_FLOATER', 'CHILD', 'RETIREMENT', 'MOTOR', 'OTHER'];
const SOURCES: LeadSource[] = ['WEB_FORM', 'MICROSITE', 'REFERRAL', 'WALK_IN', 'PHONE', 'EVENT', 'CAMPAIGN', 'IMPORT', 'API'];

/** "Test a lead": simulates routing for the saved rules (no side effects) and shows who would get it and why. */
export function TestLeadForm({ api }: { api: CrmApi }) {
  const { t } = useT();
  const id = useId();
  const [productInterest, setProduct] = useState<ProductLine>('TERM_LIFE');
  const [source, setSource] = useState<LeadSource>('WEB_FORM');
  const [pincode, setPincode] = useState('');
  const [language, setLanguage] = useState('');
  const [result, setResult] = useState<(RoutingDecision & { memberName?: string }) | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setResult(
        await api.simulateRouting({
          productInterest,
          source,
          pincode: pincode.trim() || undefined,
          language: language.trim() || undefined,
        }),
      );
    } catch (err) {
      setResult(undefined);
      setError(err instanceof ApiError ? err.title : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="test-lead-form"
      aria-label={t('crm.routing.test_lead')}
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <h2>{t('crm.routing.test_lead')}</h2>
      <label htmlFor={`${id}-product`}>{t('crm.leads.product')}</label>
      <select id={`${id}-product`} value={productInterest} onChange={(e) => setProduct(e.target.value as ProductLine)}>
        {PRODUCTS.map((p) => (
          <option key={p} value={p}>
            {t(`crm.product.${p}`)}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-source`}>{t('crm.leads.source')}</label>
      <select id={`${id}-source`} value={source} onChange={(e) => setSource(e.target.value as LeadSource)}>
        {SOURCES.map((s) => (
          <option key={s} value={s}>
            {t(`crm.source.${s}`)}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-pincode`}>{t('crm.leads.pincode')}</label>
      <input id={`${id}-pincode`} inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value)} />
      <label htmlFor={`${id}-language`}>{t('crm.leads.language')}</label>
      <input id={`${id}-language`} maxLength={10} value={language} onChange={(e) => setLanguage(e.target.value)} />
      <Button type="submit" disabled={busy}>
        {t('crm.routing.test_button')}
      </Button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <output className="test-result" aria-label={t('crm.routing.test_result')}>
          {result.memberName && <strong>{result.memberName}</strong>}
          <p>{result.reason}</p>
        </output>
      )}
    </form>
  );
}
