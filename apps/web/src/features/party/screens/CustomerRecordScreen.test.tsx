import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import { mockClient, renderAt, type MockClient } from '../../../test/render';
import { CustomerRecordScreen } from './CustomerRecordScreen';

const user = userEvent.setup({ delay: null });

const PARTY = {
  id: 'cust-1',
  kind: 'PERSON',
  displayName: 'Rajesh Kumar',
  contacts: [],
  preferredLanguage: 'hi',
  preferredChannel: 'WHATSAPP',
  ownerMemberId: 'mem_priya',
  tags: ['vip'],
  source: { kind: 'LEAD' },
  status: 'ACTIVE',
  createdAt: '2024-01-01T00:00:00Z',
  version: 1,
  household: {
    id: 'hh-1',
    name: 'Kumar Family',
    headPartyId: 'cust-1',
    members: [
      { partyId: 'cust-1', relation: 'SELF' },
      { partyId: 'cust-2', relation: 'SPOUSE' },
    ],
  },
  roles: [{ partyId: 'cust-1', role: 'PROPOSER', subjectType: 'HELD_POLICY', subjectId: 'hp1', label: 'Term life', createdAt: '2024-01-01T00:00:00Z' }],
  consentSummary: [
    { purpose: 'SERVICE', channel: 'WHATSAPP', granted: true, occurredAt: '2024-01-01T00:00:00Z', noticeVersion: '1.0' },
    { purpose: 'MARKETING', channel: 'EMAIL', granted: false, occurredAt: '2024-01-02T00:00:00Z', noticeVersion: '1.0' },
  ],
};

const MEMBERS = [
  { id: 'cust-1', displayName: 'Rajesh Kumar', rolesSummary: ['PROPOSER · Term life'], tags: [] },
  { id: 'cust-2', displayName: 'Anita Kumar', rolesSummary: ['INSURED'], tags: [] },
];

function client(whatsapp: unknown = { allowed: true, reason: 'ok' }): MockClient {
  return mockClient({
    '/api/v1/me': { permissions: ['party.write'] },
    '/api/v1/parties/cust-1': PARTY,
    '/api/v1/parties': { items: MEMBERS },
    '/api/v1/parties/cust-1/contactability': (opts: { query: { channel: string } }) =>
      opts.query.channel === 'WHATSAPP' ? whatsapp : { allowed: true, reason: 'ok' },
    '/api/v1/tenant/custom-fields': { items: [], usage: { active: 0, limit: 5 } },
    '/api/v1/parties/cust-1/consents': {},
  });
}

function open(c: MockClient, path = '/crm/customers/cust-1') {
  return renderAt(<CustomerRecordScreen />, c, path, path.replace('cust-1', ':id'));
}

describe('AC-M03-16 CustomerRecordScreen (/crm/customers/:id)', () => {
  it('AC-M03-16 shows the header with household, owner, translated language and channel, and the consent notice version', async () => {
    open(client());
    expect(await screen.findByText('Rajesh Kumar', { selector: 'h1' })).toBeInTheDocument();
    const header = within(screen.getByRole('region', { name: 'Customer summary' }));
    expect(header.getByText('RK')).toBeInTheDocument();
    expect(header.getByText('Kumar Family')).toBeInTheDocument();
    expect(header.getByText('Owner: mem_priya')).toBeInTheDocument();
    expect(header.getByText('Language: Hindi')).toBeInTheDocument();
    expect(header.getByText('Channel: WhatsApp')).toBeInTheDocument();
    expect(header.getByText('Consent notice 1.0')).toBeInTheDocument();
  });

  it('AC-M03-16 the breadcrumb leads back to the customers list of the same shell', async () => {
    open(client());
    const crumbs = within(await screen.findByRole('navigation', { name: 'Breadcrumb' }));
    expect(crumbs.getByRole('link', { name: 'Customers' })).toHaveAttribute('href', '/crm/customers');
  });

  it('AC-M03-16 D6 under the phone shell the breadcrumb stays under /m', async () => {
    open(client(), '/m/customers/cust-1');
    const crumbs = within(await screen.findByRole('navigation', { name: 'Breadcrumb' }));
    expect(crumbs.getByRole('link', { name: 'Customers' })).toHaveAttribute('href', '/m/customers');
  });

  it('AC-M03-16 offers the Overview, Policies, Activity, Documents and Consent tabs in that order', async () => {
    open(client());
    await screen.findByText('Rajesh Kumar', { selector: 'h1' });
    expect(Array.from(document.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent)).toEqual(['Overview', 'Policies', 'Activity', 'Documents', 'Consent']);
  });

  it('AC-M03-16 Overview lists household members by name with relation and roles, and the roles on policies by label', async () => {
    const c = client();
    open(c);
    expect(await screen.findByText('Anita Kumar')).toBeInTheDocument();
    expect(c.get).toHaveBeenCalledWith('/api/v1/parties', { query: { householdId: 'hh-1', limit: 25 } });
    const anita = screen.getByText('Anita Kumar').closest('li');
    expect(anita?.textContent).toBe('Anita KumarSpouseInsured');
    const self = screen.getAllByText('Rajesh Kumar').map((el) => el.closest('li')).find((li) => li?.className === 'household-member');
    expect(self?.textContent).toBe('Rajesh KumarSelfProposer · Term life');
    expect(screen.getByText('Proposer · Term life', { selector: 'li' })).toBeInTheDocument();
  });

  it('AC-M03-16 Consent tab shows purpose and channel by name, Granted or Withdrawn, and IST dates', async () => {
    open(client());
    await user.click(await screen.findByText('Consent', { selector: '[role="tab"]' }));
    const items = Array.from(document.querySelectorAll('li.consent-item'));
    expect(items.map((li) => li.textContent)).toEqual([
      'Service messages · WhatsAppGranted1 Jan 2024',
      'Marketing · EmailWithdrawn2 Jan 2024',
    ]);
  });

  it('AC-M03-16 Activity and Documents say they come in a later module', async () => {
    open(client());
    await user.click(await screen.findByText('Activity', { selector: '[role="tab"]' }));
    expect(screen.getByText('Coming in a later module')).toBeInTheDocument();
    await user.click(screen.getByText('Documents', { selector: '[role="tab"]' }));
    expect(screen.getByText('Coming in a later module')).toBeInTheDocument();
  });

  it('AC-M03-16 WhatsApp is disabled with the reason shown as text when contactability denies; Call stays enabled', async () => {
    open(client({ allowed: false, reason: 'consent_withdrawn' }));
    const whatsapp = await screen.findByRole('button', { name: 'WhatsApp' });
    expect(whatsapp).toBeDisabled();
    expect(whatsapp).toHaveAccessibleDescription('Consent was withdrawn for this channel');
    expect(screen.getByRole('button', { name: 'Call' })).toBeEnabled();
  });

  async function openConsentSheet(c: MockClient) {
    open(c);
    await user.click(await screen.findByText('Consent', { selector: '[role="tab"]' }));
    await user.click(screen.getByText('Record consent'));
  }

  it('AC-M03-16 records a consent withdrawal with an Idempotency-Key, as ASSISTED, and refreshes the record', async () => {
    const c = client();
    await openConsentSheet(c);
    expect(screen.getByText(/Notice version: 1\.0/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Purpose'), 'MARKETING');
    await user.selectOptions(screen.getByLabelText('Channel'), 'SMS');
    await user.click(screen.getByLabelText('Withdrawn'));
    const loadsBefore = c.get.mock.calls.filter(([path]) => path === '/api/v1/parties/cust-1').length;

    await user.click(screen.getByText('Save consent'));

    expect(c.post).toHaveBeenCalledTimes(1);
    const [url, body, options] = c.post.mock.calls[0] as [string, unknown, { idempotencyKey: string }];
    expect(url).toBe('/api/v1/parties/cust-1/consents');
    expect(body).toEqual({ purpose: 'MARKETING', channel: 'SMS', granted: false, noticeVersion: '1.0', source: 'ASSISTED' });
    expect(options.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.get.mock.calls.filter(([path]) => path === '/api/v1/parties/cust-1').length).toBe(loadsBefore + 1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('AC-M03-16 the consent options are translated, never the raw codes', async () => {
    await openConsentSheet(client());
    const purposes = within(screen.getByLabelText('Purpose')).getAllByRole('option');
    expect(purposes.map((o) => o.textContent)).toEqual(['Service messages', 'Marketing', 'AI processing', 'Data sharing with insurer']);
    const channels = within(screen.getByLabelText('Channel')).getAllByRole('option');
    expect(channels.map((o) => o.textContent)).toEqual(['WhatsApp', 'SMS', 'Email', 'Call']);
  });

  it('AC-M03-16 keeps the sheet open and shows the server title inline when saving consent fails', async () => {
    const c = client();
    c.post.mockRejectedValueOnce(new ApiError(503, 'unavailable', 'Unavailable'));
    await openConsentSheet(c);
    await user.click(screen.getByText('Save consent'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Consent could not be saved: Unavailable');
    expect(screen.getByText('Save consent')).toBeInTheDocument();
  });

  it('AC-M03-16 a server error shows the error state with a retry', async () => {
    const c = mockClient({
      '/api/v1/parties/cust-1': new ApiError(500, 'boom', 'Server error', 'Internal server error', 'trace-123456789'),
      '/api/v1/parties/cust-1/contactability': { allowed: true, reason: 'ok' },
    });
    open(c);
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('AC-M03-16 403 shows the permission state', async () => {
    const c = mockClient({
      '/api/v1/parties/cust-1': new ApiError(403, 'forbidden', 'Forbidden'),
      '/api/v1/parties/cust-1/contactability': { allowed: true, reason: 'ok' },
    });
    open(c);
    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
  });
});
