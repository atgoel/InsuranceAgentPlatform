import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusChip } from './StatusChip';

describe('AC-M00-31 StatusChip component', () => {
  it('renders with ok tone', () => {
    render(<StatusChip tone="ok">Active</StatusChip>);
    const chip = screen.getByText('Active');
    expect(chip).toHaveAttribute('data-tone', 'ok');
  });

  it('renders with warn tone', () => {
    render(<StatusChip tone="warn">Warning</StatusChip>);
    expect(screen.getByText('Warning')).toHaveAttribute('data-tone', 'warn');
  });

  it('renders with bad tone', () => {
    render(<StatusChip tone="bad">Error</StatusChip>);
    expect(screen.getByText('Error')).toHaveAttribute('data-tone', 'bad');
  });

  it('renders with neutral tone', () => {
    render(<StatusChip tone="neutral">Neutral</StatusChip>);
    expect(screen.getByText('Neutral')).toHaveAttribute('data-tone', 'neutral');
  });

  it('renders with info tone', () => {
    render(<StatusChip tone="info">Info</StatusChip>);
    expect(screen.getByText('Info')).toHaveAttribute('data-tone', 'info');
  });

  it('is a span element', () => {
    render(<StatusChip tone="ok">Status</StatusChip>);
    const chip = screen.getByText('Status');
    expect(chip.tagName).toBe('SPAN');
  });
});
