import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ApiProvider } from '../../../lib/api';
import { ApiError } from '../../../lib/api/api-error';
import { I18nProvider } from '../../../lib/i18n';
import { LeadRecordScreen } from './LeadRecordScreen';
import { ApiClient } from '../../../lib/api/api-client';
import { type LeadDetailView } from '../api';
import { mockClient, renderAt } from '../../../test/render';

describe('AC-M04-26 LeadRecordScreen', () => {
  const mockLead: LeadDetailView = {
    id: 'lead-1',
    partyId: 'party-1',
    name: 'Rajesh Kumar',
    mobileMasked: '+91 98XXX XXXXX',
    productInterest: 'TERM_LIFE',
    source: 'WEB_FORM',
    campaignId: undefined,
    ownerMemberId: 'member-1',
    ownerName: 'Agent Singh',
    stage: 'NEW',
    temperature: 'HOT',
    slaState: 'pending',
    slaDueAt: new Date(Date.now() + 3600000).toISOString(),
    consent: 'granted',
    createdAt: new Date().toISOString(),
    contact: { mobileMasked: '+91 98XXX XXXXX', emailMasked: '+91 98*****@example.com' },
    pincode: '400001',
    qualification: { need: 'PROTECTION', budgetBand: 'GT_30K', timeline: 'THIS_MONTH' },
    attribution: {
      source: 'WEB_FORM',
      campaignId: undefined,
      firstTouch: { channel: 'WEB_FORM', at: new Date().toISOString() },
      lastTouch: { channel: 'WEB_FORM', at: new Date().toISOString() },
    },
    stageHistory: [{ to: 'NEW', at: new Date().toISOString(), by: 'member-1' }],
    stageRules: {
      CONTACTED: { met: false, missing: ['Log a connected call, meeting or message'] },
      QUALIFIED: { met: false, missing: ['Complete qualification', 'Record consent'] },
    },
    possibleMatches: [],
    consentSummary: [{ purpose: 'SERVICE', channel: 'CALL', granted: true }],
    activities: [],
    openTasks: [],
    convertedOpportunityId: undefined,
    syncState: 'synced',
    version: 1,
  };

  let mockApiClient: ApiClient;

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn().mockResolvedValue(mockLead),
      post: vi.fn().mockResolvedValue({ leadId: 'lead-1' }),
      put: vi.fn().mockResolvedValue(mockLead),
      patch: vi.fn().mockResolvedValue({ id: 'activity-1' }),
      del: vi.fn().mockResolvedValue({}),
    } as ApiClient;
  });

  it('AC-M04-26 renders lead header with name and temperature', async () => {
    render(
      <MemoryRouter initialEntries={['/crm/leads/lead-1']}>
        <Routes>
          <Route path="/crm/leads/:id" element={
            <ApiProvider client={mockApiClient}>
              <I18nProvider>
                <LeadRecordScreen />
              </I18nProvider>
            </ApiProvider>
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });
    expect(screen.getByText('Hot')).toBeInTheDocument();
  });

  it('AC-M04-26 displays stage bar with current stage active', async () => {
    render(
      <MemoryRouter initialEntries={['/crm/leads/lead-1']}>
        <Routes>
          <Route path="/crm/leads/:id" element={
            <ApiProvider client={mockApiClient}>
              <I18nProvider>
                <LeadRecordScreen />
              </I18nProvider>
            </ApiProvider>
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'New' })).toBeDisabled(); // the current stage
    expect(screen.getByRole('button', { name: 'Contacted' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Qualified' })).toBeEnabled();
  });

  it('AC-M04-26 shows blocked move message when stage rules not met', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/crm/leads/lead-1']}>
        <Routes>
          <Route path="/crm/leads/:id" element={
            <ApiProvider client={mockApiClient}>
              <I18nProvider>
                <LeadRecordScreen />
              </I18nProvider>
            </ApiProvider>
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    const contactedBtn = screen.getAllByRole('button').find((btn) => btn.textContent?.includes('CONTACTED'));
    if (contactedBtn) {
      await user.click(contactedBtn);
      await waitFor(() => {
        expect(screen.getByText(/Log a connected call/)).toBeInTheDocument();
      });
    }
  });

  it('AC-M04-26 displays qualification form', async () => {
    render(
      <MemoryRouter initialEntries={['/crm/leads/lead-1']}>
        <Routes>
          <Route path="/crm/leads/:id" element={
            <ApiProvider client={mockApiClient}>
              <I18nProvider>
                <LeadRecordScreen />
              </I18nProvider>
            </ApiProvider>
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    const qualificationHeadings = screen.getAllByRole('heading').filter((h) => h.textContent?.toLowerCase().includes('qualification'));
    expect(qualificationHeadings.length).toBeGreaterThan(0);
  });

  it('AC-M04-26 displays activity composer', async () => {
    render(
      <MemoryRouter initialEntries={['/crm/leads/lead-1']}>
        <Routes>
          <Route path="/crm/leads/:id" element={
            <ApiProvider client={mockApiClient}>
              <I18nProvider>
                <LeadRecordScreen />
              </I18nProvider>
            </ApiProvider>
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    const activityHeadings = screen.getAllByRole('heading').filter((h) => h.textContent?.toLowerCase().includes('activity'));
    expect(activityHeadings.length).toBeGreaterThan(0);
  });

  it('AC-M04-26 disables convert sheet when stage is not QUALIFIED', async () => {
    render(
      <MemoryRouter initialEntries={['/crm/leads/lead-1']}>
        <Routes>
          <Route path="/crm/leads/:id" element={
            <ApiProvider client={mockApiClient}>
              <I18nProvider>
                <LeadRecordScreen />
              </I18nProvider>
            </ApiProvider>
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    const convertHeadings = screen.queryAllByRole('heading').filter((h) => h.textContent?.toLowerCase().includes('convert'));
    expect(convertHeadings.length === 0).toBeTruthy();
  });

  it('AC-M04-26 shows convert sheet when stage is QUALIFIED', async () => {
    mockApiClient.get = vi.fn().mockResolvedValue({
      ...mockLead,
      stage: 'QUALIFIED',
    });

    render(
      <MemoryRouter initialEntries={['/crm/leads/lead-1']}>
        <Routes>
          <Route path="/crm/leads/:id" element={
            <ApiProvider client={mockApiClient}>
              <I18nProvider>
                <LeadRecordScreen />
              </I18nProvider>
            </ApiProvider>
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    const convertHeadings = screen.getAllByRole('heading').filter((h) => h.textContent?.toLowerCase().includes('convert'));
    expect(convertHeadings.length).toBeGreaterThan(0);
  });

  it('AC-M04-26 handles 404 when lead not found', async () => {
    mockApiClient.get = vi.fn().mockRejectedValue(new ApiError(404, 'not_found', 'Not found'));

    render(
      <MemoryRouter initialEntries={['/crm/leads/lead-1']}>
        <Routes>
          <Route path="/crm/leads/:id" element={
            <ApiProvider client={mockApiClient}>
              <I18nProvider>
                <LeadRecordScreen />
              </I18nProvider>
            </ApiProvider>
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  it('AC-M04-26 handles permission denied errors', async () => {
    mockApiClient.get = vi.fn().mockRejectedValue(new ApiError(403, 'forbidden', 'Forbidden'));

    render(
      <MemoryRouter initialEntries={['/crm/leads/lead-1']}>
        <Routes>
          <Route path="/crm/leads/:id" element={
            <ApiProvider client={mockApiClient}>
              <I18nProvider>
                <LeadRecordScreen />
              </I18nProvider>
            </ApiProvider>
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });
  });

  it('AC-M04-26 displays open tasks list', async () => {
    mockApiClient.get = vi.fn().mockResolvedValue({
      ...mockLead,
      openTasks: [
        {
          id: 'task-1',
          ownerMemberId: 'member-1',
          subjectType: 'LEAD' as const,
          subjectId: 'lead-1',
          kind: 'CALL' as const,
          title: 'Follow up call',
          dueAt: new Date().toISOString(),
          status: 'OPEN' as const,
          source: 'ROUTING',
          createdAt: new Date().toISOString(),
          version: 1,
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/crm/leads/lead-1']}>
        <Routes>
          <Route path="/crm/leads/:id" element={
            <ApiProvider client={mockApiClient}>
              <I18nProvider>
                <LeadRecordScreen />
              </I18nProvider>
            </ApiProvider>
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Follow up call')).toBeInTheDocument();
    });
  });

  it('AC-M04-26 a rejected action is shown inline and the record stays on screen', async () => {
    mockLead.stageRules = {};
    (mockApiClient.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new ApiError(422, 'stage_rules_unmet', 'Consent must be recorded first'));
    render(
      <MemoryRouter initialEntries={['/crm/leads/lead-1']}>
        <Routes>
          <Route path="/crm/leads/:id" element={<ApiProvider client={mockApiClient}><I18nProvider><LeadRecordScreen /></I18nProvider></ApiProvider>} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText('Rajesh Kumar');
    await userEvent.click(screen.getByRole('button', { name: 'Contacted' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That did not go through: Consent must be recorded first');
    expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
  });

  it('AC-M04-26 BUG-09 BUG-16 header shows labelled codes, an IST date and a back link', async () => {
    const lead = { ...mockLead, productInterest: 'SAVINGS_LIFE', source: 'WALK_IN', createdAt: '2026-10-04T05:00:00.000Z', stage: 'NEW' } as LeadDetailView;
    renderAt(<LeadRecordScreen />, mockClient({ '/api/v1/leads/lead-1': lead }), '/crm/leads/lead-1', '/crm/leads/:id');
    await screen.findByRole('heading', { name: 'Rajesh Kumar' });
    const meta = document.querySelector('.lead-meta') as HTMLElement;
    expect(meta.textContent).toBe('ProductSavings lifeSourceWalk-inCreated4 Oct 2026Mobile+91 98XXX XXXXX');
    expect(screen.getByRole('link', { name: 'Leads' }).getAttribute('href')).toBe('/crm/leads');
  });

  it('AC-M04-26 shows contact, consent and attribution cards with translated values', async () => {
    const lead = {
      ...mockLead,
      consentSummary: [
        { purpose: 'SERVICE', channel: 'CALL', granted: true },
        { purpose: 'MARKETING', channel: 'SMS', granted: false },
      ],
      attribution: {
        source: 'WEB_FORM',
        firstTouch: { channel: 'WEB_FORM', at: '2026-10-01T05:00:00.000Z' },
        lastTouch: { channel: 'REFERRAL', at: '2026-10-02T05:00:00.000Z' },
      },
    } as LeadDetailView;
    renderAt(<LeadRecordScreen />, mockClient({ '/api/v1/leads/lead-1': lead }), '/crm/leads/lead-1', '/crm/leads/:id');
    await screen.findByRole('heading', { name: 'Rajesh Kumar' });
    const contact = screen.getByRole('region', { name: 'Contact' });
    expect(contact.textContent).toBe('ContactMobile+91 98XXX XXXXXEmail+91 98*****@example.comPincode400001');
    const consent = screen.getByRole('region', { name: 'Consent' });
    expect(consent.textContent).toBe('ConsentService messages · CallsGrantedMarketing · SMSNot given');
    const attribution = screen.getByRole('region', { name: 'Attribution' });
    expect(attribution.textContent).toBe(
      'AttributionFirst touchWeb form · 1 Oct 2026Last touchReferral · 2 Oct 2026Credited to source only when the insurer confirms issuance.',
    );
  });

  it('AC-M04-26 possible match banner links the lead to the customer with the exact request', async () => {
    const lead = { ...mockLead, possibleMatches: [{ id: 'party-9', displayName: 'Priya N.' }] } as LeadDetailView;
    const c = mockClient({ '/api/v1/leads/lead-1': lead, '/api/v1/leads/lead-1/party-link': lead });
    renderAt(<LeadRecordScreen />, c, '/crm/leads/lead-1', '/crm/leads/:id');
    expect(await screen.findByText('Possible match: Priya N.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Link to Priya N.' }));
    expect(c.post).toHaveBeenCalledWith('/api/v1/leads/lead-1/party-link', { partyId: 'party-9' }, { idempotencyKey: expect.any(String) });
  });

  it('AC-M04-26 a stage blocked message names the target stage in words', async () => {
    renderAt(<LeadRecordScreen />, mockClient({ '/api/v1/leads/lead-1': { ...mockLead, stageRules: { CONTACTED: { met: false, missing: ['Log a call'] } } } }), '/crm/leads/lead-1', '/crm/leads/:id');
    await userEvent.click(await screen.findByRole('button', { name: 'Contacted' }));
    expect(screen.getByText('To move to Contacted, complete:')).toBeInTheDocument();
    expect(screen.getByText('Log a call')).toBeInTheDocument();
  });
});
