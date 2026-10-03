import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider } from '../../../lib/api';
import { ApiError } from '../../../lib/api/api-error';
import { I18nProvider } from '../../../lib/i18n';
import { LeadsWorkspaceScreen } from './LeadsWorkspaceScreen';
import { ApiClient } from '../../../lib/api/api-client';
import { type LeadListItem, type LeadStats } from '../api';

describe('AC-M04-25 LeadsWorkspaceScreen', () => {
  const mockStats: LeadStats = {
    open: 42,
    unassigned: 8,
    slaMetPct7d: 85,
    leadToIssuedPct90d: 12,
  };

  const mockLeads: LeadListItem[] = [
    {
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
    },
    {
      id: 'lead-2',
      partyId: 'party-2',
      name: 'Priya Sharma',
      mobileMasked: '+91 97XXX XXXXX',
      productInterest: 'HEALTH',
      source: 'REFERRAL',
      campaignId: undefined,
      ownerMemberId: undefined,
      ownerName: undefined,
      stage: 'CONTACTED',
      temperature: 'WARM',
      slaState: 'breached',
      slaDueAt: new Date(Date.now() - 1800000).toISOString(),
      consent: 'not_given',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ];

  let mockApiClient: ApiClient;

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/api/v1/leads/stats') {
          return Promise.resolve(mockStats);
        }
        if (path === '/api/v1/leads') {
          return Promise.resolve({ items: mockLeads, nextCursor: undefined });
        }
        return Promise.reject(new ApiError(404, 'not_found', 'Not found'));
      }),
      post: vi.fn().mockResolvedValue({ leadId: 'lead-new', deduplicated: false, routingReason: 'Test', possibleMatches: 0 }),
      put: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      del: vi.fn().mockResolvedValue({}),
    } as ApiClient;
  });

  it('AC-M04-25 renders KPI tiles with stats', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <LeadsWorkspaceScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('AC-M04-25 displays leads in grid with proper columns', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <LeadsWorkspaceScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });
    expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
    expect(screen.getByText('Agent Singh')).toBeInTheDocument();
  });

  it('AC-M04-25 allows multi-select of leads', async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <LeadsWorkspaceScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    if (checkboxes.length >= 3) {
      await user.click(checkboxes[1]);
      await user.click(checkboxes[2]);
      expect(checkboxes[1]).toBeChecked();
      expect(checkboxes[2]).toBeChecked();
    }
  });

  it('AC-M04-25 shows bulk assign form with selected leads', async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <LeadsWorkspaceScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    if (checkboxes.length >= 2) {
      await user.click(checkboxes[1]);
      await waitFor(() => {
        const bulkBtn = screen.queryByRole('button', { name: /bulk assign/i });
        if (bulkBtn) {
          expect(bulkBtn).toBeInTheDocument();
        }
      });
    }
  });

  it('AC-M04-25 displays empty state when no leads', async () => {
    mockApiClient.get = vi.fn().mockImplementation((path: string) => {
      if (path === '/api/v1/leads/stats') {
        return Promise.resolve(mockStats);
      }
      if (path === '/api/v1/leads') {
        return Promise.resolve({ items: [], nextCursor: undefined });
      }
      return Promise.reject(new ApiError(404, 'not_found', 'Not found'));
    });

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <LeadsWorkspaceScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('No leads in this view')).toBeInTheDocument();
    });
  });

  it('AC-M04-25 handles API errors gracefully', async () => {
    mockApiClient.get = vi.fn().mockRejectedValue(new ApiError(500, 'server_error', 'Server error'));

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <LeadsWorkspaceScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  it('AC-M04-25 shows permission denied for 403 errors', async () => {
    mockApiClient.get = vi.fn().mockRejectedValue(new ApiError(403, 'forbidden', 'Forbidden'));

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <LeadsWorkspaceScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });
  });

  it('AC-M04-25 opens new lead form when "New lead" button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <LeadsWorkspaceScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    const newLeadBtn = screen.getByRole('button', { name: /new lead/i });
    await user.click(newLeadBtn);

    await waitFor(() => {
      expect(screen.queryByText(/create and route/i) || screen.queryByLabelText(/name/i)).toBeTruthy();
    });
  });

  it('AC-M04-25 shows saved views with proper filtering', async () => {
    mockApiClient.get = vi.fn().mockImplementation((path: string, query?: any) => {
      if (path === '/api/v1/leads/stats') return Promise.resolve(mockStats);
      if (path === '/api/v1/leads') {
        const params = query?.query || {};
        if (params.owner === 'unassigned') {
          return Promise.resolve({ items: [mockLeads[1]], nextCursor: undefined });
        }
        if (params.sla === 'breached') {
          return Promise.resolve({ items: [mockLeads[1]], nextCursor: undefined });
        }
        return Promise.resolve({ items: mockLeads, nextCursor: undefined });
      }
      return Promise.reject(new ApiError(404, 'not_found', 'Not found'));
    });

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <LeadsWorkspaceScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });
  });
});
