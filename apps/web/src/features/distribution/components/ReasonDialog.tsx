import { BottomSheet, Button } from '../../../design-system';
import { useT } from '../../../lib/i18n';

interface ReasonDialogProps {
  isOpen: boolean;
  title: string;
  reason: string;
  onReasonChange: (reason: string) => void;
  onConfirm: () => Promise<void>;
  /** Must be referentially stable: the sheet re-focuses itself whenever it changes. */
  onCancel: () => void;
  isLoading?: boolean;
  error?: string;
}

export function ReasonDialog({ isOpen, title, reason, onReasonChange, onConfirm, onCancel, isLoading, error }: ReasonDialogProps) {
  const { t } = useT();
  return (
    <BottomSheet open={isOpen} title={title} onClose={onCancel}>
      <div className="member-action-form">
        <div className="form-field">
          <label htmlFor="reason-dialog-reason">{t('distribution.reason.label')}</label>
          <textarea
            id="reason-dialog-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder={t('distribution.reason.label')}
            minLength={3}
            maxLength={200}
          />
        </div>
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <Button onClick={onConfirm} disabled={isLoading || reason.trim().length < 3} variant="primary" size="md">
            {isLoading ? t('distribution.reason.working') : t('distribution.reason.confirm')}
          </Button>
          <Button onClick={onCancel} variant="secondary" size="md">
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
