import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchField } from './SearchField';

describe('AC-M00-34 SearchField', () => {
  it('associates the label and shows placeholder and value', () => {
    render(<SearchField label="Search leads" value="abc" onChange={() => {}} placeholder="Name or phone" />);
    const input = screen.getByLabelText('Search leads');
    expect(input).toHaveAttribute('type', 'search');
    expect(input).toHaveValue('abc');
    expect(input).toHaveAttribute('placeholder', 'Name or phone');
  });

  it('passes the typed string to onChange', async () => {
    const onChange = vi.fn();
    render(<SearchField label="Search leads" value="" onChange={onChange} />);
    await userEvent.setup().type(screen.getByLabelText('Search leads'), 'x');
    expect(onChange).toHaveBeenCalledWith('x');
  });

  it('renders a decorative icon hidden from assistive tech', () => {
    const { container } = render(<SearchField label="Search leads" value="" onChange={() => {}} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
