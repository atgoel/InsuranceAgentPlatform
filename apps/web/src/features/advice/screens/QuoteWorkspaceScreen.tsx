import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../../../lib/api';
import { Button, ErrorState, LoadingSkeleton, PermissionDenied } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { formatDate } from '../../../lib/format';
import { createCatalogueApi, type CatalogueApi, type LineOfBusiness } from '../../catalogue/api';
import { asLine } from '../../catalogue/lines';
import { createAdviceApi, type BiMethod, type OptionInput, type QuoteView } from '../api';
import { AddOptionForm } from '../components/AddOptionForm';
import { ComparisonGrid } from '../components/ComparisonGrid';
import { InlineError } from '../components/InlineError';
import { OptionCard } from '../components/OptionCard';
import type { ProductChoice } from '../components/ProductSelect';
import '../styles/advice.css';

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    // Copying is a convenience; the link stays visible on screen.
  }
}

/** In-scope products for the quote's line, from the M05 catalogue. */
function useInScopeProducts(
  catalogueApi: CatalogueApi,
  quoteId: string | undefined,
  line: LineOfBusiness | undefined,
  onError: (title: string) => void,
): ProductChoice[] {
  const [products, setProducts] = useState<ProductChoice[]>([]);
  useEffect(() => {
    if (!quoteId) return;
    let cancelled = false;
    catalogueApi
      .listProducts({ line })
      .then((r) => {
        if (!cancelled) setProducts(r.items.filter((p) => p.inScope));
      })
      .catch((err: unknown) => {
        if (!cancelled && err instanceof ApiError) onError(err.title);
      });
    return () => {
      cancelled = true;
    };
  }, [catalogueApi, quoteId, line, onError]);
  return products;
}

export function QuoteWorkspaceScreen() {
  const api = useApi();
  const adviceApi = useMemo(() => createAdviceApi(api), [api]);
  const catalogueApi = useMemo(() => createCatalogueApi(api), [api]);
  const { t } = useT();
  const { id: opportunityId } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | undefined>();
  const [quote, setQuote] = useState<QuoteView | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState<{ url: string; expiresAt: string } | undefined>();

  useEffect(() => {
    if (!opportunityId) return;
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setLoadError(undefined);
        const result = await adviceApi.listQuotes(opportunityId);
        if (!cancelled) setQuote(result.items[0]);
      } catch (err) {
        if (!cancelled && err instanceof ApiError) setLoadError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [adviceApi, opportunityId]);

  const products = useInScopeProducts(catalogueApi, quote?.id, quote ? asLine(quote.line) : undefined, setActionError);

  /** Runs an action; a failure is shown inline and the workspace stays on screen. Resolves true on success. */
  const act = useCallback(async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setActionError(undefined);
    try {
      await fn();
      return true;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      setActionError(err.title);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (loadError) return loadError.status === 403 ? <PermissionDenied /> : <ErrorState error={loadError} />;

  const start = () => act(async () => setQuote(await adviceApi.createQuote(opportunityId ?? '')));

  if (!quote) {
    return (
      <div className="advice-screen">
        <h1>{t('advice.quote.title')}</h1>
        <InlineError message={actionError} />
        <p>{t('advice.quote.none')}</p>
        <Button loading={busy} onClick={start}>
          {t('advice.quote.start')}
        </Button>
      </div>
    );
  }

  const refresh = () => adviceApi.getQuote(quote.id).then(setQuote);
  const addOption = (option: OptionInput) => act(async () => setQuote(await adviceApi.addOption(quote.id, option)));
  const remove = (optionId: string) =>
    act(async () => {
      await adviceApi.removeOption(quote.id, optionId);
      await refresh();
    });
  const select = (optionId: string) => act(async () => setQuote(await adviceApi.select(quote.id, optionId)));
  const attach = (optionId: string, documentRef: string, version: string) =>
    act(async () => {
      await adviceApi.attachBi(optionId, documentRef, version);
      await refresh();
    });
  const acknowledge = (biId: string, method: BiMethod, evidence?: string) =>
    act(async () => {
      await adviceApi.acknowledgeBi(biId, method, evidence);
      await refresh();
    });
  const doShare = () =>
    act(async () => {
      const issued = await adviceApi.share(quote.id);
      setShare(issued);
      await copyToClipboard(issued.url);
    });

  return (
    <div className="advice-screen">
      <h1>{t('advice.quote.title')}</h1>
      <p className="advice-banner" role="note">
        {quote.disclosure}
      </p>
      <InlineError message={actionError} />
      <ComparisonGrid quote={quote} />
      <div className="advice-row">
        <Button variant="secondary" loading={busy} onClick={doShare}>
          {t('advice.quote.share')}
        </Button>
      </div>
      {share && <p role="status">{t('advice.quote.share_link', { url: share.url, date: formatDate(new Date(share.expiresAt)) })}</p>}
      {quote.options.map((o) => (
        <OptionCard
          key={o.id}
          option={o}
          selected={quote.selectedOptionId === o.id}
          busy={busy}
          onSelect={select}
          onRemove={remove}
          onAttach={attach}
          onAcknowledge={acknowledge}
        />
      ))}
      <AddOptionForm products={products} busy={busy} onAdd={addOption} />
    </div>
  );
}
