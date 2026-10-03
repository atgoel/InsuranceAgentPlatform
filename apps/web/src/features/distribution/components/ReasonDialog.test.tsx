import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReasonDialog } from './ReasonDialog';

describe('ReasonDialog', () => {
  it('AC-M02-06 renders dialog when open', () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(
      <ReasonDialog
        isOpen={true}
        title="Suspend Member"
        reason=""
        onReasonChange={vi.fn()}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    expect(screen.getByText('Suspend Member')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Reason')).toBeInTheDocument();
  });

  it('AC-M02-06 does not render dialog when closed', () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(
      <ReasonDialog
        isOpen={false}
        title="Suspend Member"
        reason=""
        onReasonChange={vi.fn()}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    expect(screen.queryByText('Suspend Member')).not.toBeInTheDocument();
  });

  it('AC-M02-06 calls onReasonChange when textarea changes', () => {
    const handleReasonChange = vi.fn();
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(
      <ReasonDialog
        isOpen={true}
        title="Suspend Member"
        reason=""
        onReasonChange={handleReasonChange}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    const reasonTextarea = screen.getByPlaceholderText('Reason');
    fireEvent.change(reasonTextarea, { target: { value: 'Performance issues' } });

    expect(handleReasonChange).toHaveBeenCalledWith('Performance issues');
  });

  it('AC-M02-06 disables confirm button when reason is empty', () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(
      <ReasonDialog
        isOpen={true}
        title="Suspend Member"
        reason=""
        onReasonChange={vi.fn()}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    const confirmButton = screen.getByText('Confirm');
    expect(confirmButton).toBeDisabled();
  });

  it('AC-M02-06 disables confirm button when reason is only whitespace', () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(
      <ReasonDialog
        isOpen={true}
        title="Suspend Member"
        reason="   "
        onReasonChange={vi.fn()}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    const confirmButton = screen.getByText('Confirm');
    expect(confirmButton).toBeDisabled();
  });

  it('AC-M02-06 enables confirm button when reason is provided', () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(
      <ReasonDialog
        isOpen={true}
        title="Suspend Member"
        reason="Performance issues"
        onReasonChange={vi.fn()}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    const confirmButton = screen.getByText('Confirm');
    expect(confirmButton).not.toBeDisabled();
  });

  it('AC-M02-06 calls onConfirm when Confirm button is clicked', async () => {
    const handleConfirm = vi.fn().mockResolvedValue(undefined);
    const handleCancel = vi.fn();

    render(
      <ReasonDialog
        isOpen={true}
        title="Suspend Member"
        reason="Performance issues"
        onReasonChange={vi.fn()}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(handleConfirm).toHaveBeenCalled();
    });
  });

  it('AC-M02-06 calls onCancel when Cancel button is clicked', () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(
      <ReasonDialog
        isOpen={true}
        title="Suspend Member"
        reason="Performance issues"
        onReasonChange={vi.fn()}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(handleCancel).toHaveBeenCalled();
  });

  it('AC-M02-06 shows loading state during confirmation', () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(
      <ReasonDialog
        isOpen={true}
        title="Suspend Member"
        reason="Performance issues"
        onReasonChange={vi.fn()}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        isLoading={true}
      />
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('AC-M02-06 disables confirm button during loading', () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(
      <ReasonDialog
        isOpen={true}
        title="Suspend Member"
        reason="Performance issues"
        onReasonChange={vi.fn()}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        isLoading={true}
      />
    );

    const loadingButton = screen.getByText('Loading...');
    expect(loadingButton).toBeDisabled();
  });

  it('AC-M02-06 handles exit reason with longer text', () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();
    const longReason = 'Employee has decided to leave the organization due to career advancement opportunities elsewhere.';

    render(
      <ReasonDialog
        isOpen={true}
        title="Exit Member"
        reason={longReason}
        onReasonChange={vi.fn()}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    const confirmButton = screen.getByText('Confirm');
    expect(confirmButton).not.toBeDisabled();
  });

  it('AC-M02-06 respects min/max length constraints on textarea', () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(
      <ReasonDialog
        isOpen={true}
        title="Suspend Member"
        reason="Short"
        onReasonChange={vi.fn()}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    const reasonTextarea = screen.getByPlaceholderText('Reason') as HTMLTextAreaElement;
    expect(reasonTextarea.minLength).toBe(3);
    expect(reasonTextarea.maxLength).toBe(200);
  });

  it('AC-M02-07 works for member exit', () => {
    const handleConfirm = vi.fn().mockResolvedValue(undefined);
    const handleCancel = vi.fn();

    render(
      <ReasonDialog
        isOpen={true}
        title="Exit Member"
        reason="Retirement"
        onReasonChange={vi.fn()}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    expect(screen.getByText('Exit Member')).toBeInTheDocument();
    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);

    expect(handleConfirm).toHaveBeenCalled();
  });
});
