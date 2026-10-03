import { ReactNode } from 'react';
import './StatusChip.css';

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'info';

export interface StatusChipProps {
  tone: Tone;
  children: ReactNode;
}

export function StatusChip({ tone, children }: StatusChipProps) {
  return <span className="status-chip" data-tone={tone}>{children}</span>;
}
