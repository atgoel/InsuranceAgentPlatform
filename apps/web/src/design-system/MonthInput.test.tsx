import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MonthInput } from './MonthInput';

describe('AC-M00-34 MonthInput', () => {
  it('associates the label and shows the value', () => {
    render(<MonthInput label="Month" value="2026-10" onChange={() => {}} />);
    const input = screen.getByLabelText('Month');
    expect(input).toHaveAttribute('type', 'month');
    expect(input).toHaveValue('2026-10');
    expect(screen.getByText('Month')).not.toHaveClass('sr-only');
  });

  it('passes the string value to onChange', () => {
    const onChange = vi.fn();
    render(<MonthInput label="Month" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2026-11' } });
    expect(onChange).toHaveBeenCalledWith('2026-11');
  });

  it('hides the label visually but keeps the accessible name', () => {
    render(<MonthInput label="Month" value="" onChange={() => {}} hideLabel />);
    expect(screen.getByLabelText('Month')).toBeInTheDocument();
    expect(screen.getByText('Month')).toHaveClass('sr-only');
  });
});
