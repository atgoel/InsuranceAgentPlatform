import './ConsentCheckbox.css';

export interface ConsentCheckboxProps {
  purpose: string;
  noticeVersion: string;
  checked: boolean;
  onChange(checked: boolean): void;
  label: string;
}

export function ConsentCheckbox({
  noticeVersion,
  checked,
  onChange,
  label,
}: ConsentCheckboxProps) {
  return (
    <label className="consent-checkbox">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="consent-text">
        {label}
        <span className="consent-notice">Notice v{noticeVersion}</span>
      </span>
    </label>
  );
}
