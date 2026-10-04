import { useId } from 'react';
import { FieldShell } from './FieldShell';

export interface MonthInputProps {
  label: string;
  value: string;
  onChange(value: string): void;
  hideLabel?: boolean;
}

export function MonthInput({ label, value, onChange, hideLabel }: MonthInputProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hideLabel={hideLabel}>
      <input
        id={id}
        type="month"
        className="ds-control"
        value={value}
        onChange={event => onChange(event.target.value)}
      />
    </FieldShell>
  );
}
