import { ButtonHTMLAttributes, forwardRef } from 'react';
import './Button.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'primary', size = 'md', loading = false, className, disabled, ...props },
    ref,
  ) => {
    const classes = [
      'btn',
      `btn-${variant}`,
      `btn-${size}`,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';
