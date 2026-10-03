import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../../../lib/api';
import { FilterChips, LoadingSkeleton, ErrorState, PermissionDenied, Tabs } from '../../../design-system';
import { ResearchCard } from '../components/ResearchCard';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCatalogueApi, type ResearchItem, type LineOfBusiness } from '../api';
import { asLine, lineChipOptions } from '../lines';
import '../styles/ResearchLibraryScreen.css';

export function ResearchLibraryScreen() {
  const api = useApi();
  const catalogueApi = useMemo(() => createCatalogueApi(api), [api]);
  const { t } = useT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [items, setItems] = useState<ResearchItem[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string>(() => asLine(searchParams.get('line')) ?? 'all');
  // The query is applied on submit, so typing neither refetches per keystroke nor unmounts the input.
  const [draftQuery, setDraftQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('library');

  const selectedLine = asLine(selectedLineId);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        setLoading(true);
        setError(undefined);
        const result = await catalogueApi.listResearch({
          line: selectedLine,
          q: searchQuery || undefined,
        });
        if (!cancelled) {
          setItems(result.items);
        }
      } catch (err) {
        if (!cancelled && err instanceof ApiError) {
          setError(err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    loadData();
    return () => {
      cancelled = true;
    };
  }, [catalogueApi, selectedLine, searchQuery]);

  const handleCompare = (line: LineOfBusiness) => {
    navigate(`/m/compare?line=${line}`);
  };

  if (loading && items.length === 0 && !searchQuery) {
    return <LoadingSkeleton />;
  }

  if (error) {
    if (error.status === 403) {
      return <PermissionDenied />;
    }
    return <ErrorState error={error} />;
  }

  return (
    <div className="research-library-screen">
      <div className="page-header">
        <div>
          <h1>{t('catalogue.research.title')}</h1>
          <p>{t('catalogue.research.subtitle')}</p>
        </div>
      </div>

      <FilterChips
        options={lineChipOptions(t)}
        selected={[selectedLineId]}
        onChange={(ids) => setSelectedLineId(ids[0] || 'all')}
      />

      <Tabs
        tabs={[
          { id: 'library', label: t('catalogue.research.tab_library') },
          { id: 'assistant', label: t('catalogue.research.tab_assistant') },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'library' && (
        <div className="research-library">
          <form
            className="search-section"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              setSearchQuery(draftQuery.trim());
            }}
          >
            <input
              type="search"
              aria-label={t('catalogue.research.search_placeholder')}
              placeholder={t('catalogue.research.search_placeholder')}
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              className="search-input"
            />
          </form>

          {items.length === 0 ? (
            <div className="empty-research">
              <p>{t('catalogue.research.no_items')}</p>
            </div>
          ) : (
            <div className="research-cards">
              {items.map((item) => (
                <ResearchCard key={item.versionId} item={item} onCompare={handleCompare} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'assistant' && (
        <div className="assistant-section">
          <p>{t('catalogue.research.coming_later')}</p>
        </div>
      )}
    </div>
  );
}
