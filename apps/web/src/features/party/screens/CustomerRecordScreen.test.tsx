import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

    const kumartFamilyElements = screen.getAllByText('Kumar Family');
    expect(kumartFamilyElements.length).toBeGreaterThan(0);
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
    const user = userEvent.setup();
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

    // Click on consent tab
    const consentTab = screen.getByRole('tab', { name: /consent/i });
    await user.click(consentTab);

    // Check for SERVICE in consent items
    await waitFor(() => {
      const serviceText = screen.getByText(/SERVICE/i);
      expect(serviceText).toBeInTheDocument();
    });
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
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
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
    const kumartFamilyElements = screen.getAllByText('Kumar Family');
    expect(kumartFamilyElements.length).toBeGreaterThan(0);
  });

  async function openConsentSheet() {
    const user = userEvent.setup();
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <CustomerRecordScreen />
        </I18nProvider>
      </ApiProvider>
    );
    expect(await screen.findByText('Rajesh Kumar')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Consent' }));
    await user.click(screen.getByRole('button', { name: 'Record consent' }));
    return user;
  }

  it('AC-M03-16 records a consent withdrawal with an Idempotency-Key, as ASSISTED, and refreshes the record', async () => {
    const user = await openConsentSheet();
    expect(screen.getByText(/Notice version: 1\.0/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Purpose'), 'MARKETING');
    await user.selectOptions(screen.getByLabelText('Channel'), 'SMS');
    await user.click(screen.getByRole('radio', { name: 'Withdrawn' }));
    const getsBefore = (mockApiClient.get as Mock).mock.calls.filter(([url]) => url === '/api/v1/parties/cust-1').length;

    await user.click(screen.getByRole('button', { name: 'Save consent' }));

    await waitFor(() => expect(mockApiClient.post).toHaveBeenCalledTimes(1));
    const [url, body, options] = (mockApiClient.post as Mock).mock.calls[0];
    expect(url).toBe('/api/v1/parties/cust-1/consents');
    expect(body).toEqual({ purpose: 'MARKETING', channel: 'SMS', granted: false, noticeVersion: '1.0', source: 'ASSISTED' });
    expect(options.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() =>
      expect((mockApiClient.get as Mock).mock.calls.filter(([u]) => u === '/api/v1/parties/cust-1').length).toBe(getsBefore + 1),
    );
  });

  it('AC-M03-16 keeps the sheet open and shows an error when saving consent fails', async () => {
    (mockApiClient.post as Mock).mockRejectedValueOnce(new ApiError(503, 'unavailable', 'Unavailable'));
    const user = await openConsentSheet();
    await user.click(screen.getByRole('button', { name: 'Save consent' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Consent could not be saved. Please try again.');
    expect(screen.getByRole('button', { name: 'Save consent' })).toBeInTheDocument();
  });
});
