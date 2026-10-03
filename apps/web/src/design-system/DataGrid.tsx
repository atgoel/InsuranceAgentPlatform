import { ReactNode } from 'react';
import './DataGrid.css';

export interface Column<T> {
  key: string;
  header: string;
  render?(row: T): ReactNode;
  align?: 'left' | 'right';
}

export interface DataGridProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey(row: T): string;
  onRowClick?(row: T): void;
  empty?: ReactNode;
  caption?: string;
}

export function DataGrid<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  caption,
}: DataGridProps<T>) {
  if (rows.length === 0) {
    return <div className="data-grid-empty">{empty}</div>;
  }

  return (
    <div className="data-grid-wrapper">
      <table className="data-grid" role="grid">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={{ textAlign: col.align || 'left' }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={rowKey(row)}
              onClick={() => onRowClick?.(row)}
              style={{ cursor: onRowClick ? 'pointer' : 'default' }}
            >
              {columns.map(col => (
                <td key={col.key} style={{ textAlign: col.align || 'left' }}>
                  {col.render ? col.render(row) : String(row[col.key as keyof T])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
