import { useLocation } from 'react-router-dom';
import { messagesEn } from '../../lib/i18n/messages.en';

export type PartyLabelGroup = 'role' | 'language' | 'preferredChannel' | 'purpose' | 'consentChannel' | 'relation' | 'field' | 'rule' | 'source';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Codes stay unchanged in requests; only their presentation is localised. An unknown code is shown as received. */
export function partyLabel(t: Translate, group: PartyLabelGroup, code: string): string {
  const key = `party.${group}.${code}`;
  return Object.hasOwn(messagesEn, key) ? t(key) : code;
}

const SUMMARY_SEPARATOR = ' · ';

/** `rolesSummary` entries read `ROLE` or `ROLE · policy label`; only the role code is translated. */
export function roleSummaryText(t: Translate, summary: string): string {
  const at = summary.indexOf(SUMMARY_SEPARATOR);
  if (at < 0) {
    return partyLabel(t, 'role', summary);
  }
  const rest = summary.slice(at + SUMMARY_SEPARATOR.length);
  return `${partyLabel(t, 'role', summary.slice(0, at))}${SUMMARY_SEPARATOR}${rest}`;
}

/** The customer screens are shown under /crm (desktop) and under /m (phone shell, D6); links stay inside the current shell. */
export function usePartyBase(): '/crm' | '/m' {
  const { pathname } = useLocation();
  return pathname.startsWith('/m/') ? '/m' : '/crm';
}
