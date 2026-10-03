import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../../../lib/i18n';
import { ValidateStep } from './ValidateStep';

describe('AC-M04-30 rejected-row download', () => {
  it('AC-M04-30 downloads the original cells plus reasons for each rejected (1-based) row, formula-safe', async () => {
    const save = vi.fn();
    render(
      <I18nProvider>
        <ValidateStep
          preview={{ valid: 1, duplicates: 0, rejected: [{ row: 2, reasons: ['invalid_mobile', 'missing_name'] }] }}
          headers={['Name', 'Mobile']}
          rows={[['Asha', '9876500001'], ['=cmd|calc', '+91']]}
          onNext={vi.fn()}
          onBack={vi.fn()}
          save={save}
        />
      </I18nProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Download rejected rows as CSV' }));
    const [blob, name] = save.mock.calls[0] as [Blob, string];
    expect(name).toBe('rejected-rows.csv');
    expect(await blob.text()).toBe("Name,Mobile,Rejection reasons\r\n'=cmd|calc,'+91,invalid_mobile; missing_name");
  });

  it('AC-M04-30 nothing valid → Next is disabled', () => {
    render(<I18nProvider><ValidateStep preview={{ valid: 0, duplicates: 2, rejected: [] }} headers={[]} rows={[]} onNext={vi.fn()} onBack={vi.fn()} /></I18nProvider>);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});
