import { useMemo } from 'react';
import { useApi } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { ApiError } from '../../lib/api/api-error';
import { createBookApi } from './api';

export function useBookApi() {
  const api = useApi();
  return useMemo(() => createBookApi(api), [api]);
}
export function asError(error: unknown): ApiError {
  return error instanceof ApiError ? error : ApiError.network(error instanceof Error ? error : new Error(String(error)));
}
export function BookError({ error }: { error?: ApiError }) {
  const { t } = useT();
  return error ? (
    <div role="alert">
      <h2>{error.status === 403 ? t('book.permission_denied') : error.title}</h2>
      {error.detail && <p>{error.detail}</p>}
      {error.traceId && (
        <p>
          {t('book.reference')} {error.traceId}
        </p>
      )}
    </div>
  ) : null;
}
export function SourceBanner({ source, asOf, confidence }: { source: string; asOf: string; confidence: string }) {
  const { t } = useT();
  return (
    <p className="book-source">
      {t(`book.enum.${source}`)} · {t('book.as_of')} {asOf} · {t('book.confidence')} {t(`book.enum.${confidence}`)}
      <br />
      {t('book.source_disclaimer')}
    </p>
  );
}
export function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
}
