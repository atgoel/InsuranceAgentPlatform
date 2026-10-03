import { useT } from '../../../lib/i18n';
import { FieldRow } from './FieldRow';

export interface ProductChoice {
  versionId: string;
  productName: string;
  insurerName: string;
}

interface Props {
  id: string;
  label: string;
  products: ProductChoice[];
  value: string;
  onChange(versionId: string): void;
}

/** A product picker; the caller passes only in-scope products. */
export function ProductSelect({ id, label, products, value, onChange }: Props) {
  const { t } = useT();
  return (
    <FieldRow id={id} label={label}>
      {(aria) => (
        <select {...aria} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('advice.product.choose')}</option>
          {products.map((p) => (
            <option key={p.versionId} value={p.versionId}>
              {p.productName} ({p.insurerName})
            </option>
          ))}
        </select>
      )}
    </FieldRow>
  );
}
