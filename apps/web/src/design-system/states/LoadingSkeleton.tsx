import './LoadingSkeleton.css';

export interface LoadingSkeletonProps {
  lines?: number;
}

export function LoadingSkeleton({ lines = 3 }: LoadingSkeletonProps) {
  return (
    <div className="loading-skeleton" role="progressbar" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" />
      ))}
    </div>
  );
}
