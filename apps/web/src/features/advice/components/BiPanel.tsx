import { useState } from 'react';
import { Button, formatIstDate } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { BiMethod, QuoteOption } from '../api';
import { FieldRow } from './FieldRow';

export const DOCUMENT_REF = /^doc_[A-Z0-9]{26}$/;

interface Props {
  option: QuoteOption;
  busy: boolean;
  onAttach(optionId: string, documentRef: string, insurerBiVersion: string): Promise<boolean>;
  onAcknowledge(biId: string, method: BiMethod, evidenceRef?: string): Promise<boolean>;
}

function AttachForm({ option, busy, onAttach }: Pick<Props, 'option' | 'busy' | 'onAttach'>) {
  const { t } = useT();
  const [documentRef, setDocumentRef] = useState('');
  const [version, setVersion] = useState('');
  const refInvalid = documentRef !== '' && !DOCUMENT_REF.test(documentRef);
  const ready = DOCUMENT_REF.test(documentRef) && version.trim() !== '';
  return (
    <form
      className="advice-form"
      aria-label={t('advice.bi.attach', { product: option.productName })}
      onSubmit={async (e) => {
        e.preventDefault();
        if (ready && (await onAttach(option.id, documentRef, version.trim()))) {
          setDocumentRef('');
          setVersion('');
        }
      }}
    >
      <FieldRow id={`bi-doc-${option.id}`} label={t('advice.bi.document_ref')} error={refInvalid ? t('advice.bi.document_ref_invalid') : undefined}>
        {(aria) => <input {...aria} type="text" value={documentRef} onChange={(e) => setDocumentRef(e.target.value)} />}
      </FieldRow>
      <FieldRow id={`bi-ver-${option.id}`} label={t('advice.bi.insurer_version')}>
        {(aria) => <input {...aria} type="text" value={version} onChange={(e) => setVersion(e.target.value)} />}
      </FieldRow>
      <Button type="submit" variant="secondary" disabled={!ready} loading={busy}>
        {t('advice.bi.attach_submit')}
      </Button>
    </form>
  );
}

function AckForm({ option, biId, busy, onAcknowledge }: { option: QuoteOption; biId: string; busy: boolean; onAcknowledge: Props['onAcknowledge'] }) {
  const { t } = useT();
  const [method, setMethod] = useState<BiMethod>('CUSTOMER_LINK');
  const [evidence, setEvidence] = useState('');
  const needsEvidence = method === 'ASSISTED' && evidence.trim() === '';
  return (
    <form
      className="advice-form"
      aria-label={t('advice.bi.acknowledge', { product: option.productName })}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!needsEvidence) await onAcknowledge(biId, method, evidence.trim() || undefined);
      }}
    >
      <FieldRow id={`bi-method-${option.id}`} label={t('advice.bi.method')}>
        {(aria) => (
          <select {...aria} value={method} onChange={(e) => setMethod(e.target.value as BiMethod)}>
            <option value="CUSTOMER_LINK">{t('advice.bi.method.CUSTOMER_LINK')}</option>
            <option value="ASSISTED">{t('advice.bi.method.ASSISTED')}</option>
          </select>
        )}
      </FieldRow>
      <FieldRow id={`bi-evidence-${option.id}`} label={t('advice.bi.evidence')} error={needsEvidence ? t('advice.bi.evidence_required') : undefined}>
        {(aria) => <input {...aria} type="text" value={evidence} onChange={(e) => setEvidence(e.target.value)} />}
      </FieldRow>
      <Button type="submit" variant="secondary" disabled={needsEvidence} loading={busy}>
        {t('advice.bi.acknowledge_submit')}
      </Button>
    </form>
  );
}

/** Benefit-illustration state for one option: records, attach form and acknowledgement form. */
export function BiPanel({ option, busy, onAttach, onAcknowledge }: Props) {
  const { t, lang } = useT();
  const { bi } = option;
  if (!bi.required) return null;
  const pending = bi.records.find((r) => !r.acknowledgement);
  return (
    <div className="advice-bi">
      {bi.acknowledged ? (
        <p role="status">{t('advice.bi.acknowledged')}</p>
      ) : (
        <p className="advice-error">{t('advice.bi.required')}</p>
      )}
      <ul>
        {bi.records.map((r) => (
          <li key={r.id}>
            {t('advice.bi.record', { ref: r.documentRef, version: r.insurerBiVersion })}
            {r.acknowledgement ? ` - ${t('advice.bi.acknowledged_on', { date: formatIstDate(r.acknowledgement.at, lang), method: t(`advice.bi.method.${r.acknowledgement.method}`) })}` : ''}
          </li>
        ))}
      </ul>
      {!bi.acknowledged && <AttachForm option={option} busy={busy} onAttach={onAttach} />}
      {pending && !bi.acknowledged && <AckForm option={option} biId={pending.id} busy={busy} onAcknowledge={onAcknowledge} />}
    </div>
  );
}
