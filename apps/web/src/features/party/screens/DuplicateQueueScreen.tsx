import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingSkeleton, PageContainer, PageHeader, PermissionDenied } from '../../../design-system';
import { useApi } from '../../../lib/api';
import { useT } from '../../../lib/i18n';
import { createPartyApi } from '../api';
import { DuplicateComparison } from '../components/DuplicateComparison';
import { DuplicateQueueList } from '../components/DuplicateQueueList';
import { useDuplicateQueue, useDuplicateReview, type DuplicateQueueState } from '../useDuplicateQueue';
import '../styles/party-frame.css';
import '../styles/DuplicateQueueScreen.css';

function QueueBody({ queue, children }: { queue: DuplicateQueueState; children: ReactNode }) {
  const { t } = useT();

  if (queue.error) {
    return <ErrorState error={queue.error} onRetry={queue.reload} />;
  }
  if (queue.loading) {
    return <LoadingSkeleton />;
  }
  if (queue.items.length === 0) {
    return <EmptyState title={t('party.duplicates.empty')} />;
  }
  return <>{children}</>;
}

/** CRM08 duplicate queue (M03 frontend row `/crm/import/duplicates`): compare, choose surviving values, merge or dismiss. */
export function DuplicateQueueScreen() {
  const api = useApi();
  const partyApi = useMemo(() => createPartyApi(api), [api]);
  const { t } = useT();
  const queue = useDuplicateQueue(partyApi);
  const review = useDuplicateReview(partyApi, queue.reload, t('common.error'));

  if (queue.error?.status === 403) {
    return <PermissionDenied />;
  }

  return (
    <div className="party-screen-frame">
      <PageContainer width="wide">
        <PageHeader title={t('party.duplicates.page_title')} subtitle={t('party.duplicates.page_subtitle')} />
        <nav className="import-tabs" aria-label={t('party.duplicates.tabs')}>
          <Link to="/crm/import">{t('party.duplicates.import_tab')}</Link>
          <span aria-current="page">{t('party.duplicates.queue_tab')}</span>
        </nav>
        {review.failure && !review.review && (
          <p role="alert" className="comparison-error">
            {t('party.duplicates.action_failed', { reason: review.failure })}
          </p>
        )}
        <QueueBody queue={queue}>
          <div className="duplicates-layout">
            <DuplicateQueueList
              items={queue.items}
              activeId={review.review?.candidateId}
              busy={review.busy !== undefined}
              onCompare={(item) => review.open(item.id)}
            />
            {review.review && (
              <DuplicateComparison
                key={review.review.candidateId}
                comparison={review.review.comparison}
                choices={review.review.choices}
                busy={review.busy}
                failure={review.failure}
                onChoose={review.choose}
                onMerge={review.merge}
                onDismiss={review.dismiss}
                onClose={review.close}
              />
            )}
          </div>
        </QueueBody>
      </PageContainer>
    </div>
  );
}
