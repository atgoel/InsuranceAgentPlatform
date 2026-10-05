import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomSheet, Button, Select, type SelectOption } from '../../../design-system';
import { useApi } from '../../../lib/api';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type ProductLine } from '../../crm/api';
import { rupeesToPaiseExact } from '../customFieldMoney';
import '../styles/CreateOpportunitySheet.css';

const PRODUCT_LINES: ProductLine[] = ['TERM_LIFE', 'SAVINGS_LIFE', 'HEALTH', 'HEALTH_FLOATER', 'CHILD', 'RETIREMENT', 'MOTOR', 'OTHER'];
const TITLE_MIN = 3;
const TITLE_MAX = 120;
const PIPELINE_PATH = '/crm/pipeline';

interface CreateOpportunitySheetProps {
  partyId: string;
  open: boolean;
  onClose: () => void;
}

/** Product line, title (3..120 characters) and expected premium in rupees, sent as integer paise. */
export function CreateOpportunitySheet({ partyId, open, onClose }: CreateOpportunitySheetProps) {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const navigate = useNavigate();
  const { t } = useT();
  const [line, setLine] = useState<ProductLine>('TERM_LIFE');
  const [title, setTitle] = useState('');
  const [premium, setPremium] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const trimmed = title.trim();
  const titleValid = trimmed.length >= TITLE_MIN && trimmed.length <= TITLE_MAX;
  const paise = rupeesToPaiseExact(premium);
  const options: SelectOption[] = PRODUCT_LINES.map((code) => ({ value: code, label: t(`labels.line.${code}`) }));

  const submit = async () => {
    if (!titleValid || paise === undefined) {
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await crmApi.createOpportunity({ partyId, productInterest: line, title: trimmed, expectedPremiumPaise: paise });
      navigate(PIPELINE_PATH);
    } catch (err) {
      setError(err instanceof ApiError ? err.title : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t('party.opportunity.title')}>
      <div className="opportunity-form">
        <Select label={t('party.opportunity.line')} value={line} options={options} onChange={(v) => setLine(v as ProductLine)} />
        <div className="opportunity-field">
          <label htmlFor="opportunity-title">{t('party.opportunity.name')}</label>
          <input id="opportunity-title" type="text" value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
          {title !== '' && !titleValid && <p className="opportunity-hint">{t('party.opportunity.name_hint')}</p>}
        </div>
        <div className="opportunity-field">
          <label htmlFor="opportunity-premium">{t('party.opportunity.premium')}</label>
          <input
            id="opportunity-premium"
            type="text"
            inputMode="decimal"
            value={premium}
            onChange={(e) => setPremium(e.target.value)}
          />
          {premium !== '' && paise === undefined && <p className="opportunity-hint">{t('party.opportunity.premium_hint')}</p>}
        </div>
        {error && (
          <p role="alert" className="opportunity-error">
            {error}
          </p>
        )}
        <div className="sheet-actions">
          <Button variant="primary" loading={saving} disabled={!titleValid || paise === undefined} onClick={submit}>
            {t('party.opportunity.submit')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
