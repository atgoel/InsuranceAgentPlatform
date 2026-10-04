import type { ReactNode } from 'react';
import './KpiTile.css';

export interface KpiTileProps {
  label: string;
  value: ReactNode;
  caption?: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad';
}

export function KpiTile({ label, value, caption, tone = 'neutral' }: KpiTileProps) {
  return (
    <div className="kpi-tile" data-tone={tone}>
      <div className="kpi-tile-label">{label}</div>
      <div className="kpi-tile-value">{value}</div>
      {caption && <div className="kpi-tile-caption">{caption}</div>}
    </div>
  );
}
