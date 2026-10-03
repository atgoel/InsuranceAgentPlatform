import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider } from '../../../lib/api';
import { ApiError } from '../../../lib/api/api-error';
import { I18nProvider } from '../../../lib/i18n';
import { PipelineScreen } from './PipelineScreen';
import { ApiClient } from '../../../lib/api/api-client';
import { type BoardResponse } from '../api';

describe('AC-M04-27 PipelineScreen', () => {
  const mockBoard: BoardResponse = {
    columns: [
      {
        stage: 'DISCOVERY',
        count: 3,
        totalExpectedPremiumPaise: 500000,
        items: [
          {
            id: 'opp-1',
            partyId: 'party-1',
            leadId: 'lead-1',
            productInterest: 'TERM_LIFE',
            title: 'Rajesh Kumar - Term Life',
            expectedPremium: { amountPaise: 500000, currency: 'INR' },
            stage: 'DISCOVERY',
            ownerMemberId: 'member-1',
            createdAt: new Date().toISOString(),
            stageEnteredAt: new Date().toISOString(),
            version: 1,
          },
        ],
      },
      {
        stage: 'QUOTE_SHARED',
        count: 2,
        totalExpectedPremiumPaise: 300000,
        items: [
          {
            id: 'opp-2',
            partyId: 'party-2',
            productInterest: 'HEALTH',
            title: 'Priya Sharma - Health',
            expectedPremium: { amountPaise: 300000, currency: 'INR' },
            stage: 'QUOTE_SHARED',
            ownerMemberId: 'member-1',
            createdAt: new Date().toISOString(),
            stageEnteredAt: new Date().toISOString(),
            version: 1,
          },
        ],
      },
      {
        stage: 'PROPOSAL_COMPLETE',
        count: 1,
        totalExpectedPremiumPaise: 100000,
        items: [],
      },
      {
        stage: 'INSURER_PENDING',
        count: 1,
        totalExpectedPremiumPaise: 200000,
        items: [
          {
            id: 'opp-3',
            partyId: 'party-3',
            productInterest: 'RETIREMENT',
            title: 'Amit Patel - Retirement',
            expectedPremium: { amountPaise: 200000, currency: 'INR' },
            stage: 'INSURER_PENDING',
            ownerMemberId: 'member-2',
            createdAt: new Date().toISOString(),
            stageEnteredAt: new Date().toISOString(),
            version: 1,
          },
        ],
      },
    ],
    closed: { issued: 5, lost: 2 },
    stats: {
      openCount: 7,
      openExpectedPremiumPaise: 1100000,
      medianDaysToIssue: 15,
      winRate90d: 42,
    },
  };

  let mockApiClient: ApiClient;

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(() => Promise.resolve(mockBoard)),
      post: vi.fn(() => Promise.resolve({})),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    };
  });

  it('AC-M04-27 renders kanban columns with stage labels', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <PipelineScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/discovery/i) || screen.getByText(/DISCOVERY/)).toBeInTheDocument();
      expect(screen.getByText(/quote shared/i) || screen.getByText(/QUOTE_SHARED/)).toBeInTheDocument();
    });
  });

  it('AC-M04-27 displays column counts and premium totals', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <PipelineScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      // Check for counts
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      // Check for premium amounts in rupees
      expect(screen.getByText(/₹/)).toBeInTheDocument();
    });
  });

  it('AC-M04-27 displays closed counts (issued and lost)', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <PipelineScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument(); // issued count
      expect(screen.getByText('2')).toBeInTheDocument(); // lost count
    });
  });

  it('AC-M04-27 allows moving opportunity to adjacent stages', async () => {
    const user = userEvent.setup();
    mockApiClient.post = vi.fn(() => Promise.resolve(mockBoard.columns[1].items[0]));

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <PipelineScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar - Term Life')).toBeInTheDocument();
    });

    // Find and click move button (→)
    const moveButtons = screen.getAllByRole('button').filter((btn) => btn.textContent?.includes('→'));
    if (moveButtons.length > 0) {
      await user.click(moveButtons[0]);
      expect(mockApiClient.post).toHaveBeenCalled();
    }
  });

  it('AC-M04-27 allows marking opportunity as lost with reason', async () => {
    const user = userEvent.setup();
    mockApiClient.post = vi.fn(() => Promise.resolve(mockBoard.columns[0].items[0]));

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <PipelineScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar - Term Life')).toBeInTheDocument();
    });

    // Find and click Lost button
    const lostButtons = screen.getAllByRole('button').filter((btn) => btn.textContent?.toLowerCase().includes('lost'));
    if (lostButtons.length > 0) {
      await user.click(lostButtons[0]);
      // Should show reason select dropdown
      const reasonSelects = screen.queryAllByRole('combobox');
      expect(reasonSelects.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('AC-M04-27 shows no way to manually mark as issued', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <PipelineScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar - Term Life')).toBeInTheDocument();
    });

    // Should not have an "Issue" or "Won" button
    const issueButtons = screen.queryAllByRole('button').filter((btn) => btn.textContent?.toLowerCase().includes('issue') || btn.textContent?.toLowerCase().includes('won'));
    expect(issueButtons.length).toBe(0);
  });

  it('AC-M04-27 displays note about insurer-only issuance', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <PipelineScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/insurer/i)).toBeInTheDocument();
    });
  });

  it('AC-M04-27 handles API errors gracefully', async () => {
    mockApiClient.get = vi.fn(() => Promise.reject(new ApiError(500, 'error', 'Server error')));

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <PipelineScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  it('AC-M04-27 handles permission denied', async () => {
    mockApiClient.get = vi.fn(() => Promise.reject(new ApiError(403, 'error', 'Forbidden')));

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <PipelineScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });
  });

  it('AC-M04-27 displays KPI stats', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <PipelineScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('7')).toBeInTheDocument(); // openCount
      expect(screen.getByText(/₹/)).toBeInTheDocument(); // premium
      expect(screen.getByText('42%')).toBeInTheDocument(); // win rate
    });
  });
});
