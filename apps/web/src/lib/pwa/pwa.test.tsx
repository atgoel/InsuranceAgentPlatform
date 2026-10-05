import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaProvider, usePwa } from './PwaProvider';

const register = vi.hoisted(() => vi.fn());
vi.mock('virtual:pwa-register', () => ({ registerSW: register }));

function Probe() {
  const { needRefresh, update, canInstall, install } = usePwa();
  return (
    <div>
      <p data-testid="state">{`refresh=${needRefresh} install=${canInstall}`}</p>
      <button type="button" onClick={update}>
        do-update
      </button>
      <button type="button" onClick={() => void install()}>
        do-install
      </button>
    </div>
  );
}

function promptEvent(prompt: () => Promise<void>): Event {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  Object.assign(event, { prompt });
  return event;
}

function mount() {
  return render(
    <PwaProvider>
      <Probe />
    </PwaProvider>,
  );
}

describe('lib/pwa', () => {
  const updateSW = vi.fn(() => Promise.resolve());
  beforeEach(() => {
    register.mockReset();
    updateSW.mockClear();
    register.mockReturnValue(updateSW);
  });

  it('AC-M00-36 sets needRefresh when the worker reports a waiting version and update() activates it', async () => {
    mount();
    expect(screen.getByTestId('state')).toHaveTextContent('refresh=false install=false');
    expect(register).toHaveBeenCalledTimes(1);
    const options = register.mock.calls[0][0] as { onNeedRefresh: () => void };
    act(() => options.onNeedRefresh());
    expect(screen.getByTestId('state')).toHaveTextContent('refresh=true install=false');
    await userEvent.click(screen.getByRole('button', { name: 'do-update' }));
    expect(updateSW).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('AC-M00-36 canInstall turns true on beforeinstallprompt, install() prompts once, appinstalled keeps it false', async () => {
    mount();
    const prompt = vi.fn(() => Promise.resolve());
    const event = promptEvent(prompt);
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByTestId('state')).toHaveTextContent('refresh=false install=true');
    await userEvent.click(screen.getByRole('button', { name: 'do-install' }));
    await userEvent.click(screen.getByRole('button', { name: 'do-install' }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('state')).toHaveTextContent('install=false');
  });

  it('AC-M00-36 appinstalled hides the install entry', () => {
    mount();
    act(() => {
      window.dispatchEvent(promptEvent(() => Promise.resolve()));
    });
    expect(screen.getByTestId('state')).toHaveTextContent('install=true');
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(screen.getByTestId('state')).toHaveTextContent('install=false');
  });
});
