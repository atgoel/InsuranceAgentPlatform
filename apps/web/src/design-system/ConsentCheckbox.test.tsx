import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsentCheckbox } from './ConsentCheckbox';

describe('AC-M00-31 ConsentCheckbox', () => {
  it('shows notice version', () => {
    render(
      <ConsentCheckbox
        purpose="marketing"
        noticeVersion="2.1"
        checked={false}
        onChange={() => {}}
        label="I agree"
      />,
    );
    expect(screen.getByText(/Notice v2.1/)).toBeInTheDocument();
  });

  it('toggles on click', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ConsentCheckbox
        purpose="marketing"
        noticeVersion="1.0"
        checked={false}
        onChange={onChange}
        label="I agree"
      />,
    );
    await user.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
