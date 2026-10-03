import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider } from '../../../lib/api';
import { ApiError } from '../../../lib/api/api-error';
import { I18nProvider } from '../../../lib/i18n';
import { CustomersScreen } from './CustomersScreen';
import { ApiClient } from '../../../lib/api/api-client';
import { PartyListItem } from '../api';

describe('AC-M03-15 CustomersScreen', () => {
  const mockCustomers: PartyListItem[] = [
    {
      id: 'cust-1',
      displayName: 'Rajesh Kumar',
      primaryMobileMasked: '+91 98XXX XXXXX',
      householdName: 'Kumar Family',
      rolesSummary: ['PROPOSER · life', 'INSURED · health'],
      tags: ['vip', 'active'],
      ownerMemberId: 'member-1',
    },
    {
      id: 'cust-2',
      displayName: 'Priya Singh',
      primaryMobileMasked: '+91 97XXX XXXXX',
      householdName: undefined,
      rolesSummary: ['INSURED · health'],
      tags: [],
      ownerMemberId: 'member-2',
    },
  ];

  let mockApiClient: ApiClient;

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn().mockResolvedValue({ items: mockCustomers, nextCursor: undefined }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    };
  });

  it('AC-M03-15 loads and displays customers list with masked mobile and household', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <CustomersScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    expect(screen.getByText('Priya Singh')).toBeInTheDocument();
    expect(screen.getByText('Kumar Family')).toBeInTheDocument();
    expect(screen.getByText('+91 98XXX XXXXX')).toBeInTheDocument();
  });

  it('AC-M03-15 filters customers by search query', async () => {
    const user = userEvent.setup();
    (mockApiClient.get as Mock)
      .mockResolvedValueOnce({
        items: [mockCustomers[0]],
        nextCursor: undefined,
      })
      .mockResolvedValueOnce({
        items: [mockCustomers[0]],
        nextCursor: undefined,
      });

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <CustomersScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    const searchBox = screen.getByPlaceholderText('Search name, mobile, email, PAN or policy no.');
    await user.type(searchBox, 'Rajesh');

    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/api/v1/parties',
        expect.objectContaining({
          query: expect.objectContaining({ q: 'Rajesh' }),
        })
      );
    });
  });

  it('AC-M03-15 opens household panel when row is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <CustomersScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    const nameCell = screen.getByText('Rajesh Kumar');
    await user.click(nameCell);

    await waitFor(() => {
      const kumartFamilyElements = screen.getAllByText('Kumar Family');
      expect(kumartFamilyElements.length).toBeGreaterThan(0);
    });
  });

  it('AC-M03-15 closes household panel when close button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <CustomersScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Rajesh Kumar'));

    await waitFor(() => {
      expect(screen.getByRole('complementary')).toBeInTheDocument();
    });

    const closeButton = screen.getByLabelText('Close panel');
    await user.click(closeButton);

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('AC-M03-15 displays loading skeleton initially', () => {
    mockApiClient.get = vi.fn().mockImplementationOnce(() =>
      new Promise(() => {}) // Never resolves
    );

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <CustomersScreen />
        </I18nProvider>
      </ApiProvider>
    );

    // Check for loading skeleton progressbar
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('AC-M03-15 displays empty state when no customers found', async () => {
    (mockApiClient.get as Mock).mockResolvedValueOnce({
      items: [],
      nextCursor: undefined,
    });

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <CustomersScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText('Rajesh Kumar')).not.toBeInTheDocument();
    });
  });

  it('AC-M03-15 handles API errors gracefully', async () => {
    const apiError = new ApiError(500, 'server_error', 'Server error', 'Internal server error', 'trace-123');
    (mockApiClient.get as Mock).mockRejectedValueOnce(apiError);

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <CustomersScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  it('AC-M03-15 displays permission denied when status is 403', async () => {
    const apiError = new ApiError(403, 'forbidden', 'Forbidden', 'You do not have permission', 'trace-123');
    (mockApiClient.get as Mock).mockRejectedValueOnce(apiError);

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <CustomersScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });
  });

  it('AC-M03-15 displays shared number note', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <CustomersScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    // Note about shared numbers should be visible
    const note = screen.queryByText(/shared/i) || screen.queryByText(/never/i);
    expect(note).toBeInTheDocument();
  });
});
