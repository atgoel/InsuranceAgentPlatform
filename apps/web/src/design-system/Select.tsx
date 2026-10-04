import { useId } from 'react';
import { FieldShell } from './FieldShell';
import './Select.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange(value: string): void;
  hideLabel?: boolean;
  id?: string;
}

export function Select({ label, value, options, onChange, hideLabel, id }: SelectProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell id={fieldId} label={label} hideLabel={hideLabel}>
      <select
        id={fieldId}
        className="ds-control ds-select"
        value={value}
        onChange={event => onChange(event.target.value)}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
