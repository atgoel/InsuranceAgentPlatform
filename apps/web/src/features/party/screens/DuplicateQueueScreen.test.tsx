import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import { mockClient, renderAt, type MockClient } from '../../../test/render';
import type { DuplicateCandidateView } from '../api';
import { DuplicateQueueScreen } from './DuplicateQueueScreen';

const user = userEvent.setup({ delay: null });

const PAIR: DuplicateCandidateView = {
  id: 'dup-1',
  a: { id: 'a', displayName: 'Rajesh Kumar', rolesSummary: [], tags: [] },
  b: { id: 'b', displayName: 'Rajesh Kumaar', rolesSummary: [], tags: [] },
  score: 90,
  rule: 'SameMobileAndNameRule',
  explanation: 'Same mobile and a similar name',
};

const COMPARISON = {
  fields: [
    { field: 'displayName', a: 'Rajesh Kumar', b: 'Rajesh Kumaar' },
    { field: 'preferredLanguage', a: 'hi', b: null },
    { field: 'dateOfBirth', a: 1984, b: 1984 },
  ],
  sourceA: { kind: 'LEAD' },
  sourceB: { kind: 'IMPORT' },
};

function client(queue: DuplicateCandidateView[] = [PAIR]): MockClient {
  let current = queue;
  const c = mockClient({
    '/api/v1/duplicates': () => ({ items: current }),
    '/api/v1/duplicates/dup-1/comparison': COMPARISON,
    '/api/v1/duplicates/dup-1/merge': () => {
      current = [];
      return { mergeId: 'm1', survivorId: 'a', mergedId: 'b', reversibleUntil: '2026-11-03T00:00:00Z' };
    },
    '/api/v1/duplicates/dup-1/dismissal': () => {
      current = [];
      return undefined;
    },
  });
  return c;
}

function open(c: MockClient) {
  return renderAt(<DuplicateQueueScreen />, c, '/crm/import/duplicates');
}

async function compare() {
  await user.click(await screen.findByText('Compare'));
  return within(await screen.findByRole('region', { name: 'Compare records' }));
}

describe('AC-M03-17 DuplicateQueueScreen (/crm/import/duplicates)', () => {
  it('AC-M03-17 lists each pair with its score, the rule by name and the explanation', async () => {
    open(client());
    expect(await screen.findByText('Queue · 1 pairs')).toBeInTheDocument();
    const card = screen.getByText('Rajesh Kumar', { exact: false, selector: 'p' }).closest('li');
    expect(card?.textContent).toBe('90Same mobile and similar nameRajesh Kumar ↔ Rajesh KumaarSame mobile and a similar nameCompare Rajesh Kumar / Rajesh Kumaar');
  });

  it('AC-M03-17 shows "Queue is clear." when there are no pairs, with the page header and the Import link', async () => {
    open(client([]));
    expect(await screen.findByText('Queue is clear.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Import & duplicates' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Import' })).toHaveAttribute('href', '/crm/import');
  });

  it('AC-M03-17 compares field by field with source names, translated values and "–" for a missing value', async () => {
    const c = client();
    open(c);
    const panel = await compare();
    expect(c.get).toHaveBeenCalledWith('/api/v1/duplicates/dup-1/comparison');
    expect(panel.getByText('Record A · Lead')).toBeInTheDocument();
    expect(panel.getByText('Record B · Import')).toBeInTheDocument();
    const rows = Array.from(document.querySelectorAll('.comparison-table tbody tr')).map((tr) => tr.textContent);
    expect(rows).toEqual(['NameRajesh KumarRajesh Kumaar', 'LanguageHindi–', 'Birth year19841984']);
    expect(panel.getByText('Policies, activities, consents and attribution from both records are kept. A shared mobile alone never auto-merges people.')).toBeInTheDocument();
  });

  it('AC-M03-17 merging asks for confirmation that states the 30 day reversibility, then sends the chosen survivor values', async () => {
    const c = client();
    open(c);
    const panel = await compare();
    await user.click(panel.getByLabelText('Name: keep record B'));
    await user.click(panel.getByText('Merge records'));
    expect(screen.getByText('Merges are reversible for 30 days. After that the merge cannot be undone.')).toBeInTheDocument();
    expect(c.post).not.toHaveBeenCalled();

    await user.click(screen.getByText('Confirm merge'));

    expect(c.post).toHaveBeenCalledTimes(1);
    const [url, body, options] = c.post.mock.calls[0] as [string, unknown, { idempotencyKey: string }];
    expect(url).toBe('/api/v1/duplicates/dup-1/merge');
    expect(body).toEqual({
      survivor: 'A',
      choices: [
        { field: 'displayName', from: 'B' },
        { field: 'preferredLanguage', from: 'A' },
        { field: 'dateOfBirth', from: 'A' },
      ],
    });
    expect(options.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText('Queue is clear.')).toBeInTheDocument();
  });

  it('AC-M03-17 "Not a duplicate" posts the dismissal and refreshes the queue', async () => {
    const c = client();
    open(c);
    const panel = await compare();
    await user.click(panel.getByText('Not a duplicate'));
    const [url, body] = c.post.mock.calls[0] as [string, unknown];
    expect(url).toBe('/api/v1/duplicates/dup-1/dismissal');
    expect(body).toEqual({});
    expect(await screen.findByText('Queue is clear.')).toBeInTheDocument();
  });

  it('AC-M03-17 a failed merge shows the server title next to the buttons and keeps the comparison open', async () => {
    const c = client();
    c.post.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Record already merged'));
    open(c);
    const panel = await compare();
    await user.click(panel.getByText('Merge records'));
    await user.click(screen.getByText('Confirm merge'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not complete the action: Record already merged');
    expect(screen.getByRole('region', { name: 'Compare records' })).toBeInTheDocument();
    expect(screen.getByText('Rajesh Kumaar', { selector: 'span' })).toBeInTheDocument();
  });

  it('AC-M03-17 a failed comparison load is reported inline and the queue stays', async () => {
    const c = client();
    c.get.mockImplementation(async (path: string) => {
      if (path.endsWith('/comparison')) throw new ApiError(500, 'boom', 'Comparison unavailable');
      return { items: [PAIR] };
    });
    open(c);
    await user.click(await screen.findByText('Compare'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not complete the action: Comparison unavailable');
    expect(screen.getByText('Queue · 1 pairs')).toBeInTheDocument();
  });

  it('AC-M03-17 a queue load error shows the error state inline under the page header', async () => {
    open(mockClient({ '/api/v1/duplicates': new ApiError(500, 'boom', 'Server error', 'Internal server error', 'trace-123456789') }));
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Import & duplicates' })).toBeInTheDocument();
  });

  it('AC-M03-17 403 shows the permission state', async () => {
    open(mockClient({ '/api/v1/duplicates': new ApiError(403, 'forbidden', 'Forbidden') }));
    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
  });
});
