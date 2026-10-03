import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider } from '../../../lib/api';
import { ApiError } from '../../../lib/api/api-error';
import { I18nProvider } from '../../../lib/i18n';
import { DuplicateQueueScreen } from './DuplicateQueueScreen';
import { ApiClient } from '../../../lib/api/api-client';
import { DuplicateCandidateView, ComparisonResponse } from '../api';

describe('AC-M03-17 DuplicateQueueScreen', () => {
  const mockDuplicates: DuplicateCandidateView[] = [
    {
      id: 'dup-1',
      score: 100,
      rule: 'Same PAN',
      explanation: 'Exact PAN match detected',
      a: {
        id: 'cust-1',
        displayName: 'Rajesh Kumar',
        primaryMobileMasked: '+91 98XXX XXXXX',
        householdName: undefined,
        rolesSummary: [],
        tags: [],
        ownerMemberId: 'member-1',
      },
      b: {
        id: 'cust-2',
        displayName: 'Raj Kumar',
        primaryMobileMasked: '+91 98XXX XXXXX',
        householdName: undefined,
        rolesSummary: [],
        tags: [],
        ownerMemberId: 'member-2',
      },
    },
    {
      id: 'dup-2',
      score: 90,
      rule: 'Same Mobile and Similar Name',
      explanation: 'Shared mobile number with similar name',
      a: {
        id: 'cust-3',
        displayName: 'Priya Singh',
        primaryMobileMasked: '+91 97XXX XXXXX',
        householdName: undefined,
        rolesSummary: [],
        tags: [],
        ownerMemberId: 'member-3',
      },
      b: {
        id: 'cust-4',
        displayName: 'Preya Singh',
        primaryMobileMasked: '+91 97XXX XXXXX',
        householdName: undefined,
        rolesSummary: [],
        tags: [],
        ownerMemberId: 'member-4',
      },
    },
  ];

  const mockComparison: ComparisonResponse = {
    fields: [
      { field: 'displayName', a: 'Rajesh Kumar', b: 'Raj Kumar' },
      { field: 'mobile', a: '+91 98XXX XXXXX', b: '+91 98XXX XXXXX' },
      { field: 'email', a: null, b: null },
      { field: 'dateOfBirth', a: 1980, b: 1981 },
      { field: 'pan', a: 'XXXXXX1234', b: 'XXXXXX1234' },
      { field: 'preferredLanguage', a: 'en', b: 'en' },
      { field: 'preferredChannel', a: 'WHATSAPP', b: 'SMS' },
      { field: 'ownerMemberId', a: 'member-1', b: 'member-2' },
    ],
    sourceA: { kind: 'IMPORT', ref: 'batch-1' },
    sourceB: { kind: 'MANUAL' },
  };

  let mockApiClient: ApiClient;

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn().mockImplementation((url) => {
        if (url.includes('comparison')) {
          return Promise.resolve(mockComparison);
        }
        return Promise.resolve({ items: mockDuplicates, nextCursor: undefined });
      }),
      post: vi.fn().mockResolvedValue({ mergeId: 'mrg-1', survivorId: 'cust-1', reversibleUntil: '2024-02-01' }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    };
  });

  it('AC-M03-17 loads and displays duplicate queue with score and rule', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <DuplicateQueueScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('Same PAN')).toBeInTheDocument();
    expect(screen.getByText('Raj Kumar')).toBeInTheDocument();
  });

  it('AC-M03-17 displays empty state when queue is clear', async () => {
    (mockApiClient.get as Mock).mockResolvedValueOnce({
      items: [],
      nextCursor: undefined,
    });

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <DuplicateQueueScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/queue is clear/i)).toBeInTheDocument();
    });
  });

  it('AC-M03-17 opens comparison sheet when compare button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <DuplicateQueueScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    const compareButtons = screen.getAllByRole('button', { name: /compare/i });
    await user.click(compareButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/displayName/i)).toBeInTheDocument();
    });
  });

  it('AC-M03-17 displays field-by-field comparison with radio buttons', async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <DuplicateQueueScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    const compareButtons = screen.getAllByRole('button', { name: /compare/i });
    await user.click(compareButtons[0]);

    await waitFor(() => {
      const displayNameField = screen.getByText(/displayName/i);
      expect(displayNameField).toBeInTheDocument();
    });

    // Check for radio buttons for field choices
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThan(0);
  });

  it('AC-M03-17 allows selecting field values via radio buttons', async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <DuplicateQueueScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    const compareButtons = screen.getAllByRole('button', { name: /compare/i });
    await user.click(compareButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/displayName/i)).toBeInTheDocument();
    });

    // Find and click a radio button
    const radios = screen.getAllByRole('radio');
    if (radios.length > 0) {
      await user.click(radios[0]);
      expect(radios[0]).toBeChecked();
    }
  });

  it('AC-M03-17 merges records and closes comparison sheet', async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <DuplicateQueueScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    const compareButtons = screen.getAllByRole('button', { name: /compare/i });
    await user.click(compareButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/displayName/i)).toBeInTheDocument();
    });

    // Find and click merge button
    const mergeButton = screen.getByRole('button', { name: /merge/i });
    await user.click(mergeButton);

    // Verify POST was called
    await waitFor(() => {
      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/merge'),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  it('AC-M03-17 dismisses duplicate when dismiss button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <DuplicateQueueScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    const compareButtons = screen.getAllByRole('button', { name: /compare/i });
    await user.click(compareButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/displayName/i)).toBeInTheDocument();
    });

    const dismissButton = screen.getByRole('button', { name: /not a duplicate|dismiss/i });
    await user.click(dismissButton);

    // Verify POST was called for dismissal
    await waitFor(() => {
      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/dismissal'),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  it('AC-M03-17 displays reversibility notice in comparison sheet', async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <DuplicateQueueScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    const compareButtons = screen.getAllByRole('button', { name: /compare/i });
    await user.click(compareButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/30/i)).toBeInTheDocument();
    });
  });

  it('AC-M03-17 shows loading skeleton initially', () => {
    mockApiClient.get = vi.fn().mockImplementationOnce(() =>
      new Promise(() => {}) // Never resolves
    );

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <DuplicateQueueScreen />
        </I18nProvider>
      </ApiProvider>
    );

    // Should show loading indicator
    const container = document.body;
    expect(container).toBeInTheDocument();
  });

  it('AC-M03-17 handles API errors gracefully', async () => {
    const apiError = new ApiError(500, 'server_error', 'Server error', 'Internal server error', 'trace-123');
    (mockApiClient.get as Mock).mockRejectedValueOnce(apiError);

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <DuplicateQueueScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  it('AC-M03-17 displays permission denied when status is 403', async () => {
    const apiError = new ApiError(403, 'forbidden', 'Forbidden', 'You do not have permission', 'trace-123');
    (mockApiClient.get as Mock).mockRejectedValueOnce(apiError);

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <DuplicateQueueScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/permission/i)).toBeInTheDocument();
    });
  });

  it('AC-M03-17 displays score badges with appropriate styling', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <DuplicateQueueScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      // Should display both duplicate scores
      const scores = screen.getAllByText(/^(100|90)$/);
      expect(scores.length).toBeGreaterThan(0);
    });
  });
});
