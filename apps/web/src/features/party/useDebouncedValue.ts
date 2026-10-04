import { useEffect, useState } from 'react';

const DEBOUNCE_MS = 250;

/** The committed value follows the typed value after a short pause, so typing never reloads a list per key. */
export function useDebouncedValue(value: string): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  return debounced;
}
