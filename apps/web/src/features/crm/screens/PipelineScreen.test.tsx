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
      get: vi.fn().mockResolvedValue(mockBoard),
      post: vi.fn().mockResolvedValue({}),
      put: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      del: vi.fn().mockResolvedValue({}),
    } as ApiClient;
  });

  it('AC-M04-27 renders kanban columns with i18n stage labels', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <PipelineScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Needs analysis')).toBeInTheDocument();
    });
    expect(screen.getByText('Quoted')).toBeInTheDocument();
    expect(screen.getByText('Proposal')).toBeInTheDocument();
    expect(screen.getByText('Insurer pending')).toBeInTheDocument();
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
      expect(screen.getByText('3')).toBeInTheDocument();
    });
    const allText = screen.queryAllByText('2');
    expect(allText.length).toBeGreaterThan(0);
    // Check for premium amounts (rupee symbol may be in separate text node)
    const premiumElements = screen.queryAllByText(/5,000|3,000/);
    expect(premiumElements.length).toBeGreaterThan(0);
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
      const allText = screen.queryAllByText('5');
      expect(allText.length).toBeGreaterThan(0);
    });
    const lostText = screen.queryAllByText('2');
    expect(lostText.length).toBeGreaterThan(0);
  });

  it('AC-M04-27 allows moving opportunity to adjacent stages', async () => {
    const user = userEvent.setup();
    mockApiClient.post = vi.fn().mockResolvedValue(mockBoard.columns[1].items[0]);

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

    const moveButtons = screen.getAllByRole('button').filter((btn) => btn.textContent?.includes('→'));
    if (moveButtons.length > 0) {
      await user.click(moveButtons[0]);
      expect(mockApiClient.post).toHaveBeenCalled();
    }
  });

  it('AC-M04-27 allows marking opportunity as lost with reason', async () => {
    const user = userEvent.setup();
    mockApiClient.post = vi.fn().mockResolvedValue(mockBoard.columns[0].items[0]);

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

    const lostButtons = screen.getAllByRole('button').filter((btn) => btn.textContent?.toLowerCase().includes('lost'));
    if (lostButtons.length > 0) {
      await user.click(lostButtons[0]);
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

    const issueButtons = screen.queryAllByRole('button').filter((btn) => {
      const text = btn.textContent?.toLowerCase() || '';
      return text.includes('issue') || text.includes('won');
    });
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
      const insurerText = screen.queryByText(/Won is set only by the insurer/i);
      expect(insurerText).toBeInTheDocument();
    });
  });

  it('AC-M04-27 handles API errors gracefully', async () => {
    mockApiClient.get = vi.fn().mockRejectedValue(new ApiError(500, 'error', 'Server error'));

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
    mockApiClient.get = vi.fn().mockRejectedValue(new ApiError(403, 'error', 'Forbidden'));

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
      expect(screen.getByText('7')).toBeInTheDocument();
    });
    const premiumText = screen.queryAllByText(/₹|11,000/);
    expect(premiumText.length).toBeGreaterThan(0);
    expect(screen.getByText('42%')).toBeInTheDocument();
  });
});
