import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../lib/i18n';

/** Renders a component inside the I18nProvider every distribution component needs. */
export function renderT(ui: ReactElement) {
  return render(ui, { wrapper: I18nProvider });
}
