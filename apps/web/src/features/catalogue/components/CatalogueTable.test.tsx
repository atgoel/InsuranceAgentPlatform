import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import type { CatalogueRow } from '../api';
import { CatalogueTable } from './CatalogueTable';
import { mockClient, renderAt } from '../../../test/render';

const row = (over: Partial<CatalogueRow>): CatalogueRow => ({
  versionId: 'pv', productId: 'prd', productName: 'Plan', insurerId: 'ins', insurerName: 'Insurer', line: 'HEALTH', category: 'HEALTH_FLOATER',
  uin: 'UIN000001', wordingVersion: 'v1', ispEligible: true, posEligible: false, status: 'active', inScope: true, ...over,
});

const ROWS: CatalogueRow[] = [
  row({ versionId: 'a', productName: 'Family Health Optima', insurerName: 'Star Health', posEligible: true }),
  row({ versionId: 'b', productName: 'Care Supreme', insurerName: 'Care Health', inScope: false, exclusion: 'insurer_not_tied' }),
  row({ versionId: 'c', productName: 'Comprehensive v0', insurerName: 'Star Health', status: 'withdrawn', inScope: false, exclusion: 'not_effective' }),
  row({ versionId: 'd', productName: 'Old Motor', insurerName: 'HDFC ERGO', line: 'GENERAL', inScope: false, exclusion: 'insurer_inactive' }),
];

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

describe('AC-M05-10 CatalogueTable (W07)', () => {
  it('AC-M05-10 states that only active tie-ups are saleable and shows one status chip per row', async () => {
    renderAt(<CatalogueTable />, mockClient({ '/api/v1/catalogue/products': { items: ROWS } }), '/console/tenant');
    expect(await screen.findByText('Only products of active tie-ups are saleable')).toBeInTheDocument();
    expect(within(rowOf('Family Health Optima')).getByText('In scope')).toBeInTheDocument();
    expect(within(rowOf('Care Supreme')).getByText('Not tied')).toBeInTheDocument();
    expect(within(rowOf('Comprehensive v0')).getByText('Withdrawn')).toBeInTheDocument();
    expect(within(rowOf('Old Motor')).getByText('Not in scope')).toBeInTheDocument();
  });

  it('AC-M05-10 shows ✓ for POSP-eligible versions and – otherwise', async () => {
    renderAt(<CatalogueTable />, mockClient({ '/api/v1/catalogue/products': { items: ROWS } }), '/console/tenant');
    await screen.findByText('Family Health Optima');
    expect(within(rowOf('Family Health Optima')).getAllByText('✓')).toHaveLength(2); // ISP and POSP
    expect(within(rowOf('Care Supreme')).getByText('–')).toBeInTheDocument();
  });

  it('AC-M05-10 a line chip re-queries the API with that line; All clears it', async () => {
    const client = mockClient({ '/api/v1/catalogue/products': (opts: { query: { line?: string } }) => ({ items: ROWS.filter((r) => !opts.query.line || r.line === opts.query.line) }) });
    renderAt(<CatalogueTable />, client, '/console/tenant');
    await screen.findByText('Family Health Optima');
    await userEvent.click(screen.getByRole('button', { name: 'General' }));
    expect(await screen.findByText('Old Motor')).toBeInTheDocument();
    expect(screen.queryByText('Family Health Optima')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    await screen.findByText('Family Health Optima');
    const lines = client.get.mock.calls.map(([, opts]) => (opts as { query: { line?: string } }).query.line);
    expect(lines).toEqual([undefined, 'GENERAL', undefined]);
  });

  it('AC-M05-10 shows the error state, and a permission message on 403', async () => {
    const { unmount } = renderAt(<CatalogueTable />, mockClient({ '/api/v1/catalogue/products': new ApiError(500, 'internal', 'Boom') }), '/console/tenant');
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    unmount();
    renderAt(<CatalogueTable />, mockClient({ '/api/v1/catalogue/products': new ApiError(403, 'forbidden', 'No') }), '/console/tenant');
    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
  });
});
