import { Card } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { BrandKitProps } from '../api';
import { contrastRatio } from '../contrast';

export const APPROVED_TYPEFACES = ['IBM Plex Sans', 'Noto Sans', 'Mukta'] as const;

/** Colour presets from the WhiteLabel artboard; the server still validates contrast on save. */
const PRESETS = [
  { id: 'navy_saffron', primary: '#0B4F8A', secondary: '#C2410C' },
  { id: 'teal_amber', primary: '#0F5E5A', secondary: '#B45309' },
  { id: 'plum_gold', primary: '#5B2A6E', secondary: '#A16207' },
] as const;

export interface BrandKitFormProps {
  value: BrandKitProps;
  onChange(next: BrandKitProps): void;
}

interface ColourFieldProps {
  label: string;
  value: string;
  onChange(value: string): void;
}

function ColourField({ label, value, onChange }: ColourFieldProps) {
  return (
    <div className="brand-field">
      <span className="label-text">{label}</span>
      <div className="colour-input">
        <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
        <input type="text" aria-label={`${label} (hex)`} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

function Presets({ value, onChange }: BrandKitFormProps) {
  const { t } = useT();
  return (
    <div className="brand-field">
      <span className="label-text">{t('tenancy.brand.presets')}</span>
      <div className="brand-presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="brand-preset"
            aria-pressed={value.primary === preset.primary && value.secondary === preset.secondary}
            onClick={() => onChange({ ...value, primary: preset.primary, secondary: preset.secondary })}
          >
            <span className="brand-swatch" style={{ backgroundColor: preset.primary }} />
            <span className="brand-swatch" style={{ backgroundColor: preset.secondary }} />
            {t(`tenancy.brand.preset.${preset.id}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Typefaces({ value, onChange }: BrandKitFormProps) {
  const { t } = useT();
  return (
    <fieldset>
      <legend>{t('tenancy.brand.typeface')}</legend>
      {APPROVED_TYPEFACES.map((face) => (
        <label key={face} className="typeface-option">
          <input
            type="radio"
            name="typeface"
            value={face}
            checked={value.typeface === face}
            onChange={() => onChange({ ...value, typeface: face })}
          />
          <span className="typeface-name">{face}</span>
          <span className="typeface-sample" style={{ fontFamily: face }}>
            नमस्ते
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function BrandKitForm({ value, onChange }: BrandKitFormProps) {
  const { t } = useT();
  const ratio = contrastRatio(value.primary, '#FFFFFF');
  return (
    <Card title={t('tenancy.brand.settings')}>
      <div className="form-section">
        <label>
          <span className="label-text">{t('tenancy.brand.name')}</span>
          <input type="text" value={value.brandName} onChange={(e) => onChange({ ...value, brandName: e.target.value })} />
        </label>
        <Presets value={value} onChange={onChange} />
        <ColourField label={t('tenancy.brand.primary_colour')} value={value.primary} onChange={(primary) => onChange({ ...value, primary })} />
        <div className="contrast-info">
          <span>
            {t('tenancy.brand.contrast')}: {ratio.toFixed(2)}:1
          </span>
          {ratio < 4.5 && <span className="contrast-warning">{t('tenancy.brand.contrast_warning')}</span>}
        </div>
        <ColourField
          label={t('tenancy.brand.secondary_colour')}
          value={value.secondary}
          onChange={(secondary) => onChange({ ...value, secondary })}
        />
        <Typefaces value={value} onChange={onChange} />
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={!value.poweredByVisible}
            onChange={(e) => onChange({ ...value, poweredByVisible: !e.target.checked })}
          />
          <span>{t('tenancy.brand.powered_by')}</span>
        </label>
      </div>
    </Card>
  );
}
