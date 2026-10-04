import { useId } from 'react';
import { BottomSheet, Button } from '../../../design-system';
import { ConsentChannel, ConsentPurpose } from '../api';
import { useT } from '../../../lib/i18n';
import { partyLabel } from '../partyLabels';

const PURPOSES: ConsentPurpose[] = ['SERVICE', 'MARKETING', 'AI_PROCESSING', 'DATA_SHARING_INSURER'];
const CHANNELS: ConsentChannel[] = ['WHATSAPP', 'SMS', 'EMAIL', 'CALL'];

interface ConsentForm {
  purpose: ConsentPurpose;
  channel: ConsentChannel;
  granted: boolean;
  noticeVersion: string;
}

interface RecordConsentSheetProps {
  open: boolean;
  onClose: () => void;
  form: ConsentForm;
  onFormChange: (form: ConsentForm) => void;
  onSave: () => void;
  saving: boolean;
  error?: string;
}

export function RecordConsentSheet({
  open,
  onClose,
  form,
  onFormChange,
  onSave,
  saving,
  error,
}: RecordConsentSheetProps) {
  const { t } = useT();
  const purposeId = useId();
  const channelId = useId();

  return (
    <BottomSheet open={open} onClose={onClose} title={t('party.record.record_consent')}>
      <div className="consent-sheet-content">
        <div className="consent-notice">
          <strong>{t('party.record.notice_version')}: {form.noticeVersion}</strong>
        </div>

        <div className="consent-form">
          <div className="form-group">
            <label htmlFor={purposeId}>{t('party.record.purpose')}</label>
            <select
              id={purposeId}
              value={form.purpose}
              onChange={(e) =>
                onFormChange({ ...form, purpose: e.target.value as ConsentPurpose })
              }
            >
              {PURPOSES.map((purpose) => (
                <option key={purpose} value={purpose}>
                  {partyLabel(t, 'purpose', purpose)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor={channelId}>{t('party.record.channel')}</label>
            <select
              id={channelId}
              value={form.channel}
              onChange={(e) =>
                onFormChange({ ...form, channel: e.target.value as ConsentChannel })
              }
            >
              {CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {partyLabel(t, 'consentChannel', channel)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <div className="radio-group" role="radiogroup" aria-label={t('party.record.granted')}>
              <label>
                <input
                  type="radio"
                  checked={form.granted}
                  onChange={() => onFormChange({ ...form, granted: true })}
                />
                {t('party.record.granted_yes')}
              </label>
              <label>
                <input
                  type="radio"
                  checked={!form.granted}
                  onChange={() => onFormChange({ ...form, granted: false })}
                />
                {t('party.record.granted_no')}
              </label>
            </div>
          </div>
        </div>

        {error && (
          <p className="consent-error" role="alert">
            {error}
          </p>
        )}

        <div className="sheet-actions">
          <Button variant="primary" loading={saving} onClick={onSave}>
            {t('party.record.save_consent')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
