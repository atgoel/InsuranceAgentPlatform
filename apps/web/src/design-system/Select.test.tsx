import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './Select';

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
];

describe('AC-M00-34 Select', () => {
  it('associates the label and renders options', () => {
    render(<Select label="Branch" value="a" options={options} onChange={() => {}} />);
    expect(screen.getByLabelText('Branch')).toHaveValue('a');
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['Alpha', 'Beta']);
  });

  it('passes the string value to onChange', async () => {
    const onChange = vi.fn();
    render(<Select label="Branch" value="a" options={options} onChange={onChange} />);
    await userEvent.setup().selectOptions(screen.getByLabelText('Branch'), 'b');
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('keeps an accessible name when the label is visually hidden', () => {
    render(<Select label="Branch" value="a" options={options} onChange={() => {}} hideLabel />);
    expect(screen.getByLabelText('Branch')).toBeInTheDocument();
    expect(screen.getByText('Branch')).toHaveClass('sr-only');
  });

  it('shows the label visibly by default and uses the id prop', () => {
    render(<Select label="Branch" value="a" options={options} onChange={() => {}} id="branch-select" />);
    expect(screen.getByText('Branch')).not.toHaveClass('sr-only');
    expect(screen.getByLabelText('Branch')).toHaveAttribute('id', 'branch-select');
  });
});
