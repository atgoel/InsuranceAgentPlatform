import { BottomSheet, Button } from '../../../design-system';

interface ReasonDialogProps {
  isOpen: boolean;
  title: string;
  reason: string;
  onReasonChange: (reason: string) => void;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ReasonDialog({
  isOpen,
  title,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
  isLoading,
}: ReasonDialogProps) {
  return (
    <BottomSheet open={isOpen} title={title} onClose={onCancel}>
      <div className="member-action-form">
        <div className="form-field">
          <label>Reason</label>
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Reason"
            minLength={3}
            maxLength={200}
          />
        </div>

        <div className="form-actions">
          <Button
            onClick={onConfirm}
            disabled={isLoading || !reason.trim()}
            variant="primary"
            size="md"
          >
            {isLoading ? 'Loading...' : 'Confirm'}
          </Button>
          <Button onClick={onCancel} variant="secondary" size="md">
            Cancel
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
