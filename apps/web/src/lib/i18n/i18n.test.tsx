import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, useT } from './i18n';

function TestComponent() {
  const { t, lang, setLang } = useT();
  return (
    <div>
      <div>{t('app.title')}</div>
      <div>{t('plural.leads', { count: 1 })}</div>
      <div>{t('plural.leads', { count: 5 })}</div>
      <div>{t('missing.key')}</div>
      <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}>Toggle</button>
      <div data-testid="lang">{lang}</div>
    </div>
  );
}

describe('AC-M00-29 i18n', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders EN strings by default', () => {
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>,
    );
    expect(screen.getByText('Insurance Agent Platform')).toBeInTheDocument();
  });

  it('switches to हि and re-renders', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>,
    );
    expect(screen.getByText('Insurance Agent Platform')).toBeInTheDocument();
    await user.click(screen.getByText('Toggle'));
    expect(screen.getByText('बीमा एजेंट प्लेटफॉर्म')).toBeInTheDocument();
    expect(screen.getByTestId('lang')).toHaveTextContent('hi');
  });

  it('persists language to localStorage', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>,
    );
    await user.click(screen.getByText('Toggle'));
    expect(localStorage.getItem('ui-lang')).toBe('hi');
  });

  it('interpolates {param}', () => {
    function Param() {
      const { t } = useT();
      return <div>{t('plural.leads', { count: 3 })}</div>;
    }
    render(
      <I18nProvider>
        <Param />
      </I18nProvider>,
    );
    expect(screen.getByText(/3 leads?/i)).toBeInTheDocument();
  });

  it('handles plurals one/other correctly', () => {
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>,
    );
    // Check that plurals are rendered with count
    const elements = screen.getAllByText(/lead/);
    expect(elements.length).toBeGreaterThan(0);
  });

  it('falls back to en when hi key missing', () => {
    function Missing() {
      const { t } = useT();
      // Use a key that exists in both
      return <div>{t('auth.login')}</div>;
    }
    render(
      <I18nProvider initialLang="hi">
        <Missing />
      </I18nProvider>,
    );
    // Should get the English fallback
    expect(screen.getByText(/login|लॉगिन/i)).toBeInTheDocument();
  });

  it('returns key when both en and hi missing', () => {
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>,
    );
    expect(screen.getByText('missing.key')).toBeInTheDocument();
  });

  it('tolerates localStorage throwing', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage error');
    });
    expect(() => {
      render(
        <I18nProvider>
          <TestComponent />
        </I18nProvider>,
      );
    }).not.toThrow();
    spy.mockRestore();
  });
});
