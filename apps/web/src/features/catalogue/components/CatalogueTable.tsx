import { useState, useMemo, useEffect } from 'react';
import { useApi } from '../../../lib/api';
import { DataGrid, FilterChips, StatusChip, LoadingSkeleton, ErrorState, PermissionDenied } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCatalogueApi, type CatalogueRow } from '../api';
import { asLine, lineChipOptions } from '../lines';
import '../styles/CatalogueTable.css';


export function CatalogueTable() {
  const api = useApi();
  const catalogueApi = useMemo(() => createCatalogueApi(api), [api]);
  const { t } = useT();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [rows, setRows] = useState<CatalogueRow[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string>('all');

  const selectedLine = asLine(selectedLineId);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        setLoading(true);
        setError(undefined);
        const result = await catalogueApi.listProducts({ line: selectedLine });
        if (!cancelled) {
          setRows(result.items);
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
  }, [catalogueApi, selectedLine]);

  const getStatusChip = (row: CatalogueRow) => {
    if (row.inScope) {
      return <StatusChip tone="ok">{t('catalogue.status.in_scope')}</StatusChip>;
    }
    if (row.exclusion === 'insurer_not_tied') {
      return <StatusChip tone="warn">{t('catalogue.status.not_tied')}</StatusChip>;
    }
    if (row.status === 'withdrawn') {
      return <StatusChip tone="bad">{t('catalogue.status.withdrawn')}</StatusChip>;
    }
    return <StatusChip tone="bad">{t('catalogue.status.not_in_scope')}</StatusChip>;
  };

  const getPosPEligible = (posEligible: boolean) => {
    return posEligible ? '✓' : '–';
  };

  if (loading && rows.length === 0) {
    return <LoadingSkeleton />;
  }

  if (error) {
    if (error.status === 403) {
      return <PermissionDenied />;
    }
    return <ErrorState error={error} />;
  }

  return (
    <div className="catalogue-table">
      <div className="table-header">
        <div>
          <p className="table-subtitle">{t('catalogue.table.subtitle')}</p>
        </div>
      </div>

      <FilterChips
        options={lineChipOptions(t)}
        selected={[selectedLineId]}
        onChange={(ids) => setSelectedLineId(ids[0] || 'all')}
      />

      <DataGrid
        columns={[
          { header: t('catalogue.column.product'), key: 'productName' },
          { header: t('catalogue.column.insurer'), key: 'insurerName' },
          { header: t('catalogue.column.line'), key: 'line' },
          { header: t('catalogue.column.uin'), key: 'uin' },
          {
            header: t('catalogue.column.isp'),
            key: 'ispEligible',
            render: (row) => getPosPEligible(row.ispEligible),
          },
          {
            header: t('catalogue.column.posp'),
            key: 'posEligible',
            render: (row) => getPosPEligible(row.posEligible),
          },
          { header: t('catalogue.column.wording'), key: 'wordingVersion' },
          {
            header: t('catalogue.column.status'),
            key: 'status',
            render: (row) => getStatusChip(row),
          },
        ]}
        rows={rows}
        rowKey={(row) => row.versionId}
      />
    </div>
  );
}
