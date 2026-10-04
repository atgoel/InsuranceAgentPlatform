import type { ReactNode } from 'react';
import './PageContainer.css';

export interface PageContainerProps {
  width?: 'default' | 'wide';
  children: ReactNode;
}

export function PageContainer({ width = 'default', children }: PageContainerProps) {
  return (
    <div className="page-container" data-width={width}>
      <div className="page-container-inner">{children}</div>
    </div>
  );
}
