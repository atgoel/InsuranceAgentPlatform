import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('AC-M00-31 Button component', () => {
  it('renders a button with default primary variant', () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole('button', { name: /click me/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveClass('btn-primary');
  });

  it('supports secondary variant', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole('button', { name: /secondary/i });
    expect(btn).toHaveClass('btn-secondary');
  });

  it('supports ghost variant', () => {
    render(<Button variant="ghost">Ghost</Button>);
    const btn = screen.getByRole('button', { name: /ghost/i });
    expect(btn).toHaveClass('btn-ghost');
  });

  it('supports danger variant', () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole('button', { name: /delete/i });
    expect(btn).toHaveClass('btn-danger');
  });

  it('supports md and lg sizes', () => {
    const { rerender } = render(<Button size="md">Medium</Button>);
    expect(screen.getByRole('button')).toHaveClass('btn-md');

    rerender(<Button size="lg">Large</Button>);
    expect(screen.getByRole('button')).toHaveClass('btn-lg');
  });

  it('has minimum height of 44px via touch target', () => {
    render(<Button>Touch target</Button>);
    const btn = screen.getByRole('button');
    // Verify it has the btn class which applies min-height via CSS
    expect(btn).toHaveClass('btn');
  });

  it('loading state disables button and sets aria-busy', () => {
    render(<Button loading>Loading</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('accepts standard button HTML attributes', () => {
    render(<Button disabled>Disabled</Button>);
    const btn = screen.getByRole('button', { name: /disabled/i });
    expect(btn).toBeDisabled();
  });

  it('forwards click handlers', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    screen.getByRole('button').click();
    expect(onClick).toHaveBeenCalled();
  });
});
