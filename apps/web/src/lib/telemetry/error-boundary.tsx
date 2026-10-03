import { Component, ReactNode } from 'react';
import { ErrorState } from '../../design-system';
import { ClientTelemetry } from './client-telemetry';

export interface ErrorBoundaryProps {
  telemetry?: ClientTelemetry;
  children: ReactNode;
}

interface State {
  error?: Error;
}

/**
 * AC-M00-30 ErrorBoundary that renders ErrorState and reports to telemetry
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {};
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // Report error to telemetry
    this.props.telemetry?.reportError(error);
  }

  render(): ReactNode {
    if (this.state.error) {
      return <ErrorState error={this.state.error} />;
    }

    return this.props.children;
  }
}
