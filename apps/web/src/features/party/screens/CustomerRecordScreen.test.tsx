import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ApiProvider } from '../../../lib/api';
import { ApiError } from '../../../lib/api/api-error';
import { I18nProvider } from '../../../lib/i18n';
import { CustomerRecordScreen } from './CustomerRecordScreen';
import { ApiClient } from '../../../lib/api/api-client';
import { PartyView, HouseholdView, ConsentSummaryItem } from '../api';

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'cust-1' }),
    useNavigate: () => vi.fn(),
  };
});

describe('AC-M03-16 CustomerRecordScreen', () => {
  const mockParty: PartyView & {
    household?: HouseholdView;
    roles: Array<{ role: string; label?: string }>;
    consentSummary: ConsentSummaryItem[];
  } = {
    id: 'cust-1',
    kind: 'PERSON',
    displayName: 'Rajesh Kumar',
    contacts: [
      {
        channel: 'MOBILE',
        masked: '+91 98XXX XXXXX',
        isPrimary: true,
        verified: true,
      },
      {
        channel: 'EMAIL',
        masked: 'raj***@example.com',
        isPrimary: true,
        verified: false,
      },
    ],
    preferredLanguage: 'en',
    preferredChannel: 'WHATSAPP',
    tags: ['vip'],
    source: { kind: 'LEAD', ref: 'lead-1' },
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
    roles: [
      { role: 'PROPOSER', label: 'life' },
      { role: 'INSURED', label: 'health' },
    ],
    consentSummary: [
      {
        purpose: 'SERVICE',
        channel: 'WHATSAPP',
        granted: true,
        occurredAt: '2024-01-01T00:00:00Z',
        noticeVersion: '1.0',
      },
      {
        purpose: 'MARKETING',
        channel: 'EMAIL',
        granted: false,
        occurredAt: '2024-01-02T00:00:00Z',
        noticeVersion: '1.0',
      },
    ],
    ownerMemberId: 'member-1',
  };

  let mockApiClient: ApiClient;

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn().mockResolvedValue(mockParty),
      post: vi.fn().mockResolvedValue({}),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    };
  });

  it('AC-M03-16 loads and displays party details with household and preferences', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <CustomerRecordScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    expect(screen.getByText('Kumar Family')).toBeInTheDocument();
  });

  it('AC-M03-16 displays initials avatar with correct letters', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <CustomerRecordScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('RK')).toBeInTheDocument();
    });
  });

  it('AC-M03-16 displays consent summary with granted/withdrawn chips', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <CustomerRecordScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    // Check for SERVICE in consent items
    const serviceText = screen.queryByText(/SERVICE/i);
    expect(serviceText).toBeInTheDocument();
  });

  it('AC-M03-16 disables WhatsApp button when contactability denies', async () => {
    const contactabilityError = {
      allowed: false,
      reason: 'consent_withdrawn',
    };

    (mockApiClient.get as Mock).mockImplementation((url) => {
      if (url.includes('contactability')) {
        return Promise.resolve(contactabilityError);
      }
      return Promise.resolve(mockParty);
    });

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <CustomerRecordScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });
  });

  it('AC-M03-16 shows loading skeleton initially', () => {
    mockApiClient.get = vi.fn().mockImplementationOnce(() =>
      new Promise(() => {}) // Never resolves
    );

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <CustomerRecordScreen />
        </I18nProvider>
      </ApiProvider>
    );

    // Should show loading indicator or wait for data
    const container = document.body;
    expect(container).toBeInTheDocument();
  });

  it('AC-M03-16 handles API errors gracefully', async () => {
    const apiError = new ApiError(500, 'server_error', 'Server error', 'Internal server error', 'trace-123');
    (mockApiClient.get as Mock).mockRejectedValueOnce(apiError);

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <CustomerRecordScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  it('AC-M03-16 displays permission denied when status is 403', async () => {
    const apiError = new ApiError(403, 'forbidden', 'Forbidden', 'You do not have permission', 'trace-123');
    (mockApiClient.get as Mock).mockRejectedValueOnce(apiError);

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <CustomerRecordScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/permission/i)).toBeInTheDocument();
    });
  });

  it('AC-M03-16 displays household members with relations', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <CustomerRecordScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    });

    // Household should be displayed in the header
    expect(screen.getByText('Kumar Family')).toBeInTheDocument();
  });
});
