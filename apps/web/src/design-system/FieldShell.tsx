import type { ReactNode } from 'react';
import './FieldShell.css';

export interface FieldShellProps {
  id: string;
  label: string;
  hideLabel?: boolean;
  children: ReactNode;
}

export function FieldShell({ id, label, hideLabel = false, children }: FieldShellProps) {
  const labelClass = hideLabel ? 'ds-field-label sr-only' : 'ds-field-label';
  return (
    <div className="ds-field">
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}
