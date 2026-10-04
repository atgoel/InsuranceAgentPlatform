import { useState } from 'react';
import { BottomSheet, Button, Select, type SelectOption } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { LostReason } from '../api';
import { LOST_REASONS } from './lost-reasons';

interface LostReasonSheetProps {
  /** The opportunity title, or undefined when the sheet is closed. */
  title?: string;
  onCancel: () => void;
  onConfirm: (reason: LostReason) => void;
}

/** Required-reason sheet for marking an opportunity lost (AC-M04-27). */
export function LostReasonSheet({ title, onCancel, onConfirm }: LostReasonSheetProps) {
  const { t } = useT();
  const [reason, setReason] = useState('');
  const options: SelectOption[] = [
    { value: '', label: t('crm.pipeline.select_reason') },
    ...LOST_REASONS.map((r) => ({ value: r, label: t(`crm.lostReason.${r}`) })),
  ];

  return (
    <BottomSheet open={title !== undefined} title={t('crm.pipeline.lost_title', { title: title ?? '' })} onClose={onCancel}>
      <div className="lost-sheet">
        <Select label={t('crm.pipeline.reason_label')} value={reason} options={options} onChange={setReason} />
        <div className="lost-sheet-actions">
          <Button variant="danger" disabled={!reason} onClick={() => onConfirm(reason as LostReason)}>
            {t('crm.pipeline.confirm_lost')}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
