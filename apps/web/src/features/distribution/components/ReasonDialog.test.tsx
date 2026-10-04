import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderT as render } from '../test-render';
import { ReasonDialog } from './ReasonDialog';

function setup(over: Partial<Parameters<typeof ReasonDialog>[0]> = {}) {
  const props = {
    isOpen: true,
    title: 'Deactivate this member?',
    reason: '',
    onReasonChange: vi.fn(),
    onConfirm: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
    ...over,
  };
  render(<ReasonDialog {...props} />);
  return props;
}

describe('ReasonDialog', () => {
  it('AC-M02-06 renders nothing when closed', () => {
    setup({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('AC-M02-06 reports the typed reason through a labelled textarea', () => {
    const props = setup();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Left the firm' } });
    expect(props.onReasonChange).toHaveBeenCalledExactlyOnceWith('Left the firm');
  });

  it('AC-M02-06 keeps Confirm disabled until the reason has at least 3 characters', () => {
    setup({ reason: 'ab' });
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });

  it('AC-M02-06 confirms with a valid reason', () => {
    const props = setup({ reason: 'Left the firm' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('AC-M02-06 shows the failure inline and keeps the dialog open', () => {
    const props = setup({ reason: 'Left the firm', error: 'Member already deactivated' });
    expect(screen.getByRole('alert')).toHaveTextContent('Member already deactivated');
    expect(props.onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('AC-M02-06 shows a working state and cancels', () => {
    const props = setup({ reason: 'Left the firm', isLoading: true });
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});
