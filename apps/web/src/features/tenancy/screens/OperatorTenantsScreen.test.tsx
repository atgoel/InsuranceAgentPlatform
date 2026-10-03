import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider } from '../../../lib/api';
import { ApiError } from '../../../lib/api/api-error';
import { I18nProvider } from '../../../lib/i18n';
import { OperatorTenantsScreen } from './OperatorTenantsScreen';
import { ApiClient } from '../../../lib/api/api-client';

describe('AC-M01-18 OperatorTenantsScreen', () => {
  let mockApiClient: ApiClient;

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn().mockResolvedValue({ items: [] }),
      post: vi.fn().mockResolvedValue({}),
      put: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      del: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('AC-M01-18 displays tenant list with status chips', async () => {
    const mockTenants = {
      items: [
        {
          id: 'tenant-1',
          slug: 'test-tenant-1',
          displayName: 'Test Tenant 1',
          kind: 'ORGANISATION',
          status: 'active',
          planCode: 'TEAM',
          cell: 'cell-1',
          createdAt: '2024-01-01',
        },
      ],
    };
    const mockPlans = {
      items: [
        {
          code: 'TEAM',
          name: 'Team Plan',
          kind: 'ORGANISATION',
          capabilities: [],
          limits: {},
          alertThresholdPct: 75,
          canHidePoweredBy: false,
        },
      ],
    };

    (mockApiClient.get as any)
      .mockResolvedValueOnce(mockTenants)
      .mockResolvedValueOnce(mockPlans);

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <OperatorTenantsScreen />
        </I18nProvider>
      </ApiProvider>
    );

    expect(await screen.findByText('Test Tenant 1')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('AC-M01-18 opens provision sheet with form', async () => {
    const user = userEvent.setup();
    (mockApiClient.get as any).mockResolvedValue({ items: [] });

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <OperatorTenantsScreen />
        </I18nProvider>
      </ApiProvider>
    );

    const provisionBtn = await screen.findByRole('button', { name: /provision/i });
    await user.click(provisionBtn);

    expect(screen.getByText(/provision tenant/i)).toBeInTheDocument();
  });

  it('AC-M01-18 handles 403 permission denied', async () => {
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
          <OperatorTenantsScreen />
        </I18nProvider>
      </ApiProvider>
    );

    expect(await screen.findByText(/Access Denied/i)).toBeInTheDocument();
  });
});
