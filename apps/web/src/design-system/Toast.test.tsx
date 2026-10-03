import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './Toast';

describe('AC-M00-31 Toast', () => {
  function TestComponent() {
    const { show } = useToast();
    return (
      <div>
        <button onClick={() => show('Test message', 'ok')}>Show Success</button>
        <button onClick={() => show('Error occurred', 'bad')}>Show Error</button>
        <button onClick={() => show('Info message', 'info')}>Show Info</button>
        <button onClick={() => show('Warning message', 'warn')}>Show Warning</button>
      </div>
    );
  }

  it('renders toast provider', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );
    expect(screen.getByRole('region', { hidden: true })).toBeInTheDocument();
  });

  it('has aria-live polite region', () => {
    render(
      <ToastProvider>
        <div />
      </ToastProvider>,
    );
    const region = screen.getByLabelText('Notifications');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('displays toast message when shown', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Show Success/ }));

    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('applies correct tone class to toast', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Show Success/ }));

    const toastElement = screen.getByText('Test message').closest('div');
    expect(toastElement).toHaveClass('toast-ok');
  });

  it('shows bad tone toast', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Show Error/ }));

    const toastElement = screen.getByText('Error occurred').closest('div');
    expect(toastElement).toHaveClass('toast-bad');
  });

  it('shows info tone toast', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Show Info/ }));

    const toastElement = screen.getByText('Info message').closest('div');
    expect(toastElement).toHaveClass('toast-info');
  });

  it('shows warn tone toast', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Show Warning/ }));

    const toastElement = screen.getByText('Warning message').closest('div');
    expect(toastElement).toHaveClass('toast-warn');
  });

  it('displays multiple toasts', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Show Success/ }));
    await user.click(screen.getByRole('button', { name: /Show Error/ }));

    expect(screen.getByText('Test message')).toBeInTheDocument();
    expect(screen.getByText('Error occurred')).toBeInTheDocument();
  });

  it('defaults to info tone when not specified', async () => {
    const user = userEvent.setup();

    function DefaultToneComponent() {
      const { show } = useToast();
      return <button onClick={() => show('Default message')}>Show Default</button>;
    }

    render(
      <ToastProvider>
        <DefaultToneComponent />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Show Default/ }));

    const toastElement = screen.getByText('Default message').closest('div');
    expect(toastElement).toHaveClass('toast-info');
  });

  it('throws error when useToast is called outside provider', () => {
    function ComponentWithoutProvider() {
      useToast();
      return <div>Test</div>;
    }

    expect(() => {
      render(<ComponentWithoutProvider />);
    }).toThrow('useToast must be used inside ToastProvider');
  });
});
