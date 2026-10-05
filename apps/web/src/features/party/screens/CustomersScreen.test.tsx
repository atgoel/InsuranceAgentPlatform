import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import { mockClient, renderAt, type MockClient } from '../../../test/render';
import type { PartyListItem } from '../api';
import { CustomersScreen } from './CustomersScreen';

const user = userEvent.setup({ delay: null });

const ARJUN: PartyListItem = {
  id: 'p_arjun',
  displayName: 'Arjun Reddy',
  primaryMobileMasked: '+91 ••••• ••210',
  householdName: 'Reddy household',
  rolesSummary: ['PROPOSER · Term life', 'INSURED'],
  tags: ['vip'],
  ownerMemberId: 'mem_priya',
  ownerName: 'Priya Nair',
};
const FARHAN: PartyListItem = { id: 'p_farhan', displayName: 'Farhan Khan', rolesSummary: [], tags: [] };
const SPOUSE: PartyListItem = { id: 'p_sana', displayName: 'Sana Reddy', rolesSummary: ['NOMINEE'], tags: [] };

const PARTY_DETAIL = {
  id: 'p_arjun',
  household: {
    id: 'hh_1',
    name: 'Reddy household',
    headPartyId: 'p_arjun',
    members: [
      { partyId: 'p_arjun', relation: 'SELF' },
      { partyId: 'p_sana', relation: 'SPOUSE' },
    ],
  },
};

function client(items: PartyListItem[] = [ARJUN, FARHAN]): MockClient {
  return mockClient({
    '/api/v1/parties': (opts: { query?: { householdId?: string } }) =>
      opts.query?.householdId ? { items: [ARJUN, SPOUSE] } : { items },
    '/api/v1/parties/p_arjun': PARTY_DETAIL,
    '/api/v1/me': { permissions: ['crm.opportunity.write'] },
    '/api/v1/opportunities': { id: 'opp_new' },
  });
}

function listQueries(c: MockClient): Array<Record<string, unknown>> {
  return c.get.mock.calls
    .filter(([path]) => path === '/api/v1/parties')
    .map(([, opts]) => (opts as { query: Record<string, unknown> }).query);
}

function open(c: MockClient, path = '/crm/customers') {
  return renderAt(<CustomersScreen />, c, path, path);
}

describe('AC-M03-15 CustomersScreen (/crm/customers)', () => {
  it('AC-M03-15 AC-M03-20 shows the seeded parties as rows with masked mobile, household, translated roles, owner name and tags', async () => {
    open(client());
    const row = (await screen.findByText('Arjun Reddy')).closest('tr');
    expect(row?.textContent).toBe('Arjun Reddy+91 ••••• ••210Reddy householdProposer · Term life, InsuredPriya Nairvip');
    expect(screen.getByText('Farhan Khan')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 customers')).toBeInTheDocument();
    expect(screen.getByText('Shared numbers never merge people automatically.')).toBeInTheDocument();
  });

  it('AC-M03-15 requests the list once with no tag or segment and offers the four chips without counts', async () => {
    const c = client();
    const view = open(c);
    await screen.findByText('Arjun Reddy');

    expect(listQueries(c)).toEqual([{ limit: 25 }]);
    const segments = within(screen.getByRole('group', { name: 'Segments' }));
    expect(segments.getAllByRole('button').map((b) => b.textContent)).toEqual(['All', 'With dues', 'No policy', 'Tags']);
    expect(segments.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(view.container.querySelector('.count-chip-badge')).toBeNull();
  });

  it('AC-M03-15 With dues requests segment=with_dues and No policy requests segment=no_policy, never as a tag', async () => {
    const c = client();
    open(c);
    await screen.findByText('Arjun Reddy');

    await user.click(screen.getByRole('button', { name: 'With dues' }));
    await waitFor(() => expect(listQueries(c).at(-1)).toEqual({ segment: 'with_dues', limit: 25 }));
    expect(screen.getByRole('button', { name: 'With dues' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'No policy' }));
    await waitFor(() => expect(listQueries(c).at(-1)).toEqual({ segment: 'no_policy', limit: 25 }));

    await user.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(listQueries(c).at(-1)).toEqual({ limit: 25 }));
  });

  it('AC-M03-20 shows a dash, never the member id, when the owner name is absent', async () => {
    const orphan: PartyListItem = { ...FARHAN, ownerMemberId: 'mem_gone' };
    open(client([orphan]));
    const row = (await screen.findByText('Farhan Khan')).closest('tr');
    expect(row?.textContent).toBe('Farhan Khan–––––');
    expect(screen.queryByText('mem_gone')).not.toBeInTheDocument();
  });

  it('AC-M03-15 the Tags segment shows a tag field and sends it as the tag filter', async () => {
    const c = client();
    open(c);
    await screen.findByText('Arjun Reddy');
    await user.click(screen.getByRole('button', { name: 'Tags' }));
    expect(screen.getByRole('button', { name: 'Tags' })).toHaveAttribute('aria-pressed', 'true');
    await user.type(screen.getByLabelText('Tag'), 'vip');
    await waitFor(() => expect(listQueries(c).at(-1)).toEqual({ tag: 'vip', limit: 25 }));
  });

  it('AC-M03-15 searching sends q and keeps the search box mounted while the list reloads', async () => {
    const c = client();
    open(c);
    await screen.findByText('Arjun Reddy');
    const box = screen.getByLabelText('Search customers');
    await user.type(box, 'Arjun');
    await waitFor(() => expect(listQueries(c).at(-1)).toEqual({ q: 'Arjun', limit: 25 }));
    expect(screen.getByLabelText('Search customers')).toBe(box);
    expect(box).toHaveValue('Arjun');
  });

  it('AC-M03-15 the search box is on screen while the first load is pending', () => {
    const c = mockClient({});
    c.get.mockImplementation(() => new Promise(() => undefined));
    open(c);
    expect(screen.getByLabelText('Search customers')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('AC-M03-15 selecting a row opens the household panel with members, relations and roles', async () => {
    const c = client();
    open(c);
    await user.click(await screen.findByRole('button', { name: 'Arjun Reddy' }));

    const panel = within(await screen.findByRole('complementary', { name: 'Household details' }));
    expect(await panel.findByText('Sana Reddy')).toBeInTheDocument();
    expect(panel.getByText('Spouse')).toBeInTheDocument();
    expect(panel.getByText('Self')).toBeInTheDocument();
    expect(panel.getByText('Nominee')).toBeInTheDocument();
    expect(c.get).toHaveBeenCalledWith('/api/v1/parties/p_arjun');
    expect(listQueries(c).at(-1)).toEqual({ householdId: 'hh_1', limit: 25 });
    await user.click(panel.getByRole('button', { name: 'Close panel' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('AC-M04-31 the household panel offers Create opportunity and posts the exact body with an idempotency key', async () => {
    const c = client();
    open(c);
    await user.click(await screen.findByRole('button', { name: 'Arjun Reddy' }));
    const panel = within(await screen.findByRole('complementary', { name: 'Household details' }));
    await user.click(await panel.findByRole('button', { name: 'Create opportunity' }));
    const sheet = within(screen.getByRole('dialog'));
    await user.selectOptions(sheet.getByLabelText('Product line'), 'HEALTH');
    await user.type(sheet.getByLabelText('Title'), 'Arjun - Health');
    await user.type(sheet.getByLabelText('Expected premium (₹)'), '1234.56');
    await user.click(sheet.getByRole('button', { name: 'Create' }));

    expect(await screen.findByTestId('location')).toHaveTextContent('/crm/pipeline');
    expect(c.post).toHaveBeenCalledTimes(1);
    const [path, body, options] = c.post.mock.calls[0];
    expect(path).toBe('/api/v1/opportunities');
    expect(body).toEqual({ partyId: 'p_arjun', productInterest: 'HEALTH', title: 'Arjun - Health', expectedPremiumPaise: 123456 });
    expect(options.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('AC-M04-31 Create opportunity is absent without crm.opportunity.write', async () => {
    const c = mockClient({
      '/api/v1/me': { permissions: ['party.write'] },
      '/api/v1/parties': { items: [ARJUN] },
      '/api/v1/parties/p_arjun': PARTY_DETAIL,
    });
    open(c);
    await user.click(await screen.findByRole('button', { name: 'Arjun Reddy' }));
    await screen.findByRole('button', { name: 'Open full record' });
    await waitFor(() => expect(c.get).toHaveBeenCalledWith('/api/v1/me'));
    expect(screen.queryByRole('button', { name: 'Create opportunity' })).not.toBeInTheDocument();
  });

  it('AC-M04-31 a rejected create shows the server title inline, keeps the sheet and the typed values and does not navigate', async () => {
    const c = client();
    c.post.mockRejectedValue(new ApiError(404, 'not_found', 'Customer not found'));
    open(c);
    await user.click(await screen.findByRole('button', { name: 'Arjun Reddy' }));
    await user.click(await screen.findByRole('button', { name: 'Create opportunity' }));
    const sheet = within(screen.getByRole('dialog'));
    await user.type(sheet.getByLabelText('Title'), 'Arjun - Term');
    await user.type(sheet.getByLabelText('Expected premium (₹)'), '5000');
    await user.click(sheet.getByRole('button', { name: 'Create' }));

    expect(await sheet.findByRole('alert')).toHaveTextContent('Customer not found');
    expect(sheet.getByLabelText('Title')).toHaveValue('Arjun - Term');
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Arjun Reddy' })).toBeInTheDocument();
  });

  it('AC-M04-31 the sheet blocks a title under 3 characters and a malformed premium, and sends nothing', async () => {
    const c = client();
    open(c);
    await user.click(await screen.findByRole('button', { name: 'Arjun Reddy' }));
    await user.click(await screen.findByRole('button', { name: 'Create opportunity' }));
    const sheet = within(screen.getByRole('dialog'));
    await user.type(sheet.getByLabelText('Title'), 'ab');
    await user.type(sheet.getByLabelText('Expected premium (₹)'), '12.345');
    expect(sheet.getByText('Enter 3 to 120 characters')).toBeInTheDocument();
    expect(sheet.getByText('Enter an amount in rupees, up to two decimals')).toBeInTheDocument();
    expect(sheet.getByRole('button', { name: 'Create' })).toBeDisabled();
    expect(c.post).not.toHaveBeenCalled();
  });

  it('AC-M03-15 Open full record goes to the record inside the CRM shell', async () => {
    open(client());
    await user.click(await screen.findByRole('button', { name: 'Arjun Reddy' }));
    await user.click(await screen.findByRole('button', { name: 'Open full record' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/crm/customers/p_arjun');
  });

  it('AC-M03-15 D6 under the phone shell the record link stays under /m', async () => {
    open(client(), '/m/customers');
    await user.click(await screen.findByRole('button', { name: 'Arjun Reddy' }));
    await user.click(await screen.findByRole('button', { name: 'Open full record' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/m/customers/p_arjun');
  });

  it('AC-M03-15 an empty list shows the empty state and keeps the filters', async () => {
    open(client([]));
    expect(await screen.findByText('No customers in this view')).toBeInTheDocument();
    expect(screen.getByLabelText('Search customers')).toBeInTheDocument();
  });

  it('AC-M03-15 a server error is shown inline with the filters still on screen, and retry loads the list', async () => {
    let failing = true;
    const c = mockClient({
      '/api/v1/parties': () => {
        if (failing) throw new ApiError(500, 'boom', 'Server error', 'Internal server error', 'trace-123456789');
        return { items: [ARJUN] };
      },
    });
    open(c);
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByLabelText('Search customers')).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Arjun Reddy')).toBeInTheDocument();
  });

  it('AC-M03-15 403 shows the permission state', async () => {
    open(mockClient({ '/api/v1/parties': new ApiError(403, 'forbidden', 'Forbidden') }));
    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
  });
});
