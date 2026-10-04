import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageContainer } from './PageContainer';

describe('AC-M00-34 PageContainer', () => {
  it('renders children with default width', () => {
    render(
      <PageContainer>
        <p>Body</p>
      </PageContainer>,
    );
    expect(screen.getByText('Body').closest('.page-container')).toHaveAttribute('data-width', 'default');
  });

  it('marks the wide variant', () => {
    render(
      <PageContainer width="wide">
        <p>Body</p>
      </PageContainer>,
    );
    expect(screen.getByText('Body').closest('.page-container')).toHaveAttribute('data-width', 'wide');
  });
});
