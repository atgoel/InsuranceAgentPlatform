import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../../lib/i18n';
import { ApiError } from '../../../lib/api/api-error';
import { CustomFieldsSection } from './CustomFieldsSection';
import type { CustomFieldDefinition } from '../../tenancy/api';

function def(partial: Partial<CustomFieldDefinition> & Pick<CustomFieldDefinition, 'key' | 'type'>): CustomFieldDefinition {
  return {
    id: `cfd_${partial.key}`,
    entity: 'party',
    label: { en: partial.key },
    required: false,
    piiClass: 'P0',
    reportable: false,
    version: 1,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

const definitions: CustomFieldDefinition[] = [
  def({ key: 'branch_code', type: 'text', label: { en: 'Branch code' }, required: true }),
  def({ key: 'seats', type: 'number', label: { en: 'Seats' } }),
  def({ key: 'budget', type: 'money', label: { en: 'Budget' } }),
  def({ key: 'visit_on', type: 'date', label: { en: 'Visit date' } }),
  def({
    key: 'region',
    type: 'enum',
    label: { en: 'Region' },
    enumOptions: [
      { value: 'NORTH', label: { en: 'North zone' } },
      { value: 'SOUTH', label: { en: 'South zone' } },
    ],
  }),
  def({ key: 'vip', type: 'boolean', label: { en: 'VIP' } }),
  def({ key: 'old', type: 'text', label: { en: 'Retired field' }, active: false }),
];

const values = { branch_code: 'BR-7', seats: 12, budget: 123456, visit_on: '2026-03-05', region: 'SOUTH', vip: true, old: 'hidden' };

function renderSection(onSave = vi.fn().mockResolvedValue(undefined), defs = definitions, canEdit = true) {
  render(
    <I18nProvider>
      <CustomFieldsSection entity="party" definitions={defs} values={values} version={7} canEdit={canEdit} onSave={onSave} />
    </I18nProvider>,
  );
  return onSave;
}

function valueOf(label: string): string | null {
  const term = screen.getByText(label, { selector: 'dt' });
  return term.nextElementSibling?.textContent ?? null;
}

describe('AC-CR001-08 CustomFieldsSection', () => {
  it('AC-CR001-08 renders each value by type with money in rupees and the enum label', () => {
    renderSection();
    expect(valueOf('Branch code')).toBe('BR-7');
    expect(valueOf('Seats')).toBe('12');
    expect(valueOf('Budget')).toBe('₹1,234.56');
    expect(valueOf('Visit date')).toBe('2026-03-05');
    expect(valueOf('Region')).toBe('South zone');
    expect(valueOf('VIP')).toBe('Yes');
    expect(screen.queryByText('Retired field')).not.toBeInTheDocument();
    expect(screen.queryByText('hidden')).not.toBeInTheDocument();
  });

  it('AC-CR001-08 is hidden when there are no active definitions for the entity', () => {
    renderSection(undefined, [definitions[6], def({ key: 'x', type: 'text', entity: 'lead' })]);
    expect(screen.queryByRole('heading', { name: 'Custom fields' })).not.toBeInTheDocument();
  });

  it('AC-CR001-08 shows values but no Edit action without write permission', () => {
    renderSection(undefined, definitions, false);
    expect(valueOf('Budget')).toBe('₹1,234.56');
    expect(screen.queryByRole('button', { name: 'Edit custom fields' })).not.toBeInTheDocument();
  });

  it('AC-CR001-08 saves edits with rupees converted to integer paise and the record version', async () => {
    const onSave = renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Edit custom fields' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByLabelText('Budget (rupees)')).toHaveValue('1234.56');

    const budget = within(sheet).getByLabelText('Budget (rupees)');
    await userEvent.clear(budget);
    await userEvent.type(budget, '19.99');
    await userEvent.selectOptions(within(sheet).getByLabelText('Region'), 'NORTH');
    await userEvent.click(within(sheet).getByLabelText('VIP'));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(
      { branch_code: 'BR-7', seats: 12, budget: 1999, visit_on: '2026-03-05', region: 'NORTH', vip: false },
      7,
    );
  });

  it('AC-CR001-08 marks required fields and refuses a malformed rupee amount without calling save', async () => {
    const onSave = renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Edit custom fields' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByLabelText('Branch code *')).toBeInTheDocument();
    const budget = within(sheet).getByLabelText('Budget (rupees)');
    await userEvent.clear(budget);
    await userEvent.type(budget, '1.234');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));

    expect(budget).toHaveAccessibleDescription('Enter an amount in rupees, up to two decimals');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('AC-CR001-08 shows server field errors inline next to the offending fields', async () => {
    const problem = new ApiError(400, 'invalid_custom_fields', 'Invalid custom fields');
    problem.errors = [
      { path: 'customFields.branch_code', code: 'required', message: 'required' },
      { path: 'customFields.seats', code: 'invalid_type', message: 'bad type' },
    ];
    const onSave = vi.fn().mockRejectedValue(problem);
    renderSection(onSave);
    await userEvent.click(screen.getByRole('button', { name: 'Edit custom fields' }));
    const sheet = await screen.findByRole('dialog');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));

    expect(await within(sheet).findByLabelText(/^Branch code \*/)).toHaveAccessibleDescription('This field is required');
    expect(within(sheet).getByLabelText(/^Seats/)).toHaveAccessibleDescription('Enter a valid value');
    expect(within(sheet).getByLabelText('Visit date')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('AC-CR001-08 shows another failure title inline and keeps the sheet open', async () => {
    renderSection(vi.fn().mockRejectedValue(new ApiError(412, 'precondition_failed', 'The record changed, reload and retry')));
    await userEvent.click(screen.getByRole('button', { name: 'Edit custom fields' }));
    const sheet = await screen.findByRole('dialog');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));

    expect(await within(sheet).findByRole('alert')).toHaveTextContent('The record changed, reload and retry');
    expect(within(sheet).getByLabelText('Seats')).toHaveValue('12');
  });
});
