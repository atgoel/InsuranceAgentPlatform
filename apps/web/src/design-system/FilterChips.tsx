import './FilterChips.css';

export interface FilterOption {
  id: string;
  label: string;
  count?: number;
}

export interface FilterChipsProps {
  options: FilterOption[];
  selected: string[];
  onChange(ids: string[]): void;
  multi?: boolean;
}

export function FilterChips({ options, selected, onChange, multi = false }: FilterChipsProps) {
  const handleClick = (id: string) => {
    if (multi) {
      onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
    } else {
      onChange(selected.includes(id) ? [] : [id]);
    }
  };

  return (
    <div className="filter-chips">
      {options.map(option => (
        <button
          key={option.id}
          className="filter-chip"
          onClick={() => handleClick(option.id)}
          aria-pressed={selected.includes(option.id)}
        >
          {option.label}
          {option.count !== undefined && <span className="chip-count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}
