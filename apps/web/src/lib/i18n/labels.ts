import { useEffect } from 'react';
import { useT } from './i18n';
import { messagesEn } from './messages.en';

export type LabelKind =
  | 'productCategory'
  | 'line'
  | 'leadSource'
  | 'leadStage'
  | 'opportunityStage'
  | 'policyStatus'
  | 'role'
  | 'recordScope'
  | 'servicingType';

/** WP-A3: codes remain unchanged in requests; only their presentation is localised. */
export function useLabel(kind: LabelKind, code: string): string {
  const { t } = useT();
  const key = `labels.${kind}.${code}`;
  const known = Object.hasOwn(messagesEn, key);

  useEffect(() => {
    if (!known && import.meta.env.DEV) {
      // A local diagnostic event keeps development warnings observable without a logging dependency.
      window.dispatchEvent(new CustomEvent('i18n.label.unknown', { detail: { kind, code } }));
    }
  }, [known, kind, code]);

  return known ? t(key) : code;
}



