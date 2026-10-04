import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateInput } from './DateInput';

describe('AC-M00-34 DateInput', () => {
  it('associates the label and passes min/max through', () => {
    render(<DateInput label="From" value="2026-10-04" onChange={() => {}} min="2026-10-01" max="2026-10-31" />);
    const input = screen.getByLabelText('From');
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveValue('2026-10-04');
    expect(input).toHaveAttribute('min', '2026-10-01');
    expect(input).toHaveAttribute('max', '2026-10-31');
  });

  it('passes the string value to onChange', () => {
    const onChange = vi.fn();
    render(<DateInput label="From" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-05' } });
    expect(onChange).toHaveBeenCalledWith('2026-10-05');
  });

  it('hides the label visually but keeps the accessible name', () => {
    render(<DateInput label="From" value="" onChange={() => {}} hideLabel />);
    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByText('From')).toHaveClass('sr-only');
  });
});
