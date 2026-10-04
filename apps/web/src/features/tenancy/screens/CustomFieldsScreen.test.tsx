import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockClient } from '../../../test/render';
import { ApiError } from '../../../lib/api/api-error';
import { CustomFieldsScreen } from './CustomFieldsScreen';
import type { CustomFieldDefinition } from '../api';

const LIST = '/api/v1/tenant/custom-fields';

const branchCode: CustomFieldDefinition = {
  id: 'cfd_1',
  entity: 'party',
  key: 'branch_code',
  label: { en: 'Branch code' },
  type: 'text',
  required: false,
  piiClass: 'P0',
  reportable: true,
  version: 3,
  active: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

function setup(items: CustomFieldDefinition[] = [branchCode], permissions: string[] = ['tenant.custom_field.write']) {
  const client = mockClient({ '/api/v1/me': { userRef: 'u1', tenantId: 't1', roles: [], permissions }, [LIST]: { items, usage: { active: items.filter((d) => d.active).length, limit: 5 } } });
  renderAt(<CustomFieldsScreen />, client, '/console/custom-fields');
  return client;
}

async function openAddSheet() {
  await userEvent.click(await screen.findByRole('button', { name: '+ Add field' }));
  return screen.findByRole('dialog');
}

describe('AC-CR001-04 CustomFieldsScreen', () => {
  it('AC-CR001-04 shows the usage meter and the definitions of the selected entity tab', async () => {
    const client = setup();
    expect(await screen.findByText('1 of 5 custom fields in use')).toBeInTheDocument();
    expect(screen.getByText('There is no free-form entity builder, by design.')).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /branch_code/ });
    expect(within(row).getByText('Branch code')).toBeInTheDocument();
    expect(within(row).getByText('Text')).toBeInTheDocument();
    expect(within(row).getByText('P0')).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith(LIST, { query: { entity: undefined } });

    await userEvent.click(screen.getByRole('tab', { name: /Leads/ }));
    expect(screen.getByText('No custom fields for this record type yet')).toBeInTheDocument();
    expect(screen.queryByText('branch_code')).not.toBeInTheDocument();
  });

  it('AC-CR001-04 does not offer P3 and explains why', async () => {
    setup();
    const sheet = await openAddSheet();
    const options = within(within(sheet).getByLabelText('PII class')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['P0 - Not personal', 'P1 - Personal', 'P2 - Sensitive']);
    expect(within(sheet).getByText('Highly sensitive data (P3) cannot be stored in custom fields')).toBeInTheDocument();
  });

  it('AC-CR001-04 disables and unchecks reportable when the PII class is P2', async () => {
    setup();
    const sheet = await openAddSheet();
    const reportable = within(sheet).getByLabelText('Reportable');
    await userEvent.click(reportable);
    expect(reportable).toBeChecked();
    await userEvent.selectOptions(within(sheet).getByLabelText('PII class'), 'P2');
    expect(reportable).toBeDisabled();
    expect(reportable).not.toBeChecked();
  });

  it('AC-CR001-04 posts the new definition with exactly the entered values', async () => {
    const client = setup();
    const created = { ...branchCode, id: 'cfd_2', key: 'region', label: { en: 'Region', hi: 'क्षेत्र' }, type: 'enum' as const, version: 1 };
    client.post.mockResolvedValue(created);
    const user = userEvent.setup({ delay: null });
    const sheet = await openAddSheet();
    const fill = async (label: string, value: string) => {
      await user.click(within(sheet).getByLabelText(label));
      await user.paste(value);
    };
    await fill('Key', 'region');
    await fill('Label (English)', 'Region');
    await fill('Label (Hindi)', 'क्षेत्र');
    await user.selectOptions(within(sheet).getByLabelText('Type'), 'enum');
    await fill('Option 1 value', 'north');
    await fill('Option 1 label (English)', 'North');
    await user.click(within(sheet).getByLabelText('Required'));
    await user.click(within(sheet).getByRole('button', { name: 'Add field' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.post).toHaveBeenCalledWith(
      LIST,
      {
        entity: 'party',
        key: 'region',
        label: { en: 'Region', hi: 'क्षेत्र' },
        type: 'enum',
        enumOptions: [{ value: 'NORTH', label: { en: 'North' } }],
        required: true,
        piiClass: 'P0',
        reportable: false,
      },
      { idempotencyKey: expect.any(String) },
    );
    expect(screen.getByText('2 of 5 custom fields in use')).toBeInTheDocument();
    expect(screen.getByText('region')).toBeInTheDocument();
  });

  it('AC-CR001-04 shows a duplicate key error inline on the key field and keeps the sheet open', async () => {
    const client = setup();
    client.post.mockRejectedValue(new ApiError(409, 'custom_field_exists', 'A field with this key already exists'));
    const sheet = await openAddSheet();
    await userEvent.type(within(sheet).getByLabelText('Key'), 'branch_code');
    await userEvent.type(within(sheet).getByLabelText('Label (English)'), 'Branch code');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add field' }));

    const keyField = await within(sheet).findByLabelText(/^Key/);
    expect(keyField).toHaveAccessibleDescription('A field with this key already exists');
    expect(keyField).toHaveValue('branch_code');
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('AC-CR001-04 shows the plan limit as a banner with the limit', async () => {
    const client = setup();
    const limit = new ApiError(422, 'custom_field_limit_reached', 'Limit reached');
    limit.details = { limit: 5 };
    client.post.mockRejectedValue(limit);
    const sheet = await openAddSheet();
    await userEvent.type(within(sheet).getByLabelText('Key'), 'extra');
    await userEvent.type(within(sheet).getByLabelText('Label (English)'), 'Extra');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add field' }));

    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Your plan allows 5 active custom fields. Deactivate one to add another.');
  });

  it('AC-CR001-04 revises a definition with If-Match carrying its version', async () => {
    const client = setup();
    const revised = { ...branchCode, label: { en: 'Branch' }, version: 4 };
    client.patch.mockResolvedValue(revised);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Branch code' }));
    const sheet = await screen.findByRole('dialog');
    const label = within(sheet).getByLabelText('Label (English)');
    await userEvent.clear(label);
    await userEvent.type(label, 'Branch');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.patch).toHaveBeenCalledWith(
      `${LIST}/cfd_1`,
      { label: { en: 'Branch' }, required: false, reportable: true, active: true },
      { ifMatch: '"v3"' },
    );
    expect(screen.getByRole('row', { name: /branch_code/ })).toHaveTextContent('Branch');
  });

  it('AC-CR001-04 deactivates from the table switch with If-Match', async () => {
    const client = setup();
    client.patch.mockResolvedValue({ ...branchCode, active: false, version: 4 });
    const toggle = await screen.findByRole('switch', { name: 'Active: Branch code' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(toggle);

    await waitFor(() => expect(screen.getByRole('switch', { name: 'Active: Branch code' })).toHaveAttribute('aria-checked', 'false'));
    expect(client.patch).toHaveBeenCalledWith(`${LIST}/cfd_1`, { active: false }, { ifMatch: '"v3"' });
    expect(screen.getByText('0 of 5 custom fields in use')).toBeInTheDocument();
  });

  it('AC-CR001-04 allows writes through a tenant.* wildcard', async () => {
    setup([branchCode], ['tenant.*']);
    expect(await screen.findByRole('button', { name: '+ Add field' })).toBeInTheDocument();
  });

  it('AC-CR001-04 is a read-only table without write permission', async () => {
    setup([branchCode], ['tenant.read']);
    expect(await screen.findByRole('row', { name: /branch_code/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Add field' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Branch code' })).not.toBeInTheDocument();
  });

  it('AC-CR001-04 shows access denied on 403 and an error with retry on other failures', async () => {
    const client = mockClient({ '/api/v1/me': { permissions: [] }, [LIST]: new ApiError(403, 'forbidden', 'Forbidden') });
    renderAt(<CustomFieldsScreen />, client, '/console/custom-fields');
    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
  });

  it('AC-CR001-04 shows the server error with a retry button on a 500', async () => {
    const client = mockClient({ '/api/v1/me': { permissions: [] }, [LIST]: new ApiError(500, 'internal', 'Boom', 'The registry is unavailable') });
    renderAt(<CustomFieldsScreen />, client, '/console/custom-fields');
    expect(await screen.findByText('The registry is unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
