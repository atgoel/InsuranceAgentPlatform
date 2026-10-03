import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider } from '../../../lib/api';
import { ApiError } from '../../../lib/api/api-error';
import { I18nProvider } from '../../../lib/i18n';
import { BrandKitScreen } from './BrandKitScreen';
import { ApiClient } from '../../../lib/api/api-client';
import { BrandKitResponse } from '../api';

describe('AC-M01-17 BrandKitScreen', () => {
  const mockBrandKit: BrandKitResponse = {
    brandName: 'Test Brand',
    primary: '#1F5FBF',
    secondary: '#163F7F',
    typeface: 'IBM Plex Sans',
    poweredByVisible: true,
    contrastRatio: 6.0,
  };

  let mockApiClient: ApiClient;

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn().mockResolvedValue(mockBrandKit),
      post: vi.fn().mockResolvedValue({}),
      put: vi.fn().mockResolvedValue(mockBrandKit),
      patch: vi.fn().mockResolvedValue({}),
      del: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('AC-M01-17 loads and displays brand kit', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <BrandKitScreen />
        </I18nProvider>
      </ApiProvider>
    );

    expect(await screen.findByDisplayValue('Test Brand')).toBeInTheDocument();
  });

  it('AC-M01-17 shows typeface sample with नमस्ते', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <BrandKitScreen />
        </I18nProvider>
      </ApiProvider>
    );

    const samples = await screen.findAllByText('नमस्ते');
    expect(samples.length).toBeGreaterThan(0);
  });

  it('AC-M01-17 warns when contrast below 4.5:1', async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <BrandKitScreen />
        </I18nProvider>
      </ApiProvider>
    );

    // Wait for load
    await screen.findByDisplayValue('Test Brand');

    // Change to low contrast color
    const inputs = screen.getAllByDisplayValue('#1F5FBF');
    const colorInput = inputs[0] as HTMLInputElement;

    await user.clear(colorInput);
    await user.type(colorInput, '#FFFFFF');

    // Should show warning
    expect(await screen.findByText(/contrast.*warning/i)).toBeInTheDocument();
  });

  it('AC-M01-17 disables Save when contrast insufficient', async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <BrandKitScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await screen.findByDisplayValue('Test Brand');

    // Change to low contrast
    const inputs = screen.getAllByDisplayValue('#1F5FBF');
    const colorInput = inputs[0] as HTMLInputElement;
    await user.clear(colorInput);
    await user.type(colorInput, '#FFFFFF');

    const saveBtn = screen.getByRole('button', { name: /save/i });
    expect(saveBtn).toBeDisabled();
  });

  it('AC-M01-17 enables Save with sufficient contrast', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <BrandKitScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await screen.findByDisplayValue('Test Brand');

    const saveBtn = screen.getByRole('button', { name: /save/i });
    expect(saveBtn).not.toBeDisabled();
  });

  it('AC-M01-17 handles 403 permission denied', async () => {
    const apiError = new ApiError(403, 'forbidden', 'Forbidden');
    mockApiClient = {
      get: vi.fn().mockRejectedValue(apiError),
      post: vi.fn().mockResolvedValue({}),
      put: vi.fn().mockResolvedValue(mockBrandKit),
      patch: vi.fn().mockResolvedValue({}),
      del: vi.fn().mockResolvedValue(undefined),
    };

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <BrandKitScreen />
        </I18nProvider>
      </ApiProvider>
    );

    expect(await screen.findByText(/Access Denied/i)).toBeInTheDocument();
  });
});
