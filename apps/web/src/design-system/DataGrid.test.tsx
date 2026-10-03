import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataGrid } from './DataGrid';

describe('AC-M00-31 DataGrid component', () => {
  interface Row {
    id: string;
    name: string;
  }

  it('renders columns and rows', () => {
    const rows: Row[] = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ];
    render(
      <DataGrid
        columns={[
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
        ]}
        rows={rows}
        rowKey={r => r.id}
      />,
    );
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders empty state when no rows', () => {
    render(
      <DataGrid
        columns={[{ key: 'name', header: 'Name' }]}
        rows={[]}
        rowKey={() => ''}
        empty={<div>No data</div>}
      />,
    );
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('uses custom render function for columns', () => {
    const rows: Row[] = [{ id: '1', name: 'Alice' }];
    render(
      <DataGrid
        columns={[
          { key: 'name', header: 'Name', render: r => `Name: ${r.name}` },
        ]}
        rows={rows}
        rowKey={r => r.id}
      />,
    );
    expect(screen.getByText('Name: Alice')).toBeInTheDocument();
  });
});
