import { Button } from '../Button';
import './ErrorState.css';

export class ApiError extends Error {
  status: number;
  code: string;
  title: string;
  detail?: string;
  traceId?: string;

  constructor(status: number, code: string, title: string, detail?: string, traceId?: string) {
    super(title);
    this.status = status;
    this.code = code;
    this.title = title;
    this.detail = detail;
    this.traceId = traceId;
  }
}

export interface ErrorStateProps {
  error: ApiError | Error;
  onRetry?(): void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const isApiError = error instanceof ApiError;
  const traceId = isApiError ? error.traceId : undefined;
  const traceRef = traceId ? traceId.substring(0, 8) : '';

  const copyTrace = () => {
    if (traceId) {
      navigator.clipboard.writeText(traceId);
    }
  };

  return (
    <div className="error-state">
      <div className="error-state-icon">⚠️</div>
      <h2 className="error-state-title">Something went wrong</h2>
      {isApiError && error.detail && <p className="error-state-detail">{error.detail}</p>}
      {traceRef && (
        <div className="error-state-trace">
          <span>Reference {traceRef}</span>
          <button onClick={copyTrace} aria-label="Copy trace ID" className="copy-button">
            📋
          </button>
        </div>
      )}
      {onRetry && (
        <Button onClick={onRetry} size="lg">
          Try again
        </Button>
      )}
    </div>
  );
}
