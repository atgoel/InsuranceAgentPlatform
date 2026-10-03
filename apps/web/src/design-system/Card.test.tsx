import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('AC-M00-31 Card component', () => {
  it('renders children', () => {
    render(<Card>Content</Card>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(<Card title="My Card">Content</Card>);
    expect(screen.getByText('My Card')).toBeInTheDocument();
  });

  it('renders actions when provided', () => {
    render(
      <Card title="Card" actions={<button>Action</button>}>
        Content
      </Card>,
    );
    expect(screen.getByText('Action')).toBeInTheDocument();
  });
});
