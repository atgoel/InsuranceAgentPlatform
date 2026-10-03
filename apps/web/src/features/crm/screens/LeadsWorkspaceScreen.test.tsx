import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
      get: vi.fn((path: string) => {
        if (path === '/api/v1/leads/stats') {
          return Promise.resolve(mockStats as any);
        }
        if (path === '/api/v1/leads') {
          return Promise.resolve({ items: mockLeads, nextCursor: undefined } as any);
        }
        return Promise.reject(new ApiError(404, 'not_found', 'Not found'));
      }),
      post: vi.fn(() => Promise.resolve({})),
      put: vi.fn(() => Promise.resolve({})),
      patch: vi.fn(() => Promise.resolve({})),
      del: vi.fn(() => Promise.resolve({})),
    } as any;
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
      expect(screen.getByText(/42/)).toBeInTheDocument();
      expect(screen.getByText(/8/)).toBeInTheDocument();
      expect(screen.getByText(/85%/)).toBeInTheDocument();
    });
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
      expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
      expect(screen.getByText(/Agent Singh/)).toBeInTheDocument();
    });
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
    await user.click(checkboxes[1]); // Select first lead
    await user.click(checkboxes[2]); // Select second lead

    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[2]).toBeChecked();
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
    await user.click(checkboxes[1]);

    const bulkAssignBtn = screen.getByRole('button', { name: /bulk assign/i });
    await user.click(bulkAssignBtn);

    await waitFor(() => {
      expect(screen.getByText(/2 selected/i) || screen.getByText(/1 selected/i)).toBeInTheDocument();
    });
  });

  it('AC-M04-25 displays empty state when no leads', async () => {
    (mockApiClient.get as any) = vi.fn((path: string) => {
      if (path === '/api/v1/leads/stats') {
        return Promise.resolve(mockStats as any);
      }
      if (path === '/api/v1/leads') {
        return Promise.resolve({ items: [], nextCursor: undefined } as any);
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
    (mockApiClient.get as any) = vi.fn(() => Promise.reject(new ApiError(500, 'server_error', 'Server error')));

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
    (mockApiClient.get as any) = vi.fn(() => Promise.reject(new ApiError(403, 'forbidden', 'Forbidden')));

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
      expect(screen.getByText(/create and route/i) || screen.getByLabelText(/name/i)).toBeInTheDocument();
    });
  });

  it('AC-M04-25 filters leads by consent status', async () => {
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

    // Verify consent chips are shown
    expect(screen.getByText('granted')).toBeInTheDocument();
    expect(screen.getByText('not_given')).toBeInTheDocument();
  });

  it('AC-M04-25 displays SLA chips with proper status', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <LeadsWorkspaceScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/pending/)).toBeInTheDocument();
      expect(screen.getByText(/breached/)).toBeInTheDocument();
    });
  });
});
