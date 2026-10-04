import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { AuthProvider } from '../lib/auth';
import { I18nProvider } from '../lib/i18n';

function Where() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

/** Renders `element` at `path` with auth + i18n providers; other paths show a location probe. */
export function renderWithAuth(element: ReactElement, path: string) {
  const router = createMemoryRouter(
    [
      { path, element },
      { path: '*', element: <Where /> },
    ],
    { initialEntries: [path] },
  );
  return render(
    <AuthProvider>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </AuthProvider>,
  );
}
