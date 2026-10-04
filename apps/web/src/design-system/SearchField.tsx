import { useId } from 'react';
import { FieldShell } from './FieldShell';
import './SearchField.css';

export interface SearchFieldProps {
  label: string;
  value: string;
  onChange(value: string): void;
  placeholder?: string;
}

function MagnifierIcon() {
  return (
    <svg className="ds-search-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function SearchField({ label, value, onChange, placeholder }: SearchFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label}>
      <div className="ds-search">
        <MagnifierIcon />
        <input
          id={id}
          type="search"
          className="ds-control ds-search-input"
          value={value}
          placeholder={placeholder}
          onChange={event => onChange(event.target.value)}
        />
      </div>
    </FieldShell>
  );
}
