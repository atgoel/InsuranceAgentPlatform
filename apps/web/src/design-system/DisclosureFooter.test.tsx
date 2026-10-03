import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DisclosureFooter } from './DisclosureFooter';

describe('AC-M00-31 DisclosureFooter', () => {
  it('renders text', () => {
    render(<DisclosureFooter text="Footer text" />);
    expect(screen.getByText('Footer text')).toBeInTheDocument();
  });
});
