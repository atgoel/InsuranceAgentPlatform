import { useState } from 'react';
import { Button, StatusChip } from '../../../../design-system';
import { useT } from '../../../../lib/i18n';
import type { LeadDetailView, LeadStage, ProductLine, Qualification } from '../../api';
import { StageBar } from '../StageBar';
import { QualificationForm } from '../QualificationForm';
import { ConvertSheet } from '../ConvertSheet';

const TEMPERATURE_TONE = { HOT: 'bad', WARM: 'warn', COLD: 'info' } as const;

export interface ConvertInput {
  partyChoice: 'LEAD_PARTY' | { existingPartyId: string };
  productInterest: ProductLine;
  expectedPremiumPaise: number;
  startStage: 'DISCOVERY' | 'QUOTE_SHARED';
}

interface Props {
  lead: LeadDetailView;
  onStage(stage: LeadStage, lostReason?: string): void;
  onQualify(q: Qualification): void;
  onConvert(input: ConvertInput): void;
}

/** M16 lead record body: header, stage progress (entry rules), next task, qualify, convert (only once qualified). */
export function MobileLeadBody({ lead, onStage, onQualify, onConvert }: Props) {
  const { t } = useT();
  const [panel, setPanel] = useState<'qualify' | 'convert' | undefined>();
  const qualified = lead.stage === 'QUALIFIED';
  const next = [...lead.openTasks].sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  return (
    <>
      <header className="screen-header">
        <h1>{lead.name}</h1>
        <StatusChip tone={TEMPERATURE_TONE[lead.temperature]}>{t(`crm.temperature.${lead.temperature}`)}</StatusChip>
      </header>
      <dl className="lead-info">
        <dt>{t('crm.lead.product')}</dt><dd>{t(`crm.product.${lead.productInterest}`)}</dd>
        <dt>{t('crm.lead.source')}</dt><dd>{t(`crm.source.${lead.source}`)}</dd>
      </dl>
      <section aria-label={t('crm.lead.stage')}>
        <StageBar currentStage={lead.stage} stageRules={lead.stageRules} onTransition={onStage} />
      </section>
      {next && (
        <section aria-label={t('crm.lead.nextTask')} className="next-task">
          <h2>{t('crm.lead.nextTask')}</h2>
          <p>{next.title} · {new Date(next.dueAt).toLocaleString()}</p>
        </section>
      )}
      <LeadActions stage={lead.stage} onQualify={() => setPanel(panel === 'qualify' ? undefined : 'qualify')} onConvert={() => setPanel('convert')} />
      {panel === 'qualify' && <QualificationForm qualification={lead.qualification} onSaved={(q) => { setPanel(undefined); onQualify(q); }} />}
      {panel === 'convert' && qualified && <ConvertSheet lead={lead} onConvert={(input) => { setPanel(undefined); onConvert(input); }} />}
    </>
  );
}

/** Qualify while the lead is open; Convert only once qualified, otherwise disabled with the reason. */
function LeadActions({ stage, onQualify, onConvert }: { stage: LeadStage; onQualify(): void; onConvert(): void }) {
  const { t } = useT();
  if (stage === 'CONVERTED') return null;
  const qualified = stage === 'QUALIFIED';
  return (
    <div className="actions">
      {stage !== 'LOST' && <Button variant="secondary" onClick={onQualify}>{t('crm.lead.qualify')}</Button>}
      <Button disabled={!qualified} aria-describedby={qualified ? undefined : 'convert-hint'} onClick={onConvert}>{t('crm.lead.convert')}</Button>
      {!qualified && <p id="convert-hint" className="hint">{t('crm.lead.convert_disabled')}</p>}
    </div>
  );
}
