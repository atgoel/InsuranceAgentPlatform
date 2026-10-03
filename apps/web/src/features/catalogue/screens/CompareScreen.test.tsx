import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import type { ScopeResult, VersionDetail } from '../api';
import { CompareScreen } from './CompareScreen';
import { mockClient, renderAt } from '../../../test/render';

const DISCLOSURE = 'Showing plans from your tied insurers only: HDFC Life, Star Health. This disclosure appears on shared comparisons.';
const SCOPE: ScopeResult = {
  versions: [
    { versionId: 'pv_term', productId: 'prd_term', insurerId: 'ins_hdfc', insurerName: 'HDFC Life', productName: 'Click 2 Protect Supreme', line: 'LIFE' },
    { versionId: 'pv_saral', productId: 'prd_saral', insurerId: 'ins_hdfc', insurerName: 'HDFC Life', productName: 'Saral Jeevan Bima', line: 'LIFE' },
  ],
  insurers: [{ id: 'ins_hdfc', name: 'HDFC Life' }],
  excluded: [{ versionId: 'pv_icici', reason: 'insurer_not_tied' }],
  disclosure: DISCLOSURE,
};
const DETAIL: VersionDetail = {
  versionId: 'pv_term', productId: 'prd_term', productName: 'Click 2 Protect Supreme', insurerId: 'ins_hdfc', insurerName: 'HDFC Life', line: 'LIFE',
  category: 'TERM', uin: '101N183V01', wordingVersion: 'v1', ispEligible: true, posEligible: false, status: 'active', inScope: true,
  keyFacts: [{ label: 'Cover up to age', value: '85' }], quoteRequirements: ['dob'], effectiveFrom: '2025-04-01',
};

const EVAL = '/api/v1/catalogue/comparison-scopes/evaluations';
const routes = (scope: ScopeResult | Error = SCOPE) => ({ [EVAL]: scope, '/api/v1/catalogue/versions/pv_term': DETAIL });

describe('AC-M05-10 CompareScreen (/m/compare)', () => {
  it('AC-M05-10 evaluates scope for the line in the URL and renders only the returned plans', async () => {
    const client = mockClient(routes());
    renderAt(<CompareScreen />, client, '/m/compare?line=LIFE');
    expect(await screen.findByText('Click 2 Protect Supreme')).toBeInTheDocument();
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Click 2 Protect Supreme', 'Saral Jeevan Bima']);
    expect(client.post).toHaveBeenCalledWith(EVAL, { line: 'LIFE', category: undefined, date: undefined });
  });

  it('AC-M05-10 an unknown line in the URL is not sent to the API', async () => {
    const client = mockClient(routes());
    renderAt(<CompareScreen />, client, '/m/compare?line=MARINE');
    await screen.findByText('Click 2 Protect Supreme');
    expect(client.post).toHaveBeenCalledWith(EVAL, { line: undefined, category: undefined, date: undefined });
  });

  it('AC-M05-10 shows the API disclosure verbatim above the cards, captioned as appearing on shared comparisons', async () => {
    renderAt(<CompareScreen />, mockClient(routes()), '/m/compare?line=LIFE');
    const disclosure = await screen.findByText(DISCLOSURE);
    expect(screen.getByText('Appears on shared comparisons')).toBeInTheDocument();
    const firstCard = screen.getAllByRole('article')[0];
    expect(disclosure.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('AC-M05-10 selecting a plan marks it pressed, loads its key facts and says quotes arrive later; selecting again clears it', async () => {
    renderAt(<CompareScreen />, mockClient(routes()), '/m/compare?line=LIFE');
    const term = await screen.findByRole('article', { name: 'Click 2 Protect Supreme' });
    await userEvent.click(within(term).getByRole('button', { name: 'Select plan' }));
    expect(within(term).getByRole('button', { name: 'Selected' })).toHaveAttribute('aria-pressed', 'true');
    expect(await within(term).findByText('Cover up to age')).toBeInTheDocument();
    expect(within(term).getByText('85')).toBeInTheDocument();
    expect(within(term).getByText('Quotes arrive in a later module')).toBeInTheDocument();
    const saral = screen.getByRole('article', { name: 'Saral Jeevan Bima' });
    expect(within(saral).getByRole('button', { name: 'Select plan' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(within(term).getByRole('button', { name: 'Selected' }));
    expect(within(term).getByRole('button', { name: 'Select plan' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('AC-M05-10 a plan stays selectable when its key facts cannot be loaded', async () => {
    renderAt(<CompareScreen />, mockClient({ [EVAL]: SCOPE }), '/m/compare?line=LIFE');
    const saral = await screen.findByRole('article', { name: 'Saral Jeevan Bima' });
    await userEvent.click(within(saral).getByRole('button', { name: 'Select plan' }));
    expect(within(saral).getByText('Quotes arrive in a later module')).toBeInTheDocument();
  });

  it('AC-M05-10 empty, error and 403 states', async () => {
    const empty = renderAt(<CompareScreen />, mockClient(routes({ ...SCOPE, versions: [] })), '/m/compare');
    expect(await screen.findByText('No plans available for comparison')).toBeInTheDocument();
    empty.unmount();
    const failed = renderAt(<CompareScreen />, mockClient(routes(new ApiError(500, 'internal', 'Boom'))), '/m/compare');
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    failed.unmount();
    renderAt(<CompareScreen />, mockClient(routes(new ApiError(403, 'forbidden', 'No'))), '/m/compare');
    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
  });
});
