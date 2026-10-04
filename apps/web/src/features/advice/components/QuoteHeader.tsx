import { PageHeader } from '../../../design-system';
import { useLabel } from '../../../lib/i18n/labels';
import { useT } from '../../../lib/i18n';
import type { QuoteView } from '../api';

/** Page title with the quote's line and status, both shown as labels (never raw codes). */
export function QuoteHeader({ quote }: { quote?: QuoteView }) {
  const { t } = useT();
  const line = useLabel('line', quote?.line ?? 'OTHER');
  const subtitle = quote ? `${line} · ${t(`advice.quote.status.${quote.status}`)}` : t('advice.quote.subtitle');
  return <PageHeader title={t('advice.quote.title')} subtitle={subtitle} />;
}
