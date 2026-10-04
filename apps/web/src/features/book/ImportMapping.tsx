import { useState } from 'react';
import { useT } from '../../lib/i18n';
import { fieldLabel } from './display';

export const canonicalKeys = [
  'policyNumber',
  'insurerName',
  'productName',
  'holderName',
  'mobile',
  'email',
  'dob',
  'sumAssured',
  'premium',
  'mode',
  'commencementDate',
  'nextDueDate',
  'maturityDate',
  'renewalDate',
  'status',
  'bookedOn',
  'expiryDate',
  'category',
  'businessType',
  'previousInsurerName',
  'policyTerm',
  'premiumNet',
  'premiumGross',
  'premiumTax',
  'odPremium',
  'tpPremium',
  'ncb',
  'registrationNo',
  'registrationYear',
  'familySizeOrModel',
  'bookingChannelCode',
  'businessSource',
  'referredByName',
  'remarks',
  'commissionAmount',
  'commissionRatePct',
  'commissionRemarks',
  'invoiceNo',
];
export function ImportMapping({
  headers,
  rows,
  initial,
  busy,
  onConfirm,
}: {
  headers: string[];
  rows: Record<string, string>[];
  initial: Record<string, string>;
  busy: boolean;
  onConfirm(mapping: Record<string, string>): void;
}) {
  const { t } = useT();
  const [mapping, setMapping] = useState(initial);
  const [extra, setExtra] = useState('');
  const keys = [...new Set([...canonicalKeys, ...Object.keys(mapping)])];
  return (
    <section>
      <h2>{t('book.mapping')}</h2>
      <p>{t('book.mapping_help')}</p>
      <div className="book-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('book.canonical')}</th>
              <th>{t('book.csv_header')}</th>
              <th>{t('book.preview')}</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key}>
                <th>{fieldLabel(key, t)}</th>
                <td>
                  <select
                    aria-label={`${t('book.map_column')} ${fieldLabel(key, t)}`}
                    value={mapping[key] ?? ''}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [key]: e.target.value }))}
                  >
                    <option value="">{t('book.ignore')}</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{rows[0]?.[mapping[key]] ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label>
        {t('book.extra_key')}
        <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="custom:branch_code" />
      </label>
      <button
        disabled={!/^(custom|risk):[a-zA-Z][a-zA-Z0-9_]*$/.test(extra)}
        onClick={() => {
          setMapping((prev) => ({ ...prev, [extra]: '' }));
          setExtra('');
        }}
      >
        {t('book.add_column')}
      </button>
      <button disabled={busy} onClick={() => onConfirm(Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)))}>
        {t('book.confirm_mapping')}
      </button>
    </section>
  );
}
