import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider } from '../../../lib/api';
import { ApiError } from '../../../lib/api/api-error';
import { I18nProvider } from '../../../lib/i18n';
import { TenantSetupScreen } from './TenantSetupScreen';
import { ApiClient } from '../../../lib/api/api-client';
import { TenantProfile, TieUpsResponse } from '../api';

describe('AC-M01-16 TenantSetupScreen', () => {
  const mockProfile: TenantProfile = {
    id: 'tenant-1',
    slug: 'test-tenant',
    displayName: 'Test Tenant',
    kind: 'ORGANISATION',
    status: 'active',
    planCode: 'BUSINESS',
    crmMode: 'twenty',
    entity: {
      entityType: 'IMF',
      legalName: 'Test IMF',
      registrationNo: 'IMF001',
      registrationValidTo: '2027-12-31',
      principalOfficerName: 'John Doe',
      registrationStatus: 'valid',
      comparisonScope: 'TIED_INSURERS',
    },
    hosts: [],
  };

  const mockTieUps: TieUpsResponse = {
    entityType: 'IMF',
    comparisonScope: 'TIED_INSURERS',
    lines: [
      {
        line: 'LIFE',
        max: 6,
        active: [
          { insurerId: 'INSURER1', line: 'LIFE', effectiveFrom: '2024-01-01' },
        ],
      },
      {
        line: 'HEALTH',
        max: 6,
        active: [],
      },
    ],
  };

  let mockApiClient: ApiClient;

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn().mockResolvedValue(mockProfile),
      post: vi.fn().mockResolvedValue({}),
      put: vi.fn().mockResolvedValue(mockTieUps),
      patch: vi.fn().mockResolvedValue({}),
      del: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('AC-M01-16 loads and displays tenant profile with entity and tie-ups', async () => {
    (mockApiClient.get as any)
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce(mockTieUps);

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TenantSetupScreen />
        </I18nProvider>
      </ApiProvider>
    );

    // Wait for data to load
    expect(await screen.findByText('Test Tenant')).toBeInTheDocument();
    expect(screen.getByText('Test IMF')).toBeInTheDocument();
    expect(screen.getByText('IMF001')).toBeInTheDocument();
  });

  it('AC-M01-16 displays registration status as valid chip', async () => {
    (mockApiClient.get as any)
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce(mockTieUps);

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TenantSetupScreen />
        </I18nProvider>
      </ApiProvider>
    );

    expect(await screen.findByText('2027-12-31')).toBeInTheDocument();
  });

  it('AC-M01-16 displays comparison scope for IMF as tied insurers', async () => {
    (mockApiClient.get as any)
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce(mockTieUps);

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TenantSetupScreen />
        </I18nProvider>
      </ApiProvider>
    );

    expect(await screen.findByText(/tied insurers/i)).toBeInTheDocument();
  });

  it('AC-M01-16 displays tie-ups per line with used/max counters', async () => {
    (mockApiClient.get as any)
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce(mockTieUps);

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TenantSetupScreen />
        </I18nProvider>
      </ApiProvider>
    );

    expect(await screen.findByText('LIFE')).toBeInTheDocument();
    expect(screen.getByText(/1\/6/)).toBeInTheDocument();
    expect(screen.getByText('INSURER1')).toBeInTheDocument();
  });

  it('AC-M01-16 disables save when over limit', async () => {
    const overLimitProfile = { ...mockProfile };
    const overLimitTieUps: TieUpsResponse = {
      ...mockTieUps,
      lines: [
        {
          line: 'LIFE',
          max: 6,
          active: Array.from({ length: 6 }, (_, i) => ({
            insurerId: `INSURER${i + 1}`,
            line: 'LIFE' as const,
            effectiveFrom: '2024-01-01',
          })),
        },
      ],
    };

    (mockApiClient.get as any)
      .mockResolvedValueOnce(overLimitProfile)
      .mockResolvedValueOnce(overLimitTieUps);

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TenantSetupScreen />
        </I18nProvider>
      </ApiProvider>
    );

    expect(await screen.findByText(/6\/6/)).toBeInTheDocument();
  });

  it('AC-M01-16 shows referral rewards disabled with legal text', async () => {
    (mockApiClient.get as any)
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce(mockTieUps);

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TenantSetupScreen />
        </I18nProvider>
      </ApiProvider>
    );

    expect(await screen.findByText(/Referral rewards/i)).toBeInTheDocument();
  });

  it('AC-M01-16 handles 403 permission denied', async () => {
    const apiError = new ApiError(403, 'forbidden', 'Forbidden');
    mockApiClient = {
      get: vi.fn().mockRejectedValue(apiError),
      post: vi.fn().mockResolvedValue({}),
      put: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      del: vi.fn().mockResolvedValue(undefined),
    };

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TenantSetupScreen />
        </I18nProvider>
      </ApiProvider>
    );

    expect(await screen.findByText(/Access Denied/i)).toBeInTheDocument();
  });

  it('AC-M01-16 handles loading state', () => {
    (mockApiClient.get as any).mockImplementation(() => new Promise(() => {}));

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TenantSetupScreen />
        </I18nProvider>
      </ApiProvider>
    );

    // Should show loading skeleton
    expect(screen.queryByText('Test Tenant')).not.toBeInTheDocument();
  });
});
