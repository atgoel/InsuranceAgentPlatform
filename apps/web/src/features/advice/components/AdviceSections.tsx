import { useState } from 'react';
import { Button, formatIstDate } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { AdviceView, MissingItem } from '../api';
import { FieldRow } from './FieldRow';
import { ProductSelect } from './ProductSelect';

interface SectionProps {
  view: AdviceView;
  readOnly: boolean;
  busy: boolean;
}

export function MissingChecklist({ missing }: { missing: MissingItem[] }) {
  const { t } = useT();
  if (missing.length === 0) return null;
  return (
    <section className="advice-card" aria-label={t('advice.record.missing')}>
      <h2>{t('advice.record.missing')}</h2>
      <ul className="advice-checklist">
        {missing.map((m) => (
          <li key={m}>{t(`advice.missing.${m}`)}</li>
        ))}
      </ul>
    </section>
  );
}

export function RunsSection({ view }: { view: AdviceView }) {
  const { t, lang } = useT();
  return (
    <section className="advice-card" aria-label={t('advice.record.runs')}>
      <h2>{t('advice.record.runs')}</h2>
      {view.calculatorRuns.length === 0 && <p>{t('advice.record.no_runs')}</p>}
      <ul>
        {view.calculatorRuns.map((r) => (
          <li key={`${r.calculator}-${r.ranAt}`}>
            {t(`advice.calc.tab.${r.calculator}`)} - {formatIstDate(r.ranAt, lang)} - {t('advice.calc.assumptions', { version: r.assumptionsVersion })}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RecommendationsSection({ view, readOnly, busy, onAdd }: SectionProps & { onAdd(versionId: string, rationale: string): Promise<boolean> }) {
  const { t } = useT();
  const [versionId, setVersionId] = useState('');
  const [rationale, setRationale] = useState('');
  const trimmed = rationale.trim();
  const valid = versionId !== '' && trimmed.length >= 10 && trimmed.length <= 500;
  return (
    <section className="advice-card" aria-label={t('advice.record.recommendations')}>
      <h2>{t('advice.record.recommendations')}</h2>
      {view.recommended.length === 0 && <p>{t('advice.record.no_recommendations')}</p>}
      <ul>
        {view.recommended.map((r) => (
          <li key={r.versionId}>
            <strong>
              {r.productName} ({r.insurerName})
            </strong>
            : {r.rationale}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <form
          className="advice-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (valid && (await onAdd(versionId, trimmed))) {
              setVersionId('');
              setRationale('');
            }
          }}
        >
          <ProductSelect id="rec-product" label={t('advice.record.recommend_product')} products={view.shownProducts} value={versionId} onChange={setVersionId} />
          <FieldRow id="rec-rationale" label={t('advice.record.rationale')} hint={t('advice.record.rationale_hint')}>
            {(aria) => <textarea {...aria} maxLength={500} value={rationale} onChange={(e) => setRationale(e.target.value)} />}
          </FieldRow>
          <Button type="submit" disabled={!valid} loading={busy}>
            {t('advice.record.add_recommendation')}
          </Button>
        </form>
      )}
    </section>
  );
}

type ChoiceSave = (versionId: string, reason?: string) => Promise<boolean>;

function ChoiceForm({ view, busy, onSave }: { view: AdviceView; busy: boolean; onSave: ChoiceSave }) {
  const { t } = useT();
  const current = view.customerChoice;
  const [versionId, setVersionId] = useState(current?.versionId ?? '');
  const [reason, setReason] = useState(current?.reasonIfDifferent ?? '');
  const differs = versionId !== '' && !view.recommended.some((r) => r.versionId === versionId);
  const reasonMissing = differs && reason.trim() === '';
  return (
    <form
      className="advice-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (versionId !== '' && !reasonMissing) await onSave(versionId, differs ? reason.trim() : undefined);
      }}
    >
      <ProductSelect id="choice-product" label={t('advice.record.choice_product')} products={view.shownProducts} value={versionId} onChange={setVersionId} />
      {differs && (
        <FieldRow id="choice-reason" label={t('advice.record.choice_reason')} error={reasonMissing ? t('advice.record.choice_reason_required') : undefined}>
          {(aria) => <textarea {...aria} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </FieldRow>
      )}
      <Button type="submit" disabled={versionId === '' || reasonMissing} loading={busy}>
        {t('advice.record.save_choice')}
      </Button>
    </form>
  );
}

export function ChoiceSection({ view, readOnly, busy, onSave }: SectionProps & { onSave: ChoiceSave }) {
  const { t } = useT();
  const current = view.customerChoice;
  return (
    <section className="advice-card" aria-label={t('advice.record.choice')}>
      <h2>{t('advice.record.choice')}</h2>
      {!current && <p>{t('advice.record.no_choice')}</p>}
      {current && (
        <p>
          {current.productName} ({current.insurerName})
          {current.reasonIfDifferent ? ` - ${current.reasonIfDifferent}` : ''}
        </p>
      )}
      {!readOnly && <ChoiceForm view={view} busy={busy} onSave={onSave} />}
    </section>
  );
}

export function NotesSection({ view, readOnly, busy, onSave }: SectionProps & { onSave(text: string): Promise<boolean> }) {
  const { t } = useT();
  const [text, setText] = useState(view.suitabilityNotes);
  return (
    <section className="advice-card" aria-label={t('advice.record.notes')}>
      <h2>{t('advice.record.notes')}</h2>
      {readOnly ? (
        <p>{view.suitabilityNotes}</p>
      ) : (
        <form
          className="advice-form"
          onSubmit={async (e) => {
            e.preventDefault();
            await onSave(text);
          }}
        >
          <FieldRow id="advice-notes" label={t('advice.record.notes')} hint={t('advice.record.notes_hint')}>
            {(aria) => <textarea {...aria} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />}
          </FieldRow>
          <Button type="submit" variant="secondary" loading={busy}>
            {t('advice.record.save_notes')}
          </Button>
        </form>
      )}
    </section>
  );
}
