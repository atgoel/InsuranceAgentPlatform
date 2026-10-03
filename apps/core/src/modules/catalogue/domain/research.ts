import type { ProductVersionProps } from './product-version';

// Re-export for tests
export type { ProductVersionProps };

export interface ResearchSummary {
  versionId: string;
  summary: string;
  points: string[];
  sourceRef: string;
  sourceDate: string;
  reviewedWordingVersion: string;
  reviewedAt: string;
}

export function isStale(
  summary: ResearchSummary,
  version: ProductVersionProps,
  today: Date
): { stale: boolean; reason?: 'wording_changed' | 'older_than_365_days' } {
  // Check if wording changed
  if (summary.reviewedWordingVersion !== version.wordingVersion) {
    return { stale: true, reason: 'wording_changed' };
  }

  // Check if review is older than 365 days
  const reviewDate = new Date(summary.reviewedAt);
  const daysDifference = (today.getTime() - reviewDate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysDifference > 365) {
    return { stale: true, reason: 'older_than_365_days' };
  }

  return { stale: false };
}
