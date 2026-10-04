import { describe, it, expect } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockClient } from '../../../test/render';
import { ApiError } from '../../../lib/api/api-error';
import { BrandKitScreen } from './BrandKitScreen';
import type { BrandKitResponse } from '../api';

const BRAND = '/api/v1/tenant/brand-kit';

const kit: BrandKitResponse = {
  brandName: 'Test Brand',
  primary: '#1F5FBF',
  secondary: '#163F7F',
  typeface: 'IBM Plex Sans',
  poweredByVisible: true,
  contrastRatio: 6.0,
};

function setup(over: Record<string, unknown> = {}) {
  const client = mockClient({ [BRAND]: kit, ...over });
  client.put.mockResolvedValue(kit);
  renderAt(<BrandKitScreen />, client, '/console/brand');
  return client;
}

describe('AC-M01-17 BrandKitScreen', () => {
  it('AC-M01-17 loads the brand kit into the form and the live preview', async () => {
    setup();
    expect(await screen.findByDisplayValue('Test Brand')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Test Brand' })).toBeInTheDocument();
    expect(screen.getByText('Powered by Insurance Distribution Platform')).toBeInTheDocument();
  });

  it('AC-M01-17 shows the Hindi sample for every approved typeface', async () => {
    setup();
    expect(await screen.findAllByText('नमस्ते')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /IBM Plex Sans/ })).toBeChecked();
  });

  it('AC-M01-17 warns and disables Save when the primary colour is below 4.5:1 against white', async () => {
    setup();
    await screen.findByDisplayValue('Test Brand');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Primary Colour (hex)'), { target: { value: '#FFFFFF' } });
    expect(screen.getByText(/Contrast below 4.5:1 WCAG requirement/)).toBeInTheDocument();
    expect(screen.getByText('Contrast Ratio: 1.00:1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('AC-M01-17 applies a preset to both colours and saves exactly the chosen values', async () => {
    const client = setup();
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Navy · saffron' }));
    expect(screen.getByRole('button', { name: 'Navy · saffron' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('radio', { name: /Mukta/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
    expect(client.put).toHaveBeenCalledWith(BRAND, {
      brandName: 'Test Brand',
      primary: '#0B4F8A',
      secondary: '#C2410C',
      typeface: 'Mukta',
      poweredByVisible: true,
    });
    expect(await screen.findByText('Brand kit saved')).toBeInTheDocument();
  });

  it('AC-M01-17 hides the powered-by badge in the preview and saves poweredByVisible false', async () => {
    const client = setup();
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('checkbox', { name: /Hide "Powered by" badge/ }));
    expect(screen.queryByText('Powered by Insurance Distribution Platform')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
    expect(client.put).toHaveBeenCalledWith(BRAND, expect.objectContaining({ poweredByVisible: false }));
  });

  it('AC-M01-17 shows a refused save inline and keeps the entered values', async () => {
    const client = setup();
    client.put.mockRejectedValue(new ApiError(422, 'powered_by_required', 'Your plan cannot hide the Powered by badge'));
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('checkbox', { name: /Hide "Powered by" badge/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your plan cannot hide the Powered by badge');
    expect(screen.getByDisplayValue('Test Brand')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Hide "Powered by" badge/ })).toBeChecked();
  });

  it('AC-M01-17 shows the permission-denied state on 403', async () => {
    setup({ [BRAND]: new ApiError(403, 'forbidden', 'Forbidden') });
    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
  });

  it('AC-M01-17 shows an error state on a server failure', async () => {
    setup({ [BRAND]: new ApiError(500, 'server_error', 'Server error') });
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  });

  it('AC-M01-17 shows the loading state first', () => {
    const client = mockClient({});
    client.get.mockImplementation(() => new Promise(() => undefined));
    renderAt(<BrandKitScreen />, client, '/console/brand');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
