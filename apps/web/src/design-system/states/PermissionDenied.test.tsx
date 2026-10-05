import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PermissionDenied } from './PermissionDenied';
import { I18nProvider } from '../../lib/i18n';

describe('AC-M00-28 PermissionDenied', () => {
  it('renders role message by default', () => {
    render(<I18nProvider><PermissionDenied /></I18nProvider>);
    expect(screen.getByText(/required role/i)).toBeInTheDocument();
  });

  it('renders role message when specified', () => {
    render(<I18nProvider><PermissionDenied reason="role" /></I18nProvider>);
    expect(screen.getByText(/required role/i)).toBeInTheDocument();
  });

  it('renders tenant message', () => {
    render(<I18nProvider><PermissionDenied reason="tenant" /></I18nProvider>);
    expect(screen.getByText(/tenant.*access/i)).toBeInTheDocument();
  });

  it('AC-M00-28 renders the Hindi title and role message', () => {
    render(
      <I18nProvider initialLang="hi">
        <PermissionDenied />
      </I18nProvider>,
    );
    expect(screen.getByRole('heading', { name: 'पहुँच अस्वीकृत' })).toBeInTheDocument();
    expect(screen.getByText('इस पेज को खोलने के लिए आपके पास ज़रूरी भूमिका नहीं है।')).toBeInTheDocument();
  });

  it('AC-M00-28 renders the Hindi tenant message', () => {
    render(
      <I18nProvider initialLang="hi">
        <PermissionDenied reason="tenant" />
      </I18nProvider>,
    );
    expect(screen.getByText('आपके खाते के पास इस सुविधा की पहुँच नहीं है।')).toBeInTheDocument();
  });
});
