import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PageHeader } from './PageHeader';

describe('AC-M00-34 PageHeader', () => {
  it('renders h1, subtitle, actions and back link', () => {
    render(
      <MemoryRouter>
        <PageHeader
          title="Leads"
          subtitle="All leads"
          actions={<button type="button">Add lead</button>}
          back={{ to: '/crm', label: 'Back to CRM' }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Leads' })).toBeInTheDocument();
    expect(screen.getByText('All leads')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add lead' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to CRM' })).toHaveAttribute('href', '/crm');
  });

  it('omits optional parts when not given', () => {
    render(
      <MemoryRouter>
        <PageHeader title="Leads" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Leads' })).toBeInTheDocument();
  });
});
