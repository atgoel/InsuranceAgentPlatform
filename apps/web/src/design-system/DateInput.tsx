import { useId } from 'react';
import { FieldShell } from './FieldShell';

export interface DateInputProps {
  label: string;
  value: string;
  onChange(value: string): void;
  min?: string;
  max?: string;
  hideLabel?: boolean;
}

export function DateInput({ label, value, onChange, min, max, hideLabel }: DateInputProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hideLabel={hideLabel}>
      <input
        id={id}
        type="date"
        className="ds-control"
        value={value}
        min={min}
        max={max}
        onChange={event => onChange(event.target.value)}
      />
    </FieldShell>
  );
}
