import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import type { LeadDetailView, TaskView } from '../api';
import { MobileLeadScreen } from './MobileLeadScreen';
import { mockClient, renderAt } from '../../../test/render';

const LEAD: LeadDetailView = {
  id: 'lead_1', partyId: 'pty_1', name: 'Asha Verma', mobileMasked: '+91 98XXX XXX01', productInterest: 'TERM_LIFE', source: 'REFERRAL', ownerMemberId: 'mem_1',
  stage: 'CONTACTED', temperature: 'HOT', slaState: 'met', consent: 'granted', createdAt: '2026-10-01T00:00:00.000Z',
  contact: { mobileMasked: '+91 98XXX XXX01' }, qualification: {},
  attribution: { source: 'REFERRAL', firstTouch: { channel: 'REFERRAL', at: '2026-10-01T00:00:00.000Z' }, lastTouch: { channel: 'REFERRAL', at: '2026-10-01T00:00:00.000Z' } },
  stageHistory: [], stageRules: { QUALIFIED: { met: false, missing: ['Complete qualification'] } }, possibleMatches: [], consentSummary: [], activities: [],
  openTasks: [], syncState: 'synced', version: 2,
} as LeadDetailView;
const task = (id: string, title: string, dueAt: string) => ({ id, title, dueAt, kind: 'CALL', status: 'OPEN', version: 1 }) as TaskView;
const PATH = '/api/v1/leads/lead_1';
const at = (lead: LeadDetailView, extra: Record<string, unknown> = {}) => renderAt(<MobileLeadScreen />, mockClient({ [PATH]: lead, ...extra }), '/m/leads/lead_1', '/m/leads/:id');

describe('AC-M04-26 MobileLeadScreen (/m/leads/:id)', () => {
  it('AC-M04-26 shows the header with translated temperature, product and source, and the earliest open task', async () => {
    at({ ...LEAD, openTasks: [task('t2', 'Send quote', '2026-10-05T10:00:00.000Z'), task('t1', 'Call back', '2026-10-04T10:00:00.000Z')] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Asha Verma' })).toBeInTheDocument();
    expect(screen.getByText('Hot')).toBeInTheDocument();
    expect(screen.getByText('Term life')).toBeInTheDocument();
    expect(screen.getByText('Referral')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Next task' })).toHaveTextContent('Call back');
  });

  it('BUG-16 AC-M04-26 shows the created date and the next task in IST, with a back link to the list', async () => {
    at({ ...LEAD, openTasks: [task('t1', 'Call back', '2026-10-04T10:00:00.000Z')] });
    expect(await screen.findByText('Created 1 Oct 2026')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Next task' })).toHaveTextContent('Call back · 4 Oct 2026, 3:30 pm');
    expect(screen.getByRole('link', { name: 'Leads' })).toHaveAttribute('href', '/m/leads');
  });

  it('AC-M04-26 convert is disabled with "Qualify the lead first" until the lead is qualified', async () => {
    at(LEAD);
    const convert = await screen.findByRole('button', { name: 'Convert' });
    expect(convert).toBeDisabled();
    expect(convert).toHaveAccessibleDescription('Qualify the lead first');
  });

  it('AC-M04-26 a qualified lead can be converted, then the list is shown', async () => {
    const client = mockClient({ [PATH]: { ...LEAD, stage: 'QUALIFIED' }, '/api/v1/leads/lead_1/conversion': { opportunityId: 'opp_1', partyId: 'pty_1' } });
    renderAt(<MobileLeadScreen />, client, '/m/leads/lead_1', '/m/leads/:id');
    await userEvent.click(await screen.findByRole('button', { name: 'Convert' }));
    expect(screen.queryByText('Qualify the lead first')).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('spinbutton'), '2500000');
    const submit = screen.getAllByRole('button', { name: 'Convert' }).find((b) => b.getAttribute('type') === 'submit');
    await userEvent.click(submit as HTMLElement);
    expect(client.post.mock.calls[0]?.slice(0, 2)).toEqual([
      '/api/v1/leads/lead_1/conversion',
      { partyChoice: 'LEAD_PARTY', productInterest: 'TERM_LIFE', expectedPremiumPaise: 2500000, startStage: 'DISCOVERY' },
    ]);
    expect(await screen.findByTestId('location')).toHaveTextContent('/m/leads');
  });

  it('AC-M04-26 a blocked stage shows the missing entry rules without calling the server', async () => {
    const client = mockClient({ [PATH]: LEAD });
    renderAt(<MobileLeadScreen />, client, '/m/leads/lead_1', '/m/leads/:id');
    await userEvent.click(await screen.findByRole('button', { name: 'Qualified' }));
    expect(screen.getByText(/Complete qualification/)).toBeInTheDocument();
    expect(client.post).not.toHaveBeenCalled();
  });

  it('AC-M04-26 a server rejection is shown inline and the record stays on screen', async () => {
    const client = mockClient({ [PATH]: { ...LEAD, stageRules: {} } });
    client.post.mockRejectedValue(new ApiError(422, 'stage_rules_unmet', 'Consent must be recorded first'));
    renderAt(<MobileLeadScreen />, client, '/m/leads/lead_1', '/m/leads/:id');
    await userEvent.click(await screen.findByRole('button', { name: 'Qualified' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That did not go through: Consent must be recorded first');
    expect(screen.getByRole('heading', { level: 1, name: 'Asha Verma' })).toBeInTheDocument();
  });

  it('AC-M04-26 404 and 403 states', async () => {
    const missing = renderAt(<MobileLeadScreen />, mockClient({ [PATH]: new ApiError(404, 'lead_not_found', 'Lead not found') }), '/m/leads/lead_1', '/m/leads/:id');
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    missing.unmount();
    renderAt(<MobileLeadScreen />, mockClient({ [PATH]: new ApiError(403, 'forbidden', 'No') }), '/m/leads/lead_1', '/m/leads/:id');
    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
  });
});
