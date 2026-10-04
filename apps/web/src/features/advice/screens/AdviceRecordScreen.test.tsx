import { describe, it, expect } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import type { AdviceView } from '../api';
import { AdviceRecordScreen } from './AdviceRecordScreen';
import { mockClient, renderAt, type MockClient } from '../../../test/render';

const user = userEvent.setup({ delay: null });
const enter = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } });

const PATH = '/crm/advice/adv_1';
const ROUTE = '/crm/advice/:id';
const ADVICE = '/api/v1/advice-records/adv_1';
const DISCLOSURE = 'Showing plans from your tied insurers only: HDFC Life.';

const VIEW: AdviceView = {
  id: 'adv_1',
  partyId: 'pty_1',
  advisorMemberId: 'mem_1',
  status: 'DRAFT',
  version: 3,
  createdAt: '2026-10-01T09:00:00Z',
  scope: { disclosure: DISCLOSURE, entityType: 'ISP', versionIdsShown: ['pv_term', 'pv_saral'], excludedCount: 1, evaluatedOn: '2026-10-01' },
  calculatorRuns: [{ calculator: 'protection-gap', inputs: {}, outputs: {}, assumptionsVersion: '2026.1', ranAt: '2026-10-01T20:00:00Z' }],
  suitabilityNotes: 'Customer prefers a long term',
  shownProducts: [
    { versionId: 'pv_term', productName: 'Click 2 Protect', insurerName: 'HDFC Life', line: 'LIFE', category: 'TERM' },
    { versionId: 'pv_saral', productName: 'Saral Jeevan Bima', insurerName: 'HDFC Life', line: 'LIFE', category: 'TERM' },
  ],
  recommended: [{ versionId: 'pv_term', rationale: 'Highest cover for the budget', productName: 'Click 2 Protect', insurerName: 'HDFC Life' }],
  missing: ['customerChoice'],
};

const FINALISED: AdviceView = {
  ...VIEW,
  status: 'FINALISED',
  finalisedAt: '2026-10-02T10:00:00Z',
  customerChoice: { versionId: 'pv_term', productName: 'Click 2 Protect', insurerName: 'HDFC Life' },
  missing: [],
};

function open(routes: Record<string, unknown> = { [ADVICE]: VIEW }): MockClient {
  const client = mockClient(routes);
  renderAt(<AdviceRecordScreen />, client, PATH, ROUTE);
  return client;
}

describe('AC-M06-14 AdviceRecordScreen (/crm/advice/:id)', () => {
  it('AC-M06-14 shows the scope disclosure, calculator runs, recommendations, notes and the missing checklist', async () => {
    open();
    expect(await screen.findByRole('note')).toHaveTextContent(DISCLOSURE);
    const runs = screen.getByRole('region', { name: 'Calculator runs' });
    expect(within(runs).getByText(/Protection gap - .* - Assumptions v2026\.1/)).toBeInTheDocument();
    const recs = screen.getByRole('region', { name: 'Recommendations' });
    expect(within(recs).getByText('Click 2 Protect (HDFC Life)', { selector: 'strong' })).toBeInTheDocument();
    expect(within(recs).getByText(/Highest cover for the budget/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Suitability notes' })).toHaveValue('Customer prefers a long term');
    const missing = screen.getByRole('region', { name: 'Still needed before finalising' });
    expect(within(missing).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Record the customer choice']);
  });

  it('AC-M06-14 a 422 advice_incomplete on finalise lists the missing items from the response and keeps the record', async () => {
    // Same shape the API sends: extensions are top-level problem members.
    const incomplete = ApiError.fromProblem(422, { status: 422, code: 'advice_incomplete', title: 'Advice is incomplete', missing: ['recommendation', 'customerChoice'] });
    const client = open({ [ADVICE]: { ...VIEW, missing: [] }, [`${ADVICE}/finalisation`]: incomplete });
    await user.click(await screen.findByRole('button', { name: 'Finalise advice' }));
    expect(await screen.findByText('Advice is incomplete')).toBeInTheDocument();
    const missing = screen.getByRole('region', { name: 'Still needed before finalising' });
    expect(within(missing).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Add at least one recommendation', 'Record the customer choice']);
    expect(client.post).toHaveBeenCalledWith(`${ADVICE}/finalisation`);
    expect(screen.getByRole('button', { name: 'Finalise advice' })).toBeInTheDocument();
  });

  it('AC-M06-14 after finalisation everything is read-only and the finalised date is shown', async () => {
    open({ [ADVICE]: VIEW, [`${ADVICE}/finalisation`]: FINALISED });
    await user.click(await screen.findByRole('button', { name: 'Finalise advice' }));
    expect(await screen.findByText('Finalised on 2 Oct 2026')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(screen.queryAllByRole('textbox')).toEqual([]);
    expect(screen.queryAllByRole('combobox')).toEqual([]);
    expect(screen.queryByRole('region', { name: 'Still needed before finalising' })).not.toBeInTheDocument();
    expect(screen.getByText('Customer prefers a long term')).toBeInTheDocument();
    expect(screen.getByText('Finalised')).toBeInTheDocument();
  });

  it('AC-M06-14 a record that is already finalised loads read-only', async () => {
    open({ [ADVICE]: FINALISED });
    expect(await screen.findByText('Finalised on 2 Oct 2026')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(screen.queryAllByRole('textbox')).toEqual([]);
  });

  it('AC-M06-14 a customer choice that is not recommended requires a reason before it can be saved', async () => {
    const client = open();
    client.put.mockResolvedValue({ ...VIEW, version: 4 });
    const choice = await screen.findByRole('region', { name: 'Customer choice' });
    const save = within(choice).getByRole('button', { name: 'Save customer choice' });
    await user.selectOptions(within(choice).getByLabelText('Product chosen by the customer'), 'pv_saral');
    expect(within(choice).getByText('A reason is required when the choice differs from the recommendation')).toBeInTheDocument();
    expect(save).toBeDisabled();
    await user.type(within(choice).getByLabelText('Reason for choosing a product we did not recommend'), 'Lower premium');
    expect(save).toBeEnabled();
    await user.click(save);
    await screen.findByRole('region', { name: 'Customer choice' });
    expect(client.put).toHaveBeenCalledWith(`${ADVICE}/customer-choice`, { versionId: 'pv_saral', reasonIfDifferent: 'Lower premium' }, { ifMatch: '"v3"' });
  });

  it('AC-M06-14 choosing a recommended product needs no reason and sends none', async () => {
    const client = open();
    client.put.mockResolvedValue({ ...VIEW, version: 4 });
    const choice = await screen.findByRole('region', { name: 'Customer choice' });
    await user.selectOptions(within(choice).getByLabelText('Product chosen by the customer'), 'pv_term');
    expect(within(choice).queryByLabelText('Reason for choosing a product we did not recommend')).not.toBeInTheDocument();
    await user.click(within(choice).getByRole('button', { name: 'Save customer choice' }));
    expect(client.put).toHaveBeenCalledWith(`${ADVICE}/customer-choice`, { versionId: 'pv_term' }, { ifMatch: '"v3"' });
  });

  it('AC-M06-14 a recommendation needs a 10 character rationale and posts the chosen shown product', async () => {
    const updated: AdviceView = {
      ...VIEW,
      version: 4,
      recommended: [...VIEW.recommended, { versionId: 'pv_saral', rationale: 'Simple and affordable', productName: 'Saral Jeevan Bima', insurerName: 'HDFC Life' }],
    };
    const client = open({ [ADVICE]: VIEW, [`${ADVICE}/recommendations`]: updated });
    const recs = await screen.findByRole('region', { name: 'Recommendations' });
    const add = within(recs).getByRole('button', { name: 'Add recommendation' });
    expect(within(recs).getByLabelText('Product to recommend').querySelectorAll('option')).toHaveLength(3);
    await user.selectOptions(within(recs).getByLabelText('Product to recommend'), 'pv_saral');
    enter(within(recs).getByLabelText('Rationale'), 'too short');
    expect(add).toBeDisabled();
    enter(within(recs).getByLabelText('Rationale'), 'too short!!');
    expect(add).toBeEnabled();
    enter(within(recs).getByLabelText('Rationale'), 'Simple and affordable');
    await user.click(add);
    expect(await within(recs).findByText('Saral Jeevan Bima (HDFC Life)', { selector: 'strong' })).toBeInTheDocument();
    expect(client.post).toHaveBeenCalledWith(`${ADVICE}/recommendations`, { versionId: 'pv_saral', rationale: 'Simple and affordable' });
    expect(within(recs).getByLabelText('Rationale')).toHaveValue('');
  });

  it('AC-M06-14 an out-of-scope recommendation shows the server title inline and keeps the record', async () => {
    const client = open({ [ADVICE]: VIEW, [`${ADVICE}/recommendations`]: new ApiError(403, 'product_out_of_scope', 'Product is outside your scope') });
    const recs = await screen.findByRole('region', { name: 'Recommendations' });
    await user.selectOptions(within(recs).getByLabelText('Product to recommend'), 'pv_saral');
    enter(within(recs).getByLabelText('Rationale'), 'Simple and affordable');
    await user.click(within(recs).getByRole('button', { name: 'Add recommendation' }));
    expect(await screen.findByText('Product is outside your scope')).toBeInTheDocument();
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('note')).toHaveTextContent(DISCLOSURE);
  });

  it('AC-M06-14 saves notes with the record version in If-Match', async () => {
    const client = open();
    client.put.mockResolvedValue({ ...VIEW, version: 4, suitabilityNotes: 'Updated notes' });
    const notes = await screen.findByRole('textbox', { name: 'Suitability notes' });
    enter(notes, 'Updated notes');
    await user.click(screen.getByRole('button', { name: 'Save notes' }));
    await screen.findByRole('button', { name: 'Save notes' });
    expect(client.put).toHaveBeenCalledWith(`${ADVICE}/notes`, { text: 'Updated notes' }, { ifMatch: '"v3"' });
  });

  it('AC-M06-14 shows the forbidden state and the error state', async () => {
    const denied = renderAt(<AdviceRecordScreen />, mockClient({ [ADVICE]: new ApiError(403, 'forbidden', 'No') }), PATH, ROUTE);
    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
    denied.unmount();
    renderAt(<AdviceRecordScreen />, mockClient({ [ADVICE]: new ApiError(500, 'internal', 'Boom') }), PATH, ROUTE);
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  });
});
