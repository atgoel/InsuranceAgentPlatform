import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { ApiProvider } from '../../../lib/api';
import { ApiError } from '../../../lib/api/api-error';
import { I18nProvider } from '../../../lib/i18n';
import { SoloSignupScreen } from './SoloSignupScreen';
import { ApiClient } from '../../../lib/api/api-client';

describe('AC-M01-19 SoloSignupScreen', () => {
  let mockApiClient: ApiClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          {children}
        </I18nProvider>
      </ApiProvider>
    </BrowserRouter>
  );

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
      put: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      del: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('AC-M01-19 displays 3-step stepper', () => {
    render(<SoloSignupScreen />, { wrapper });

    const stepperElement = document.querySelector('.stepper');
    expect(stepperElement).toBeInTheDocument();
    const items = stepperElement?.querySelectorAll('.stepper-item');
    expect(items?.length).toBe(3);
  });

  it('AC-M01-19 requires consent before continuing', async () => {
    const user = userEvent.setup();
    render(<SoloSignupScreen />, { wrapper });

    const continueBtn = screen.getByRole('button', { name: /continue/i });
    expect(continueBtn).toBeDisabled();

    // Check consent checkbox
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    expect(continueBtn).not.toBeDisabled();
  });

  it('AC-M01-19 shows otp_invalid with attempt message', async () => {
    const user = userEvent.setup();

    mockApiClient = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn()
        .mockResolvedValueOnce({
          signupId: 'signup-1',
          expiresAt: '2024-01-01T00:10:00Z',
        })
        .mockRejectedValueOnce(new ApiError(400, 'otp_invalid', 'Invalid OTP')),
      put: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      del: vi.fn().mockResolvedValue(undefined),
    };

    render(<SoloSignupScreen />, { wrapper });

    // Check consent and continue
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    const continueBtn = screen.getByRole('button', { name: /continue/i });
    await user.click(continueBtn);

    // Wait for OTP step
    const otpInput = await screen.findByPlaceholderText('000000');

    // Enter wrong OTP
    await user.type(otpInput, '000000');

    const verifyBtn = screen.getByRole('button', { name: /verify/i });
    await user.click(verifyBtn);

    expect(await screen.findByText(/Invalid OTP/i)).toBeInTheDocument();
  });

  it('AC-M01-19 shows otp_locked message', async () => {
    const user = userEvent.setup();

    mockApiClient = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn()
        .mockResolvedValueOnce({
          signupId: 'signup-1',
          expiresAt: '2024-01-01T00:10:00Z',
        })
        .mockRejectedValueOnce(new ApiError(429, 'otp_locked', 'OTP Locked')),
      put: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      del: vi.fn().mockResolvedValue(undefined),
    };

    render(<SoloSignupScreen />, { wrapper });

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    const continueBtn = screen.getByRole('button', { name: /continue/i });
    await user.click(continueBtn);

    const otpInput = await screen.findByPlaceholderText('000000');
    await user.type(otpInput, '000000');

    const verifyBtn = screen.getByRole('button', { name: /verify/i });
    await user.click(verifyBtn);

    expect(await screen.findByText(/Too many incorrect attempts/i)).toBeInTheDocument();
  });

  it('AC-M01-19 shows otp_expired message', async () => {
    const user = userEvent.setup();

    mockApiClient = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn()
        .mockResolvedValueOnce({
          signupId: 'signup-1',
          expiresAt: '2024-01-01T00:00:00Z',
        })
        .mockRejectedValueOnce(new ApiError(400, 'otp_expired', 'OTP Expired')),
      put: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      del: vi.fn().mockResolvedValue(undefined),
    };

    render(<SoloSignupScreen />, { wrapper });

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    const continueBtn = screen.getByRole('button', { name: /continue/i });
    await user.click(continueBtn);

    const otpInput = await screen.findByPlaceholderText('000000');
    await user.type(otpInput, '000000');

    const verifyBtn = screen.getByRole('button', { name: /verify/i });
    await user.click(verifyBtn);

    expect(await screen.findByText(/OTP has expired/i)).toBeInTheDocument();
  });

  it('AC-M01-19 shows success step with next actions', async () => {
    const user = userEvent.setup();

    mockApiClient = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn()
        .mockResolvedValueOnce({
          signupId: 'signup-1',
          expiresAt: '2024-01-01T00:10:00Z',
        })
        .mockResolvedValueOnce({
          tenantId: 'tenant-1',
          host: 'agent-1234.iap.test',
          status: 'active' as const,
          licenceStatus: 'pending_verification',
        }),
      put: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      del: vi.fn().mockResolvedValue(undefined),
    };

    render(<SoloSignupScreen />, { wrapper });

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    const continueBtn = screen.getByRole('button', { name: /continue/i });
    await user.click(continueBtn);

    const otpInput = await screen.findByPlaceholderText('000000');
    await user.type(otpInput, '123456');

    const verifyBtn = screen.getByRole('button', { name: /verify/i });
    await user.click(verifyBtn);

    // Check for success step
    expect(await screen.findByText(/Import my book/i)).toBeInTheDocument();
    expect(screen.getByText(/Skip/i)).toBeInTheDocument();
  });
});
