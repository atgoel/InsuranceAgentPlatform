import type { ReactNode } from 'react';
import './KpiRow.css';

export interface KpiRowProps {
  children: ReactNode;
}

export function KpiRow({ children }: KpiRowProps) {
  return (
    <div className="kpi-row-frame">
      <div className="kpi-row">{children}</div>
    </div>
  );
}
