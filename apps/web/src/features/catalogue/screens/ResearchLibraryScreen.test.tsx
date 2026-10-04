import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import type { ResearchItem } from '../api';
import { ResearchLibraryScreen } from './ResearchLibraryScreen';
import { mockClient, renderAt } from '../../../test/render';

const user = userEvent.setup({ delay: null });

const ITEMS: ResearchItem[] = [
  {
    versionId: 'pv_floater', productName: 'Family Health Optima', insurerName: 'Star Health', line: 'HEALTH', posEligible: true,
    summary: 'Family floater with restoration.', points: ['100% restoration once a year', 'Day-care covered'],
    sourceRef: 'Policy wording v1, section 3', sourceDate: '2025-04-01', stale: false,
  },
  {
    versionId: 'pv_comp', productName: 'Comprehensive', insurerName: 'Star Health', line: 'HEALTH', posEligible: false,
    summary: 'Individual cover.', points: ['Maternity after 24 months'], sourceRef: 'Policy wording v0', sourceDate: '2024-03-01', stale: true, staleReason: 'wording_changed',
  },
];

const PATH = '/api/v1/catalogue/research';
const card = (name: string) => screen.getByLabelText(name);
const queries = (get: { mock: { calls: unknown[][] } }) => get.mock.calls.map(([, opts]) => (opts as { query: Record<string, string | undefined> }).query);

describe('AC-M05-10 ResearchLibraryScreen (/m/research)', () => {
  it('AC-M05-10 shows the approved-content notice and each card with points, source and date', async () => {
    renderAt(<ResearchLibraryScreen />, mockClient({ [PATH]: { items: ITEMS } }), '/m/research');
    expect(await screen.findByText('Approved content for your tied insurers only')).toBeInTheDocument();
    const floater = card('Family Health Optima');
    expect(within(floater).getByText('Star Health')).toBeInTheDocument();
    expect([...floater.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['100% restoration once a year', 'Day-care covered']);
    expect(within(floater).getByText('Source: Policy wording v1, section 3 · 1 Apr 2025')).toBeInTheDocument();
  });

  it('AC-M05-10 shows the stale banner and the POSP chip only where they apply', async () => {
    renderAt(<ResearchLibraryScreen />, mockClient({ [PATH]: { items: ITEMS } }), '/m/research');
    await screen.findByText('Family Health Optima');
    expect(within(card('Comprehensive')).getByText('Insurer updated the wording — quote from the wording only.')).toBeInTheDocument();
    expect(within(card('Family Health Optima')).queryByText(/Insurer updated the wording/)).not.toBeInTheDocument();
    expect(within(card('Family Health Optima')).getByText('POSP eligible')).toBeInTheDocument();
    expect(within(card('Comprehensive')).queryByText('POSP eligible')).not.toBeInTheDocument();
  });

  it('AC-M05-10 Compare navigates to /m/compare with the card’s line', async () => {
    renderAt(<ResearchLibraryScreen />, mockClient({ [PATH]: { items: ITEMS } }), '/m/research');
    await screen.findByText('Family Health Optima');
    await user.click(within(card('Family Health Optima')).getByText('Compare'));
    expect(await screen.findByTestId('location')).toHaveTextContent('/m/compare?line=HEALTH');
  });

  it('AC-M05-10 line chips and a submitted search re-query the API; typing alone does not', async () => {
    const client = mockClient({ [PATH]: { items: ITEMS } });
    renderAt(<ResearchLibraryScreen />, client, '/m/research?line=LIFE');
    await screen.findByText('Family Health Optima');
    const box = screen.getByLabelText('Search');
    await user.type(box, 'star');
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(box).toHaveFocus();
    await user.type(box, '{Enter}');
    await user.click(screen.getByText('Health'));
    await screen.findByText('Family Health Optima');
    expect(queries(client.get)).toEqual([
      { line: 'LIFE', q: undefined },
      { line: 'LIFE', q: 'star' },
      { line: 'HEALTH', q: 'star' },
    ]);
  });

  it('AC-M05-10 the assistant tab says it is coming in a later module', async () => {
    renderAt(<ResearchLibraryScreen />, mockClient({ [PATH]: { items: ITEMS } }), '/m/research');
    await screen.findByText('Family Health Optima');
    await user.click(screen.getByRole('tab', { name: 'Assistant' }));
    expect(screen.getByText('Coming in a later module')).toBeInTheDocument();
    expect(screen.queryByText('Family Health Optima')).not.toBeInTheDocument();
  });

  it('AC-M05-10 empty, error and 403 states', async () => {
    const empty = renderAt(<ResearchLibraryScreen />, mockClient({ [PATH]: { items: [] } }), '/m/research');
    expect(await screen.findByText('No research items found')).toBeInTheDocument();
    empty.unmount();
    const failed = renderAt(<ResearchLibraryScreen />, mockClient({ [PATH]: new ApiError(500, 'internal', 'Boom') }), '/m/research');
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    failed.unmount();
    renderAt(<ResearchLibraryScreen />, mockClient({ [PATH]: new ApiError(403, 'forbidden', 'No') }), '/m/research');
    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
  });

  it('AC-M05-10 shows each card’s line as a translated label, never the code', async () => {
    renderAt(<ResearchLibraryScreen />, mockClient({ [PATH]: { items: ITEMS } }), '/m/research');
    await screen.findByText('Family Health Optima');
    expect(within(card('Family Health Optima')).getByText('Health insurance')).toBeInTheDocument();
    expect(within(card('Family Health Optima')).queryByText('HEALTH')).not.toBeInTheDocument();
  });
});
