import { useState, useEffect } from 'react';
import { useApi } from '../../../lib/api';
import { Button, Card, LoadingSkeleton, ErrorState, PermissionDenied } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createTenancyApi, BrandKitResponse, BrandKitProps } from '../api';
import { contrastRatio } from '../contrast';
import '../styles/BrandKitScreen.css';

const APPROVED_TYPEFACES = ['IBM Plex Sans', 'Noto Sans', 'Mukta'] as const;

export function BrandKitScreen() {
  const api = useApi();
  const tenancyApi = createTenancyApi(api);
  const { t } = useT();

  const [brandKit, setBrandKit] = useState<BrandKitResponse | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState<BrandKitProps>({
    brandName: '',
    primary: '#1F5FBF',
    secondary: '#163F7F',
    typeface: 'IBM Plex Sans',
    poweredByVisible: true,
  });

  useEffect(() => {
    const loadBrandKit = async () => {
      try {
        setLoading(true);
        const kit = await tenancyApi.getBrandKit();
        setBrandKit(kit);
        setFormData({
          brandName: kit.brandName,
          primary: kit.primary,
          secondary: kit.secondary,
          typeface: kit.typeface as 'IBM Plex Sans' | 'Noto Sans' | 'Mukta',
          logoRef: kit.logoRef,
          poweredByVisible: kit.poweredByVisible,
        });
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    };

    loadBrandKit();
  }, []);

  // Live contrast check
  const ratio = contrastRatio(formData.primary, '#FFFFFF');
  const hasContrastWarning = ratio < 4.5;

  const handleSave = async () => {
    if (hasContrastWarning) return;

    setSaving(true);
    try {
      const updated = await tenancyApi.updateBrandKit(formData);
      setBrandKit(updated);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err);
      }
    } finally {
      setSaving(false);
    }
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
    <div className="brand-kit-screen">
      <div className="page-header">
        <div>
          <h1>{t('tenancy.brand.title')}</h1>
          <p>{t('tenancy.brand.description')}</p>
        </div>
        <Button
          onClick={handleSave}
          loading={saving}
          disabled={hasContrastWarning}
          size="lg"
        >
          {t('common.save')}
        </Button>
      </div>

      <div className="brand-kit-grid">
        <Card title={t('tenancy.brand.settings')}>
          <div className="form-section">
            <label>
              <span className="label-text">{t('tenancy.brand.name')}</span>
              <input
                type="text"
                value={formData.brandName}
                onChange={e => setFormData({ ...formData, brandName: e.target.value })}
              />
            </label>

            <label>
              <span className="label-text">{t('tenancy.brand.primary_colour')}</span>
              <div className="colour-input">
                <input
                  type="color"
                  value={formData.primary}
                  onChange={e => setFormData({ ...formData, primary: e.target.value })}
                />
                <input
                  type="text"
                  value={formData.primary}
                  onChange={e => setFormData({ ...formData, primary: e.target.value })}
                />
              </div>
              <div className="contrast-info">
                <span>{t('tenancy.brand.contrast')}: {ratio.toFixed(2)}:1</span>
                {hasContrastWarning && (
                  <span className="contrast-warning">
                    {t('tenancy.brand.contrast_warning')}
                  </span>
                )}
              </div>
            </label>

            <label>
              <span className="label-text">{t('tenancy.brand.secondary_colour')}</span>
              <div className="colour-input">
                <input
                  type="color"
                  value={formData.secondary}
                  onChange={e => setFormData({ ...formData, secondary: e.target.value })}
                />
                <input
                  type="text"
                  value={formData.secondary}
                  onChange={e => setFormData({ ...formData, secondary: e.target.value })}
                />
              </div>
            </label>

            <fieldset>
              <legend>{t('tenancy.brand.typeface')}</legend>
              {APPROVED_TYPEFACES.map(tf => (
                <label key={tf} className="typeface-option">
                  <input
                    type="radio"
                    name="typeface"
                    value={tf}
                    checked={formData.typeface === tf}
                    onChange={e => setFormData({ ...formData, typeface: e.target.value as 'IBM Plex Sans' | 'Noto Sans' | 'Mukta' })}
                  />
                  <span className="typeface-name">{tf}</span>
                  <span
                    className="typeface-sample"
                    style={{ fontFamily: tf }}
                  >
                    नमस्ते
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.poweredByVisible}
                onChange={e =>
                  setFormData({ ...formData, poweredByVisible: e.target.checked })
                }
                disabled={!brandKit || !true} // TODO: check plan.canHidePoweredBy
              />
              <span>{t('tenancy.brand.powered_by')}</span>
            </label>
          </div>
        </Card>

        <Card title={t('tenancy.brand.preview')}>
          <div
            className="preview-card"
            style={{
              backgroundColor: formData.primary,
              color: '#FFFFFF',
            }}
          >
            <h2>{formData.brandName}</h2>
            <p>{t('tenancy.brand.preview_text')}</p>
            {formData.poweredByVisible && (
              <div className="powered-by">
                {t('tenancy.brand.powered_by_text')}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
