import { Button } from '../../../design-system';
import { useT } from '../../../lib/i18n';

interface HouseholdPanelProps {
  displayName: string;
  householdName?: string;
  roles?: string[];
  onClose: () => void;
  onOpenRecord: () => void;
}

export function HouseholdPanel({
  displayName,
  householdName,
  roles,
  onClose,
  onOpenRecord,
}: HouseholdPanelProps) {
  const { t } = useT();

  return (
    <div className="household-panel" role="complementary" aria-label="Household details">
      <div className="panel-header">
        <h3>{displayName}</h3>
        <button
          className="close-button"
          onClick={onClose}
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      <div className="panel-content">
        {householdName && (
          <div className="panel-section">
            <label>{t('party.customers.household_label')}</label>
            <p>{householdName}</p>
          </div>
        )}

        {roles && roles.length > 0 && (
          <div className="panel-section">
            <label>{t('party.customers.roles_label')}</label>
            <ul>
              {roles.map((role, idx) => (
                <li key={idx}>{role}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="panel-actions">
        <Button variant="primary" onClick={onOpenRecord}>
          {t('party.customers.open_full_record')}
        </Button>
      </div>
    </div>
  );
}
