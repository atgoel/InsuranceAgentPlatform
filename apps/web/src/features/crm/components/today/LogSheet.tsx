import { useState } from 'react';
import { BottomSheet, Button } from '../../../../design-system';
import { useT } from '../../../../lib/i18n';
import type { CallOutcome } from '../../api';
import type { QueuedKind } from '../../offline/log-queue';

const KINDS: QueuedKind[] = ['CALL', 'WHATSAPP', 'NOTE'];
const OUTCOMES: CallOutcome[] = ['CONNECTED', 'NO_ANSWER', 'CALL_BACK', 'WRONG_NUMBER', 'NOT_INTERESTED'];

interface LogSheetProps {
  title: string;
  onClose(): void;
  onLog(entry: { kind: QueuedKind; outcome?: CallOutcome }): void;
}

/** Quick log for a lead: what happened (call / WhatsApp / note) and, for calls, the outcome. */
export function LogSheet({ title, onClose, onLog }: LogSheetProps) {
  const { t } = useT();
  const [kind, setKind] = useState<QueuedKind>('CALL');
  const [outcome, setOutcome] = useState<CallOutcome | undefined>();
  const ready = kind !== 'CALL' || outcome !== undefined;
  return (
    <BottomSheet open title={t('today.log_title', { name: title })} onClose={onClose}>
      <div role="group" aria-label={t('today.log_kind')} className="chip-row">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className="chip"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              setOutcome(undefined);
            }}
          >
            {t(`today.kind.${k}`)}
          </button>
        ))}
      </div>
      {kind === 'CALL' && (
        <div role="group" aria-label={t('today.log_outcome')} className="chip-row">
          {OUTCOMES.map((o) => (
            <button key={o} type="button" className="chip" aria-pressed={outcome === o} onClick={() => setOutcome(o)}>
              {t(`crm.outcome.${o}`)}
            </button>
          ))}
        </div>
      )}
      <Button disabled={!ready} onClick={() => onLog({ kind, outcome })}>
        {t('today.log_save')}
      </Button>
    </BottomSheet>
  );
}
