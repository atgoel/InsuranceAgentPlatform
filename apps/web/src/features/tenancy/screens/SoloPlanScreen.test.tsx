import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider } from '../../../lib/api';
import { ApiError } from '../../../lib/api/api-error';
import { I18nProvider } from '../../../lib/i18n';
import { SoloPlanScreen } from './SoloPlanScreen';
import { ApiClient } from '../../../lib/api/api-client';
import { TenantProfile, EntitlementsResponse } from '../api';

describe('AC-M01-20 SoloPlanScreen', () => {
  const mockProfile: TenantProfile = {
    id: 'tenant-1',
    slug: 'test-agent',
    displayName: 'Test Agent',
    kind: 'SOLO',
    status: 'active',
    planCode: 'SOLO',
    crmMode: 'solo_lite',
    hosts: [],
  };

  const mockEntitlements: EntitlementsResponse = {
    plan: {
      code: 'SOLO',
      name: 'Solo Plan',
      capabilities: [],
      limits: {
        seats: 1,
        customers: 500,
        ai_credits: 100,
        messages: 0,
        customFields: 5,
      },
      alertThresholdPct: 75,
    },
    usage: [
      {
        metric: 'customers',
        period: '2024-10',
        used: 400,
        limit: 500,
        percentUsed: 80,
      },
      {
        metric: 'ai_credits',
        period: '2024-10',
        used: 50,
        limit: 100,
        percentUsed: 50,
      },
    ],
    flags: [],
  };

  let mockApiClient: ApiClient;

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn()
        .mockResolvedValueOnce(mockProfile)
        .mockResolvedValueOnce(mockEntitlements)
        .mockResolvedValue(mockProfile),
      post: vi.fn().mockResolvedValue(mockProfile),
      put: vi.fn().mockResolvedValue(mockProfile),
      patch: vi.fn().mockResolvedValue(mockProfile),
      del: vi.fn().mockResolvedValue(undefined),
    } as unknown as ApiClient;
  });

  it('AC-M01-20 displays plan name and usage meters', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <SoloPlanScreen />
        </I18nProvider>
      </ApiProvider>
    );

    expect(await screen.findByText('Solo Plan')).toBeInTheDocument();
    expect(screen.getByText(/400 \/ 500/)).toBeInTheDocument();
  });

  it('AC-M01-20 shows warning at alert threshold', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <SoloPlanScreen />
        </I18nProvider>
      </ApiProvider>
    );

    // 80% > 75% threshold
    expect(await screen.findByText(/You've used 80% of this month's allowance/i)).toBeInTheDocument();
  });

  it('AC-M01-20 shows Pro trial CTA when on SOLO plan', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <SoloPlanScreen />
        </I18nProvider>
      </ApiProvider>
    );

    expect(await screen.findByRole('button', { name: /trial/i })).toBeInTheDocument();
  });

  it('AC-M01-20 starts Pro trial on CTA click', async () => {
    const user = userEvent.setup();

    const updatedProfile = {
      ...mockProfile,
      planCode: 'SOLO_PRO' as const,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    };

    (mockApiClient.get as Mock)
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce(mockEntitlements);

    (mockApiClient.post as Mock).mockResolvedValueOnce(updatedProfile);

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <SoloPlanScreen />
        </I18nProvider>
      </ApiProvider>
    );

    const trialBtn = await screen.findByRole('button', { name: /trial/i });
    await user.click(trialBtn);

    expect(mockApiClient.post).toHaveBeenCalled();
  });

  it('AC-M01-20 handles 403 permission denied', async () => {
    const apiError = new ApiError(403, 'forbidden', 'Forbidden');
    mockApiClient = {
      get: vi.fn().mockRejectedValue(apiError),
      post: vi.fn().mockResolvedValue(mockProfile),
      put: vi.fn().mockResolvedValue(mockProfile),
      patch: vi.fn().mockResolvedValue(mockProfile),
      del: vi.fn().mockResolvedValue(undefined),
    };

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <SoloPlanScreen />
        </I18nProvider>
      </ApiProvider>
    );

    expect(await screen.findByText(/Access Denied/i)).toBeInTheDocument();
  });

  it('AC-M01-20 hides trial CTA when already on trial', async () => {
    const profileWithTrial = {
      ...mockProfile,
      planCode: 'SOLO_PRO' as const,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    };

    (mockApiClient.get as Mock)
      .mockResolvedValueOnce(profileWithTrial)
      .mockResolvedValueOnce(mockEntitlements);

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <SoloPlanScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await screen.findByText('Solo Plan');

    expect(screen.queryByRole('button', { name: /start trial/i })).not.toBeInTheDocument();
  });
});
