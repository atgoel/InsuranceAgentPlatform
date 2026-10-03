import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PermissionDenied } from './PermissionDenied';

describe('AC-M00-28 PermissionDenied', () => {
  it('renders role message by default', () => {
    render(<PermissionDenied />);
    expect(screen.getByText(/required role/i)).toBeInTheDocument();
  });

  it('renders role message when specified', () => {
    render(<PermissionDenied reason="role" />);
    expect(screen.getByText(/required role/i)).toBeInTheDocument();
  });

  it('renders tenant message', () => {
    render(<PermissionDenied reason="tenant" />);
    expect(screen.getByText(/tenant.*access/i)).toBeInTheDocument();
  });
});
