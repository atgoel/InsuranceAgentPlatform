import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Stepper } from './Stepper';

describe('AC-M00-31 Stepper', () => {
  const steps = [
    { id: '1', label: 'Step 1', state: 'done' as const },
    { id: '2', label: 'Step 2', state: 'current' as const },
    { id: '3', label: 'Step 3', state: 'todo' as const },
  ];

  it('renders all steps', () => {
    render(<Stepper steps={steps} />);
    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('Step 2')).toBeInTheDocument();
    expect(screen.getByText('Step 3')).toBeInTheDocument();
  });

  it('shows step numbers', () => {
    render(<Stepper steps={steps} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
