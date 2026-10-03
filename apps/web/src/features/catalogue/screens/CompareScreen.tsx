import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../../../lib/api';
import { LoadingSkeleton, ErrorState, PermissionDenied } from '../../../design-system';
import { PlanCard } from '../components/PlanCard';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCatalogueApi, type ScopedVersion, type VersionDetail } from '../api';
import { asLine } from '../lines';
import '../styles/CompareScreen.css';

export function CompareScreen() {
  const api = useApi();
  const catalogueApi = useMemo(() => createCatalogueApi(api), [api]);
  const { t } = useT();
  const [searchParams] = useSearchParams();

  const line = asLine(searchParams.get('line'));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [versions, setVersions] = useState<ScopedVersion[]>([]);
  const [disclosure, setDisclosure] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>();
  const [versionDetails, setVersionDetails] = useState<Map<string, VersionDetail>>(new Map());
  const [expandedVersionId, setExpandedVersionId] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        setLoading(true);
        setError(undefined);
        const result = await catalogueApi.evaluateScope({
          line,
        });
        if (!cancelled) {
          setVersions(result.versions);
          setDisclosure(result.disclosure);
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
  }, [catalogueApi, line]);

  // Load version details when expanded
  useEffect(() => {
    if (!expandedVersionId) return;

    let cancelled = false;
    const loadVersionDetail = async () => {
      try {
        const detail = await catalogueApi.getVersion(expandedVersionId);
        if (!cancelled) {
          setVersionDetails((prev) => new Map(prev).set(expandedVersionId, detail));
        }
      } catch {
        // Key facts are optional on the card; the plan stays selectable without them.
      }
    };

    // Only load if not already loaded
    if (!versionDetails.has(expandedVersionId)) {
      loadVersionDetail();
    }

    return () => {
      cancelled = true;
    };
  }, [expandedVersionId, catalogueApi, versionDetails]);

  const handleSelectVersion = (versionId: string) => {
    setSelectedVersionId(selectedVersionId === versionId ? undefined : versionId);
    setExpandedVersionId(versionId);
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    if (error.status === 403) {
      return <PermissionDenied />;
    }
    return <ErrorState error={error} />;
  }

  return (
    <div className="compare-screen">
      <div className="page-header">
        <div>
          <h1>{t('catalogue.compare.title')}</h1>
        </div>
      </div>

      {disclosure && (
        <div className="disclosure-section">
          <p className="disclosure-text">{disclosure}</p>
          <p className="disclosure-caption">{t('catalogue.compare.disclosure_caption')}</p>
        </div>
      )}

      {versions.length === 0 ? (
        <div className="empty-compare">
          <p>{t('catalogue.compare.no_plans')}</p>
        </div>
      ) : (
        <div className="compare-cards">
          {versions.map((version) => (
            <PlanCard
              key={version.versionId}
              version={version}
              selected={selectedVersionId === version.versionId}
              detail={expandedVersionId === version.versionId ? versionDetails.get(version.versionId) : undefined}
              onToggle={handleSelectVersion}
            />
          ))}
        </div>
      )}
    </div>
  );
}
