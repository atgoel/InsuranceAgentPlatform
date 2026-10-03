import { useState } from 'react';
import { Button } from '../../../../design-system';
import { useT } from '../../../../lib/i18n';

export interface CommitOptions { sourceTag: string; consentBasis: 'CAPTURED_AT_EVENT' | 'NONE'; noticeVersion?: string }

interface ImportStepProps {
  valid: number;
  busy: boolean;
  onCommit(options: CommitOptions): void;
  onBack(): void;
}

/** Source tag is required; event consent needs the notice version shown at the event (M03 consent evidence). */
export function ImportStep({ valid, busy, onCommit, onBack }: ImportStepProps) {
  const { t } = useT();
  const [sourceTag, setSourceTag] = useState('');
  const [consentBasis, setConsentBasis] = useState<CommitOptions['consentBasis']>('NONE');
  const [noticeVersion, setNoticeVersion] = useState('');
  const [touched, setTouched] = useState(false);
  const tagError = sourceTag.trim().length < 2;
  const noticeError = consentBasis === 'CAPTURED_AT_EVENT' && noticeVersion.trim() === '';
  return (
    <form
      className="import-step"
      aria-label={t('crm.import.step_import')}
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (tagError || noticeError) return;
        onCommit({ sourceTag: sourceTag.trim(), consentBasis, ...(consentBasis === 'CAPTURED_AT_EVENT' ? { noticeVersion: noticeVersion.trim() } : {}) });
      }}
    >
      <p>{t('crm.import.validation_reminder', { count: valid })}</p>
      <label>
        {t('crm.import.source_tag')}
        <input value={sourceTag} maxLength={60} onChange={(e) => setSourceTag(e.target.value)} aria-invalid={touched && tagError} />
      </label>
      {touched && tagError && <p role="alert">{t('crm.import.source_tag_required')}</p>}
      <fieldset>
        <legend>{t('crm.import.consent_basis')}</legend>
        <label><input type="radio" name="consent" checked={consentBasis === 'NONE'} onChange={() => setConsentBasis('NONE')} />{t('crm.import.consent_none')}</label>
        <label><input type="radio" name="consent" checked={consentBasis === 'CAPTURED_AT_EVENT'} onChange={() => setConsentBasis('CAPTURED_AT_EVENT')} />{t('crm.import.consent_event')}</label>
      </fieldset>
      {consentBasis === 'CAPTURED_AT_EVENT' && (
        <label>
          {t('crm.import.notice_version')}
          <input value={noticeVersion} maxLength={40} onChange={(e) => setNoticeVersion(e.target.value)} />
        </label>
      )}
      {touched && noticeError && <p role="alert">{t('crm.import.notice_version_required')}</p>}
      <div className="form-actions">
        <Button type="submit" disabled={busy}>{t('crm.import.commit_button')}</Button>
        <Button type="button" variant="secondary" onClick={onBack}>{t('common.back')}</Button>
      </div>
    </form>
  );
}
