import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import { mockClient, renderAt, type MockClient } from '../../../test/render';
import { PipelineScreen } from './PipelineScreen';
import { type BoardResponse, type OpportunityView } from '../api';

const THREE_DAYS_AGO = new Date(Date.now() - 3 * 86_400_000).toISOString();

function opp(id: string, title: string, stage: OpportunityView['stage'], paise: number): OpportunityView {
  return {
    id,
    partyId: `party-${id}`,
    productInterest: 'TERM_LIFE',
    title,
    expectedPremium: { amountPaise: paise, currency: 'INR' },
    stage,
    ownerMemberId: 'member-1',
    createdAt: THREE_DAYS_AGO,
    stageEnteredAt: THREE_DAYS_AGO,
    version: 1,
  };
}

const board: BoardResponse = {
  columns: [
    { stage: 'DISCOVERY', count: 3, totalExpectedPremiumPaise: 500000, items: [opp('opp-1', 'Rajesh Kumar - Term', 'DISCOVERY', 500000)] },
    { stage: 'QUOTE_SHARED', count: 2, totalExpectedPremiumPaise: 12345678, items: [opp('opp-2', 'Priya Sharma - Health', 'QUOTE_SHARED', 12345678)] },
    { stage: 'PROPOSAL_COMPLETE', count: 0, totalExpectedPremiumPaise: 0, items: [] },
    { stage: 'INSURER_PENDING', count: 1, totalExpectedPremiumPaise: 200000, items: [opp('opp-3', 'Amit Patel - Retirement', 'INSURER_PENDING', 200000)] },
  ],
  closed: { issued: 5, lost: 2 },
  stats: { openCount: 7, openExpectedPremiumPaise: 1100000, medianDaysToIssue: 15, winRate90d: 42 },
};

function client(): MockClient {
  return mockClient({ '/api/v1/opportunities': board, '/api/v1/opportunities/opp-1/stage-transitions': {}, '/api/v1/opportunities/opp-1/loss': {} });
}

describe('AC-M04-27 PipelineScreen', () => {
  it('AC-M04-27 UI-06 shows the four stage columns in order with count and premium total', async () => {
    renderAt(<PipelineScreen />, client(), '/crm/pipeline');
    await screen.findByText('Rajesh Kumar - Term');
    const names = Array.from(document.querySelectorAll('.board-column h3')).map((h) => h.textContent);
    expect(names).toEqual(['Needs analysis', 'Quoted', 'Proposal', 'Insurer pending']);
    const discovery = screen.getByRole('region', { name: 'Needs analysis' });
    expect(within(discovery).getByText('3')).toBeInTheDocument();
    expect(within(discovery).getAllByText('₹5,000')).toHaveLength(2);
    const quoted = screen.getByRole('region', { name: 'Quoted' });
    expect(within(quoted).getAllByText('₹1,23,456.78')).toHaveLength(2);
    expect(within(screen.getByRole('region', { name: 'Proposal' })).getByText('No opportunities')).toBeInTheDocument();
  });

  it('AC-M04-27 UI-06 shows the KPI tiles from the board stats', async () => {
    renderAt(<PipelineScreen />, client(), '/crm/pipeline');
    await screen.findByText('Rajesh Kumar - Term');
    const values = Array.from(document.querySelectorAll('.kpi-tile-value')).map((node) => node.textContent);
    expect(values).toEqual(['7', '₹11,000', '15', '42%']);
  });

  it('AC-M04-27 UI-06 BUG-09 card shows the product label and age in days', async () => {
    renderAt(<PipelineScreen />, client(), '/crm/pipeline');
    await screen.findByText('Rajesh Kumar - Term');
    expect(screen.getAllByText('Term life · 3d')).toHaveLength(3);
  });

  it('AC-M04-27 moves an opportunity to the next stage with the exact request', async () => {
    const c = client();
    renderAt(<PipelineScreen />, c, '/crm/pipeline');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Move Rajesh Kumar - Term forward' }));
    expect(c.post).toHaveBeenCalledWith(
      '/api/v1/opportunities/opp-1/stage-transitions',
      { to: 'QUOTE_SHARED' },
      { idempotencyKey: expect.any(String) },
    );
  });

  it('AC-M04-27 only adjacent moves exist: no back on the first column, no forward on the last', async () => {
    renderAt(<PipelineScreen />, client(), '/crm/pipeline');
    await screen.findByText('Rajesh Kumar - Term');
    expect(screen.queryByRole('button', { name: 'Move Rajesh Kumar - Term back' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Move Priya Sharma - Health back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Amit Patel - Retirement back' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move Amit Patel - Retirement forward' })).toBeNull();
  });

  it('AC-M04-27 lost needs a reason in a sheet and posts it', async () => {
    const c = client();
    renderAt(<PipelineScreen />, c, '/crm/pipeline');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Mark Rajesh Kumar - Term as lost' }));
    const confirm = screen.getByRole('button', { name: 'Confirm lost' });
    expect(confirm).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Reason (required)'), 'PREMIUM_TOO_HIGH');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(c.post).toHaveBeenCalledWith('/api/v1/opportunities/opp-1/loss', { reason: 'PREMIUM_TOO_HIGH' }, { idempotencyKey: expect.any(String) });
  });

  it('AC-M04-27 lost reasons are translated, never raw codes', async () => {
    renderAt(<PipelineScreen />, client(), '/crm/pipeline');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Mark Rajesh Kumar - Term as lost' }));
    const labels = within(screen.getByLabelText('Reason (required)')).getAllByRole('option').map((o) => o.textContent);
    expect(labels).toEqual([
      'Select reason',
      'Bought elsewhere',
      'Premium too high',
      'Declined by insurer underwriting',
      'Not reachable',
      'Postponed decision',
      'Not interested',
      'Other',
    ]);
  });

  it('AC-M04-27 has no control to mark issued and says won comes from the insurer', async () => {
    renderAt(<PipelineScreen />, client(), '/crm/pipeline');
    await screen.findByText('Rajesh Kumar - Term');
    expect(screen.queryByRole('button', { name: /issued|won/i })).toBeNull();
    expect(screen.getByText("Expected premium by stage. Won is set only by the insurer's issuance confirmation.")).toBeInTheDocument();
    expect(screen.getByText('Issued: 5')).toBeInTheDocument();
    expect(screen.getByText('Lost: 2')).toBeInTheDocument();
  });

  it('AC-M04-27 a failed move is shown inline and the board stays on screen', async () => {
    const c = client();
    c.post.mockRejectedValueOnce(new ApiError(422, 'stage_rule_failed', 'Proposal is incomplete'));
    renderAt(<PipelineScreen />, c, '/crm/pipeline');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Move Rajesh Kumar - Term forward' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That did not go through: Proposal is incomplete');
    expect(screen.getByText('Rajesh Kumar - Term')).toBeInTheDocument();
  });

  it('AC-M04-27 the product filter is an API query', async () => {
    const c = client();
    renderAt(<PipelineScreen />, c, '/crm/pipeline');
    const user = userEvent.setup();
    await screen.findByText('Rajesh Kumar - Term');
    await user.selectOptions(screen.getByLabelText('Product'), 'HEALTH');
    await waitFor(() => expect(c.get).toHaveBeenLastCalledWith('/api/v1/opportunities', { query: { view: 'board', owner: undefined, product: 'HEALTH' } }));
  });

  it('AC-M04-27 shows an inline error with the filter still mounted when the board fails', async () => {
    const c = mockClient({ '/api/v1/opportunities': new ApiError(500, 'boom', 'Server broke') });
    renderAt(<PipelineScreen />, c, '/crm/pipeline');
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByLabelText('Product')).toBeInTheDocument();
  });

  it('AC-M04-27 shows Access Denied for a 403', async () => {
    const c = mockClient({ '/api/v1/opportunities': new ApiError(403, 'forbidden', 'No') });
    renderAt(<PipelineScreen />, c, '/crm/pipeline');
    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
  });
});
