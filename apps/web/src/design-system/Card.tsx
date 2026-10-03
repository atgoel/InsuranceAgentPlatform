import { ReactNode } from 'react';
import './Card.css';

export interface CardProps {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function Card({ title, actions, children }: CardProps) {
  return (
    <div className="card">
      {(title || actions) && (
        <div className="card-header">
          {title && <h3 className="card-title">{title}</h3>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      <div className="card-content">{children}</div>
    </div>
  );
}
