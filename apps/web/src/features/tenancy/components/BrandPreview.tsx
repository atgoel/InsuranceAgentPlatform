import { Card } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { BrandKitProps } from '../api';

export function BrandPreview({ value }: { value: BrandKitProps }) {
  const { t } = useT();
  return (
    <Card title={t('tenancy.brand.preview')}>
      <div className="preview-card" style={{ backgroundColor: value.primary, color: '#FFFFFF', fontFamily: value.typeface }}>
        <h2>{value.brandName}</h2>
        <p>{t('tenancy.brand.preview_text')}</p>
        <span className="preview-accent" style={{ backgroundColor: value.secondary }} />
        {value.poweredByVisible && <div className="powered-by">{t('tenancy.brand.powered_by_text')}</div>}
      </div>
    </Card>
  );
}
