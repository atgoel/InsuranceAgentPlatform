import type { ReactNode } from 'react';

export interface FieldRowProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children(props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }): ReactNode;
}

/** A labelled control with its inline error; the error is announced and linked to the control. */
export function FieldRow({ id, label, error, hint, children }: FieldRowProps) {
  const errorId = `${id}-error`;
  return (
    <div className="advice-field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': error ? errorId : undefined })}
      {hint && <span className="advice-hint">{hint}</span>}
      {error && (
        <span id={errorId} className="advice-field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
