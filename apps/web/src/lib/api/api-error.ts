export interface FieldError {
  path: string;
  code: string;
  message: string;
}

export interface ProblemDetails {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  code: string;
  traceId?: string;
  errors?: FieldError[];
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

const STANDARD_MEMBERS = new Set(['type', 'title', 'status', 'detail', 'instance', 'code', 'traceId', 'errors', 'details']);

export class ApiError extends Error {
  status: number;
  code: string;
  title: string;
  detail?: string;
  traceId?: string;
  errors?: FieldError[];
  details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    title: string,
    detail?: string,
    traceId?: string,
  ) {
    super(title);
    this.status = status;
    this.code = code;
    this.title = title;
    this.detail = detail;
    this.traceId = traceId;
  }

  static fromProblem(status: number, body: Partial<ProblemDetails>): ApiError {
    const error = new ApiError(
      body.status ?? status,
      body.code ?? 'unknown_error',
      body.title ?? 'An error occurred',
      body.detail,
      body.traceId,
    );
    error.errors = body.errors;
    // The API spreads error details as top-level problem members (e.g. `missing`, `reason`); keep them together here.
    const extensions = Object.fromEntries(Object.entries(body).filter(([key]) => !STANDARD_MEMBERS.has(key)));
    const merged = { ...extensions, ...(body.details ?? {}) };
    error.details = Object.keys(merged).length ? merged : undefined;
    return error;
  }

  static network(cause: Error): ApiError {
    const error = new ApiError(0, 'network_error', 'Network error');
    error.cause = cause;
    return error;
  }
}
