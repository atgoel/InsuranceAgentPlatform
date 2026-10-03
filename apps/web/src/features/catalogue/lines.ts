import type { FilterOption } from '../../design-system';
import type { LineOfBusiness } from './api';

export const LINES: readonly LineOfBusiness[] = ['LIFE', 'HEALTH', 'GENERAL'];

/** Narrows an untrusted value (URL, chip id) to a line of business; anything else means "all lines". */
export function asLine(value: string | null | undefined): LineOfBusiness | undefined {
  return LINES.find((l) => l === value);
}

/** Line chips shared by the catalogue table and the research library. */
export function lineChipOptions(t: (key: string) => string): FilterOption[] {
  return [
    { id: 'all', label: t('catalogue.line.all') },
    { id: 'LIFE', label: t('catalogue.line.life') },
    { id: 'HEALTH', label: t('catalogue.line.health') },
    { id: 'GENERAL', label: t('catalogue.line.general') },
  ];
}
