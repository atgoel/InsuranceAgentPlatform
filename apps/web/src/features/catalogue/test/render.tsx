import { vi, type Mock } from 'vitest';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { ApiProvider } from '../../../lib/api';
import { ApiClient } from '../../../lib/api/api-client';
import { I18nProvider } from '../../../lib/i18n';

export interface MockClient extends ApiClient {
  get: Mock;
  post: Mock;
}

/** An ApiClient whose GET/POST answers come from `routes` (path → value, or a function of the call options). */
export function mockClient(routes: Record<string, unknown>): MockClient {
  const answer = (path: string, opts?: unknown) => {
    const value = routes[path];
    if (value instanceof Error) return Promise.reject(value);
    if (typeof value === 'function') return Promise.resolve((value as (o: unknown) => unknown)(opts));
    return value === undefined ? Promise.reject(new Error(`unexpected call ${path}`)) : Promise.resolve(value);
  };
  return { get: vi.fn(answer), post: vi.fn(answer), put: vi.fn(), patch: vi.fn(), del: vi.fn() } as unknown as MockClient;
}

function Where() {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
}

/** Renders `element` at `path` inside a real data router, with a probe route that shows where navigation landed. */
export function renderAt(element: ReactElement, client: ApiClient, path: string, routePath = path.split('?')[0]) {
  const router = createMemoryRouter(
    [
      { path: routePath, element },
      { path: '*', element: <Where /> },
    ],
    { initialEntries: [path] },
  );
  return render(
    <ApiProvider client={client}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </ApiProvider>,
  );
}
