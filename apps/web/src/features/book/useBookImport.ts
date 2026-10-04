import { useState } from 'react';
import type { ApiError } from '../../lib/api/api-error';
import { sha256 } from '../crm/import/csv';
import type { BookApi, ImportBatch, ImportResult, ImportRow } from './api';
import { parseBookCsv } from './csv';
import { asError, istToday, useBookApi } from './shared';

type Run = (action: () => Promise<void>) => Promise<void>;

interface ReviewDeps {
  api: BookApi;
  run: Run;
  batch: ImportBatch | undefined;
  filter: string;
  loadRows(id: string, selectedFilter: string): Promise<void>;
  setBatch(batch: ImportBatch | undefined): void;
  setFilter(filter: string): void;
  setResult(result: ImportResult | undefined): void;
  setRows(rows: ImportRow[]): void;
  setRaw(rows: Record<string, string>[]): void;
}

function useReviewActions(deps: ReviewDeps) {
  const { api, run, batch, filter, loadRows } = deps;
  function refresh() {
    if (!batch) return;
    void run(async () => {
      const current = await api.batch(batch.id);
      deps.setBatch(current);
      if (current.state !== 'COMMITTED') await loadRows(batch.id, filter);
    });
  }
  function changeFilter(next: string) {
    deps.setFilter(next);
    if (!batch) return;
    void run(() => loadRows(batch.id, next));
  }
  function decide(rowNo: number, decision: string) {
    if (!batch) return;
    void run(async () => {
      await api.decide(batch.id, rowNo, decision);
      await loadRows(batch.id, filter);
    });
  }
  function referrer(rowNo: number, link: Parameters<BookApi['referrer']>[2]) {
    if (!batch) return;
    void run(async () => {
      await api.referrer(batch.id, rowNo, link);
      await loadRows(batch.id, filter);
    });
  }
  function commit() {
    if (!batch) return;
    void run(async () => {
      deps.setResult(await api.commit(batch.id));
      deps.setRows([]);
      deps.setRaw([]);
    });
  }
  return { refresh, changeFilter, decide, referrer, commit };
}

export function useBookImport() {
  const api = useBookApi();
  const [format, setFormat] = useState('CSV_TEMPLATE');
  const [asOf, setAsOf] = useState(istToday());
  const [file, setFile] = useState<File>();
  const [headers, setHeaders] = useState<string[]>([]);
  const [raw, setRaw] = useState<Record<string, string>[]>([]);
  const [allRows, setAllRows] = useState<ImportRow[]>([]);
  const [batch, setBatch] = useState<ImportBatch>();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [filter, setFilter] = useState('all');
  const [mapped, setMapped] = useState(false);
  const [result, setResult] = useState<ImportResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const [csvError, setCsvError] = useState(false);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(asError(e));
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    if (!file) return;
    await run(async () => {
      const text = await file.text();
      let parsed: ReturnType<typeof parseBookCsv>;
      try {
        parsed = parseBookCsv(text);
        setCsvError(false);
      } catch {
        setCsvError(true);
        return;
      }
      setHeaders(parsed.headers);
      setRaw(parsed.rows);
      const uploaded = await api.upload(format, await sha256(text), asOf, parsed.rows);
      setBatch(uploaded);
      if (uploaded.state === 'COMMITTED') {
        setMapped(true);
        setRaw([]);
      }
    });
  }
  async function loadRows(id: string, selectedFilter: string) {
    const [response, all] = await Promise.all([
      api.rows(id, selectedFilter),
      selectedFilter === 'all' ? Promise.resolve(undefined) : api.rows(id, 'all'),
    ]);
    setRows(response.items);
    setAllRows(all?.items ?? response.items);
  }
  function confirmMapping(mapping: Record<string, string>) {
    if (!batch) return;
    void run(async () => {
      const validated = await api.map(batch.id, mapping);
      setBatch(validated);
      await loadRows(batch.id, 'all');
      setMapped(true);
      setRaw([]);
    });
  }
  function reset() {
    setBatch(undefined);
    setMapped(false);
    setResult(undefined);
  }
  const review = useReviewActions({
    api,
    run,
    batch,
    filter,
    loadRows,
    setBatch,
    setFilter,
    setResult,
    setRows,
    setRaw,
  });
  return {
    format,
    setFormat,
    asOf,
    setAsOf,
    file,
    setFile,
    headers,
    raw,
    allRows,
    batch,
    rows,
    filter,
    mapped,
    result,
    busy,
    error,
    csvError,
    upload,
    confirmMapping,
    reset,
    ...review,
  };
}
