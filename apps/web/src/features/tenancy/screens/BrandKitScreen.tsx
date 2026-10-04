import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../../../lib/api';
import { Button, LoadingSkeleton, ErrorState, PageContainer, PageHeader, PermissionDenied } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createTenancyApi, type BrandKitProps } from '../api';
import { contrastRatio } from '../contrast';
import { BrandKitForm } from '../components/BrandKitForm';
import { BrandPreview } from '../components/BrandPreview';
import '../styles/BrandKitScreen.css';

const MIN_CONTRAST = 4.5;

const INITIAL: BrandKitProps = {
  brandName: '',
  primary: '#1F5FBF',
  secondary: '#163F7F',
  typeface: 'IBM Plex Sans',
  poweredByVisible: true,
};

function toProps(kit: BrandKitProps): BrandKitProps {
  return {
    brandName: kit.brandName,
    primary: kit.primary,
    secondary: kit.secondary,
    typeface: kit.typeface,
    logoRef: kit.logoRef,
    poweredByVisible: kit.poweredByVisible,
  };
}

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : ApiError.network(err instanceof Error ? err : new Error(String(err)));
}

export function BrandKitScreen() {
  const api = useApi();
  const tenancyApi = useMemo(() => createTenancyApi(api), [api]);
  const { t } = useT();

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<ApiError | undefined>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [formData, setFormData] = useState<BrandKitProps>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    tenancyApi
      .getBrandKit()
      .then((kit) => {
        if (cancelled) return;
        setFormData(toProps(kit));
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(asApiError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [tenancyApi]);

  const hasContrastWarning = contrastRatio(formData.primary, '#FFFFFF') < MIN_CONTRAST;

  const handleChange = (next: BrandKitProps) => {
    setFormData(next);
    setSaved(false);
  };

  const handleSave = async () => {
    if (hasContrastWarning) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      await tenancyApi.updateBrandKit(formData);
      setSaved(true);
    } catch (err) {
      setSaveError(asApiError(err).title);
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return loadError.status === 403 ? <PermissionDenied /> : <ErrorState error={loadError} />;
  }
  if (!loaded) return <LoadingSkeleton />;

  return (
    <PageContainer>
      <PageHeader
        title={t('tenancy.brand.title')}
        subtitle={t('tenancy.brand.description')}
        actions={
          <Button onClick={handleSave} loading={saving} disabled={hasContrastWarning} size="lg">
            {t('common.save')}
          </Button>
        }
      />
      {saveError && (
        <p role="alert" className="brand-error">
          {saveError}
        </p>
      )}
      {saved && (
        <p role="status" className="brand-saved">
          {t('tenancy.brand.saved')}
        </p>
      )}
      <div className="brand-kit-grid">
        <BrandKitForm value={formData} onChange={handleChange} />
        <BrandPreview value={formData} />
      </div>
    </PageContainer>
  );
}
