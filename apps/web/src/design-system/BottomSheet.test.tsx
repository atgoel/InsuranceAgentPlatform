import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BottomSheet } from './BottomSheet';

describe('AC-M00-31 BottomSheet component', () => {
  it('renders when open', () => {
    render(
      <BottomSheet open={true} title="Sheet" onClose={() => {}}>
        Content
      </BottomSheet>,
    );
    expect(screen.getByText('Sheet')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <BottomSheet open={false} title="Sheet" onClose={() => {}}>
        Content
      </BottomSheet>,
    );
    expect(screen.queryByText('Sheet')).not.toBeInTheDocument();
  });

  it('has dialog role and aria-modal', () => {
    render(
      <BottomSheet open={true} title="Sheet" onClose={() => {}}>
        Content
      </BottomSheet>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('closes when close button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <BottomSheet open={true} title="Sheet" onClose={onClose}>
        Content
      </BottomSheet>,
    );
    await user.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape key', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <BottomSheet open={true} title="Sheet" onClose={onClose}>
        Content
      </BottomSheet>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when clicking overlay', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <BottomSheet open={true} title="Sheet" onClose={onClose}>
        Content
      </BottomSheet>,
    );
    const overlay = container.querySelector('.bottom-sheet-overlay');
    if (overlay) {
      await user.click(overlay);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('stops propagation when clicking sheet content', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <BottomSheet open={true} title="Sheet" onClose={onClose}>
        <button>Inner button</button>
      </BottomSheet>,
    );
    await user.click(screen.getByText('Inner button'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
