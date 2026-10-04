import { useState } from 'react';
import { BottomSheet, formatIstDate } from '../../design-system';
import { useT } from '../../lib/i18n';
import type { ApiError } from '../../lib/api/api-error';
import type { DueItem } from './api';
import { asError, BookError, istToday, useBookApi } from './shared';

export function MarkPaidSheet({ due, onClose, onSaved }: { due: DueItem; onClose(): void; onSaved(): void }) {
  const api = useBookApi();
  const { t, lang } = useT();
  const [paidOn, setPaidOn] = useState(istToday());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError>();
  async function save() {
    setSaving(true);
    setError(undefined);
    try {
      await api.pay(due.policyId, due.dueDate, paidOn);
      onSaved();
      onClose();
    } catch (e) {
      setError(asError(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <BottomSheet open title={t('book.mark_paid')} onClose={onClose}>
      <p>
        {due.holderName} · {formatIstDate(due.dueDate, lang)}
      </p>
      <BookError error={error} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          {t('book.paid_on')}
          <input type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </label>
        <button disabled={saving}>{t('common.save')}</button>
      </form>
    </BottomSheet>
  );
}
