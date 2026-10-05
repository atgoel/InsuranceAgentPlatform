import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../lib/i18n';
import { PwaProvider } from '../../lib/pwa';
import { UpdatePrompt } from './UpdatePrompt';
import { UserMenu } from './UserMenu';

const register = vi.hoisted(() => vi.fn());
vi.mock('virtual:pwa-register', () => ({ registerSW: register }));

function mount() {
  return render(
    <I18nProvider>
      <PwaProvider>
        <UpdatePrompt />
        <UserMenu userName="Priya" roles={['SALESPERSON']} />
      </PwaProvider>
    </I18nProvider>,
  );
}

describe('UpdatePrompt and install entry', () => {
  const updateSW = vi.fn(() => Promise.resolve());
  beforeEach(() => {
    register.mockReset();
    updateSW.mockClear();
    register.mockReturnValue(updateSW);
  });

  it('AC-M00-36 UpdatePrompt is hidden until a new version waits, then Reload calls update()', async () => {
    mount();
    expect(screen.queryByText('A new version is available')).toBeNull();
    const options = register.mock.calls[0][0] as { onNeedRefresh: () => void };
    act(() => options.onNeedRefresh());
    expect(screen.getByText('A new version is available')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(updateSW).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('AC-M00-36 UserMenu shows Install app only after beforeinstallprompt, prompts once, hides after appinstalled', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull();
    const prompt = vi.fn(() => Promise.resolve());
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt });
    act(() => {
      window.dispatchEvent(event);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Install app' }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull();
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull();
  });
});
