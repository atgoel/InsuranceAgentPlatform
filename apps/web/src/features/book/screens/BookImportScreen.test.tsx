import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { mockClient, renderAt } from '../../../test/render';
import { BookImportScreen } from './BookImportScreen';

describe('AC-M07-15 AC-CR001-06 office register wizard', () => {
  it('requires preview confirmation, preserves duplicate Remarks, confirms referrer and shows exact commit totals', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new Uint8Array([1, 2]).buffer);
    const batch = {
      id: 'b1',
      state: 'UPLOADED',
      asOf: '2026-07-02',
      format: 'OFFICE_SALES_REGISTER',
      suggestedMapping: { holderName: 'Client Name', remarks: 'Remarks', commissionRemarks: 'Remarks#2' },
      mapping: {},
      summary: { total: 1, problems: 0, duplicates: 0, updates: 0 },
    };
    const client = mockClient({
      '/api/v1/book-imports': batch,
      '/api/v1/book-imports/b1/rows': {
        items: [
          {
            rowNo: 1,
            problems: [],
            match: { kind: 'NEW' },
            decision: 'IMPORT',
            referrerSuggestions: [{ name: 'Saurabh', memberId: 'm1' }],
          },
        ],
      },
      '/api/v1/book-imports/b1/commit': { imported: 1, updated: 0, skipped: 0, parties: { created: 1, linked: 0 } },
    });
    client.put.mockResolvedValue({ ...batch, state: 'VALIDATED' });
    renderAt(<BookImportScreen />, client, '/m/book/import');
    fireEvent.change(screen.getByLabelText('Import format'), { target: { value: 'OFFICE_SALES_REGISTER' } });
    fireEvent.change(screen.getByLabelText('As of'), { target: { value: '2026-07-02' } });
    const file = new File([], 'register.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve('Client Name,Remarks,Remarks\nAsha,Policy note,Commission note') });
    fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [file] } });
    fireEvent.submit(screen.getByLabelText('CSV file').closest('form')!);
    expect(await screen.findByText('First row preview')).toBeInTheDocument();
    expect(client.put).not.toHaveBeenCalled();
    expect(screen.getByText('Commission note')).toBeInTheDocument();
    expect(client.post).toHaveBeenCalledWith('/api/v1/book-imports', {
      format: 'OFFICE_SALES_REGISTER',
      fileChecksum: '0102',
      asOf: '2026-07-02',
      rows: [{ 'Client Name': 'Asha', Remarks: 'Policy note', 'Remarks#2': 'Commission note' }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm mapping and validate' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm referrer Saurabh' }));
    await waitFor(() =>
      expect(client.put).toHaveBeenCalledWith('/api/v1/book-imports/b1/rows/1/referrer', { memberId: 'm1', partyId: undefined }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Commit reviewed rows' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Commit reviewed rows' }));
    expect(await screen.findByText('Re-running the same file skips imported rows.')).toBeInTheDocument();
    expect(client.post).toHaveBeenCalledWith('/api/v1/book-imports/b1/commit');
    expect(screen.getByText('Customers created')).toBeInTheDocument();
  });
  it('rejects a malformed file before any upload', async () => {
    const client = mockClient({});
    renderAt(<BookImportScreen />, client, '/m/book/import');
    const file = new File([], 'broken.csv');
    Object.defineProperty(file, 'text', { value: () => Promise.resolve('Name,Policy\nOnly name') });
    fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [file] } });
    fireEvent.submit(screen.getByLabelText('CSV file').closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Use a valid CSV');
    expect(client.post).not.toHaveBeenCalled();
  });
  it('keeps commit blocked when unresolved rows are hidden by the duplicate filter', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new Uint8Array([1]).buffer);
    const batch = {
      id: 'b1',
      state: 'UPLOADED',
      asOf: '2026-10-03',
      format: 'CSV_TEMPLATE',
      suggestedMapping: {},
      mapping: {},
      summary: { total: 1, problems: 1, duplicates: 0, updates: 0 },
    };
    const client = mockClient({
      '/api/v1/book-imports': batch,
      '/api/v1/book-imports/b1/rows': (opts: unknown) => ({
        items:
          (opts as { query: { filter: string } }).query.filter === 'duplicates'
            ? []
            : [{ rowNo: 1, problems: ['invalid_amount:Commission'], decision: 'IMPORT', match: { kind: 'NEW' } }],
      }),
    });
    client.put.mockResolvedValue({ ...batch, state: 'VALIDATED' });
    renderAt(<BookImportScreen />, client, '/m/book/import');
    const file = new File([], 'bad-money.csv');
    Object.defineProperty(file, 'text', { value: () => Promise.resolve('Commission\nSAURABH') });
    fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [file] } });
    fireEvent.submit(screen.getByLabelText('CSV file').closest('form')!);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm mapping and validate' }));
    expect(await screen.findByText('Invalid money amount · Commission')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Review filter'), { target: { value: 'duplicates' } });
    expect(await screen.findByText('No rows in this filter.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Commit reviewed rows' })).toBeDisabled();
    expect(client.post).not.toHaveBeenCalledWith('/api/v1/book-imports/b1/commit');
  });
});
