import { useState } from 'react';
import { useT } from '../../../lib/i18n';
import type { ApiError } from '../../../lib/api/api-error';
import { sha256 } from '../../crm/import/csv';
import type { ImportBatch, ImportResult, ImportRow } from '../api';
import { asError, BookError, istToday, useBookApi } from '../shared';
import { parseBookCsv } from '../csv';
import { ImportMapping } from '../ImportMapping';
import { ImportReview } from '../ImportReview';
import '../book.css';

export function BookImportScreen() {
  const api = useBookApi(); const { t } = useT(); const [format, setFormat] = useState('CSV_TEMPLATE'); const [asOf, setAsOf] = useState(istToday());
  const [file, setFile] = useState<File>(); const [headers, setHeaders] = useState<string[]>([]); const [raw, setRaw] = useState<Record<string, string>[]>([]);
  const [allRows, setAllRows] = useState<ImportRow[]>([]);
  const [batch, setBatch] = useState<ImportBatch>(); const [rows, setRows] = useState<ImportRow[]>([]); const [filter, setFilter] = useState('all');
  const [mapped, setMapped] = useState(false); const [result, setResult] = useState<ImportResult>(); const [busy, setBusy] = useState(false); const [error, setError] = useState<ApiError>(); const [csvError, setCsvError] = useState(false);
  async function run(action: () => Promise<void>) { setBusy(true); setError(undefined); try { await action(); } catch (e) { setError(asError(e)); } finally { setBusy(false); } }
  async function upload() {
    if (!file) return;
    await run(async () => {
      const text = await file.text(); let parsed: ReturnType<typeof parseBookCsv>;
      try { parsed = parseBookCsv(text); setCsvError(false); } catch { setCsvError(true); return; }
      setHeaders(parsed.headers); setRaw(parsed.rows); const uploaded = await api.upload(format, await sha256(text), asOf, parsed.rows); setBatch(uploaded);
      if (uploaded.state === 'COMMITTED') { setMapped(true); setRaw([]); }
    });
  }
  async function loadRows(id: string, selectedFilter: string) { const [response, all] = await Promise.all([api.rows(id, selectedFilter), selectedFilter === 'all' ? Promise.resolve(undefined) : api.rows(id, 'all')]); setRows(response.items); setAllRows(all?.items ?? response.items); }
  return <main className="book-screen"><h1>{t('book.import_title')}</h1><ol><li>{t('book.upload')}</li><li>{t('book.mapping')}</li><li>{t('book.review')}</li><li>{t('book.result')}</li></ol><BookError error={error} />
    {!batch && <form onSubmit={(e) => { e.preventDefault(); void upload(); }}><label>{t('book.format')}<select value={format} onChange={(e) => setFormat(e.target.value)}>{['CSV_TEMPLATE', 'LIC_PORTAL', 'GENERIC_PORTAL', 'OFFICE_SALES_REGISTER'].map((f) => <option key={f} value={f}>{t(`book.enum.${f}`)}</option>)}</select></label><label>{t('book.as_of')}<input required type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label><label>{t('book.csv_file')}<input required type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0])} /></label>{csvError && <p role="alert">{t('book.invalid_csv')}</p>}<button disabled={busy || !file}>{t('book.upload')}</button></form>}
    {batch && !mapped && <ImportMapping headers={headers} rows={raw} initial={batch.suggestedMapping} busy={busy} onConfirm={(mapping) => void run(async () => { const validated = await api.map(batch.id, mapping); setBatch(validated); await loadRows(batch.id, 'all'); setMapped(true); setRaw([]); })} />}
    {batch && mapped && !result && <section><h2>{t('book.review')}</h2><button disabled={busy} onClick={() => void run(async () => { const current = await api.batch(batch.id); setBatch(current); if (current.state !== 'COMMITTED') await loadRows(batch.id, filter); })}>{t('book.refresh_progress')}</button><p>{t('book.summary', { total: batch.summary.total, problems: batch.summary.problems, duplicates: batch.summary.duplicates, updates: batch.summary.updates })}</p><p>{t('book.as_of')} {batch.asOf}</p>
      {batch.state === 'COMMITTED' ? <><p>{t('book.already_committed')}</p><p>{t('book.rerun')}</p></> : <><label>{t('book.review_filter')}<select value={filter} onChange={(e) => { setFilter(e.target.value); void run(() => loadRows(batch.id, e.target.value)); }}>{['all', 'problems', 'duplicates'].map((f) => <option key={f} value={f}>{t(`book.filter.${f}`)}</option>)}</select></label>
        <ImportReview rows={rows} asOf={batch.asOf} busy={busy} onDecision={(rowNo, decision) => void run(async () => { await api.decide(batch.id, rowNo, decision); await loadRows(batch.id, filter); })} onReferrer={(rowNo, link) => void run(async () => { await api.referrer(batch.id, rowNo, link); await loadRows(batch.id, filter); })} />
        <button disabled={busy || allRows.some((r) => !r.decision || (r.decision !== 'SKIP' && r.problems.length > 0))} onClick={() => void run(async () => { setResult(await api.commit(batch.id)); setRows([]); setRaw([]); })}>{t('book.commit')}</button></>}
    </section>}
    {result && <section><h2>{t('book.result')}</h2><dl>{(['imported', 'updated', 'skipped'] as const).map((k) => <div key={k}><dt>{t(`book.${k}`)}</dt><dd>{result[k]}</dd></div>)}<div><dt>{t('book.parties_created')}</dt><dd>{result.parties.created}</dd></div><div><dt>{t('book.parties_linked')}</dt><dd>{result.parties.linked}</dd></div></dl><p>{t('book.rerun')}</p><button onClick={() => { setBatch(undefined); setMapped(false); setResult(undefined); }}>{t('book.import_another')}</button></section>}
  </main>;
}
