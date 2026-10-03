import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockClient } from '../../../test/render';
import { CustomerRecordScreen } from './CustomerRecordScreen';
import type { CustomFieldDefinition } from '../../tenancy/api';

const party = {
  id: 'cust-1',
  kind: 'PERSON',
  displayName: 'Meera Shah',
  contacts: [],
  preferredLanguage: 'en',
  tags: [],
  source: { kind: 'LEAD' },
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00Z',
  version: 9,
  roles: [],
  consentSummary: [],
  customFields: { region: 'NORTH' },
};

const regionDef: CustomFieldDefinition = {
  id: 'cfd_region',
  entity: 'party',
  key: 'region',
  label: { en: 'Region' },
  type: 'enum',
  enumOptions: [
    { value: 'NORTH', label: { en: 'North zone' } },
    { value: 'WEST', label: { en: 'West zone' } },
  ],
  required: true,
  piiClass: 'P0',
  reportable: false,
  version: 1,
  active: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function render(items: CustomFieldDefinition[], perms: string[] = ['party.write']) {
  const client = mockClient({
    '/api/v1/me': { permissions: perms },
    '/api/v1/parties/cust-1': party,
    '/api/v1/parties/cust-1/contactability': { allowed: true },
    '/api/v1/tenant/custom-fields': { items, usage: { active: items.length, limit: 5 } },
  });
  renderAt(<CustomerRecordScreen />, client, '/crm/customers/cust-1', '/crm/customers/:id');
  return client;
}

describe('AC-CR001-08 customer record custom fields', () => {
  it('AC-CR001-08 hides Edit without party.write', async () => {
    render([regionDef], ['party.read']);
    expect(await screen.findByText('North zone')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit custom fields' })).not.toBeInTheDocument();
  });

  it('AC-CR001-08 shows the section and saves with PUT and If-Match of the party version', async () => {
    const client = render([regionDef]);
    client.put.mockResolvedValue({ ...party, version: 10, customFields: { region: 'WEST' } });
    expect(await screen.findByText('North zone')).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith('/api/v1/tenant/custom-fields', { query: { entity: 'party' } });

    await userEvent.click(screen.getByRole('button', { name: 'Edit custom fields' }));
    const sheet = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(sheet).getByLabelText(/^Region/), 'WEST');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('West zone')).toBeInTheDocument());
    expect(client.put).toHaveBeenCalledWith('/api/v1/parties/cust-1/custom-fields', { customFields: { region: 'WEST' } }, { ifMatch: '"v9"' });
  });

  it('AC-CR001-08 hides the section when the tenant has no party definitions', async () => {
    render([]);
    expect(await screen.findByText('Meera Shah')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Custom fields' })).not.toBeInTheDocument();
  });
});
