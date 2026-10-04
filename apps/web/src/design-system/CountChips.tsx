import './CountChips.css';

export interface CountChipOption {
  id: string;
  label: string;
  count?: number;
}

export interface CountChipsProps {
  options: CountChipOption[];
  selected: string;
  onChange(id: string): void;
  ariaLabel: string;
}

export function CountChips({ options, selected, onChange, ariaLabel }: CountChipsProps) {
  return (
    <div className="count-chips" role="group" aria-label={ariaLabel}>
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          className="count-chip"
          aria-pressed={option.id === selected}
          onClick={() => onChange(option.id)}
        >
          {option.label}
          {option.count !== undefined && <span className="count-chip-badge">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}
