import { useT } from '../../lib/i18n';
import './LoadingSkeleton.css';

export interface LoadingSkeletonProps {
  lines?: number;
}

export function LoadingSkeleton({ lines = 3 }: LoadingSkeletonProps) {
  const { t } = useT();
  return (
    <div className="loading-skeleton" role="progressbar" aria-busy="true" aria-label={t('ds.loading.label')}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" />
      ))}
    </div>
  );
}
