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
  [key: string]: unknown;
}

export class ApiError extends Error {
  status: number;
  code: string;
  title: string;
  detail?: string;
  traceId?: string;
  errors?: FieldError[];

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
    return new ApiError(
      body.status ?? status,
      body.code ?? 'unknown_error',
      body.title ?? 'An error occurred',
      body.detail,
      body.traceId,
    );
  }

  static network(cause: Error): ApiError {
    const error = new ApiError(0, 'network_error', 'Network error');
    error.cause = cause;
    return error;
  }
}
