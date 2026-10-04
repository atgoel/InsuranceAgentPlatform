import { ApiError } from './api-error';
import { newTraceId, newSpanId, formatTraceparent } from './trace';

export interface RequestOptions {
  idempotencyKey?: string;
  ifMatch?: string;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined>;
}

export interface ApiClient {
  get<T>(path: string, opts?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  del<T = void>(path: string, opts?: RequestOptions): Promise<T>;
}

export interface FetchApiClientOpts {
  baseUrl: string;
  getToken(): string | undefined;
  fetchImpl?: typeof fetch;
  newId?(): string;
  onError?(error: ApiError): void;
}

export class FetchApiClient implements ApiClient {
  private baseUrl: string;
  private getToken: () => string | undefined;
  private fetchImpl: typeof fetch;
  private newId: () => string;
  private onError?: (error: ApiError) => void;

  constructor(opts: FetchApiClientOpts) {
    this.baseUrl = opts.baseUrl;
    this.getToken = opts.getToken;
    // Browsers throw "Illegal invocation" when fetch is called as a method of another object, so never store it unbound.
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.newId = opts.newId ?? (() => Math.random().toString(36).slice(2));
    this.onError = opts.onError;
  }

  async get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request('GET', path, undefined, opts);
  }

  async post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request('POST', path, body, opts);
  }

  async put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request('PUT', path, body, opts);
  }

  async patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request('PATCH', path, body, opts);
  }

  async del<T = void>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request('DELETE', path, undefined, opts);
  }

  private buildHeaders(method: string, opts?: RequestOptions): Headers {
    const traceId = newTraceId();
    const spanId = newSpanId();
    const headers = new Headers({
      'Content-Type': 'application/json',
      traceparent: formatTraceparent(traceId, spanId),
    });

    const token = this.getToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (method === 'POST') {
      headers.set('Idempotency-Key', opts?.idempotencyKey ?? this.newId());
    }

    if (opts?.ifMatch) {
      headers.set('If-Match', opts.ifMatch);
    }

    return headers;
  }

  private async parseResponse(response: Response): Promise<unknown> {
    if (response.status === 204) {
      return undefined;
    }

    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');
    return isJson ? response.json() : null;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: RequestOptions,
  ): Promise<T> {
    try {
      const url = new URL(path, this.baseUrl);

      if (opts?.query) {
        Object.entries(opts.query).forEach(([key, value]) => {
          if (value !== undefined) {
            url.searchParams.set(key, String(value));
          }
        });
      }

      const headers = this.buildHeaders(method, opts);
      const response = await this.fetchImpl(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: opts?.signal,
      });

      const data = await this.parseResponse(response);

      if (!response.ok) {
        const error = ApiError.fromProblem(response.status, data ?? {});
        this.onError?.(error);
        throw error;
      }

      return data as T;
    } catch (cause) {
      if (cause instanceof ApiError) {
        throw cause;
      }
      const error = ApiError.network(cause instanceof Error ? cause : new Error(String(cause)));
      this.onError?.(error);
      throw error;
    }
  }
}
