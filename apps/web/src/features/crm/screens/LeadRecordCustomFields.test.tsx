import { describe, it, expect, beforeAll } from 'vitest';
import { cleanup, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockClient } from '../../../test/render';
import { LeadRecordScreen } from './LeadRecordScreen';
import type { LeadDetailView } from '../api';
import type { CustomFieldDefinition } from '../../tenancy/api';

const lead = {
  id: 'lead-1',
  name: 'Rajesh Kumar',
  stage: 'NEW',
  temperature: 'HOT',
  slaState: 'pending',
  slaDueAt: '2030-01-01T00:00:00Z',
  consent: 'granted',
  createdAt: '2026-01-01T00:00:00Z',
  qualification: {},
  attribution: { source: 'WEB_FORM', firstTouch: { channel: 'WEB_FORM', at: '2026-01-01T00:00:00Z' }, lastTouch: { channel: 'WEB_FORM', at: '2026-01-01T00:00:00Z' } },
  stageHistory: [],
  stageRules: {},
  possibleMatches: [],
  consentSummary: [],
  activities: [],
  openTasks: [],
  syncState: 'synced',
  version: 4,
  customFields: { budget: 250000 },
} as unknown as LeadDetailView;

const budgetDef: CustomFieldDefinition = {
  id: 'cfd_budget',
  entity: 'lead',
  key: 'budget',
  label: { en: 'Budget' },
  type: 'money',
  required: false,
  piiClass: 'P0',
  reportable: false,
  version: 1,
  active: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function render(items: CustomFieldDefinition[], detail: LeadDetailView = lead, perms: string[] = ['crm.lead.write']) {
  const client = mockClient({
    '/api/v1/me': { permissions: perms },
    '/api/v1/leads/lead-1': detail,
    '/api/v1/tenant/custom-fields': { items, usage: { active: items.length, limit: 5 } },
  });
  renderAt(<LeadRecordScreen />, client, '/crm/leads/lead-1', '/crm/leads/:id');
  return client;
}

describe('AC-CR001-08 lead record custom fields', () => {
  // The first LeadRecordScreen render pays the cold cost of its whole component tree. Pay it once here, outside any
  // test's wait, so the 1 s findBy* defaults measure only the data hop of each test.
  beforeAll(async () => {
    render([], lead, ['crm.lead.read']);
    await screen.findByText('Rajesh Kumar', {}, { timeout: 10000 });
    cleanup();
  });

  it('AC-CR001-08 hides Edit without crm.lead.write', async () => {
    render([budgetDef], lead, ['crm.lead.read']);
    await screen.findByText('Rajesh Kumar');
    expect(await screen.findByText('₹2,500.00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit custom fields' })).not.toBeInTheDocument();
  });

  it('AC-CR001-08 shows the section with values and saves with PUT and If-Match of the lead version', async () => {
    const client = render([budgetDef]);
    client.put.mockResolvedValue({ ...lead, version: 5, customFields: { budget: 100050 } });
    await screen.findByText('Rajesh Kumar');
    expect(await screen.findByText('₹2,500.00')).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith('/api/v1/tenant/custom-fields', { query: { entity: 'lead' } });

    await userEvent.click(screen.getByRole('button', { name: 'Edit custom fields' }));
    const sheet = await screen.findByRole('dialog');
    const budget = within(sheet).getByLabelText('Budget (rupees)');
    await userEvent.clear(budget);
    await userEvent.type(budget, '1000.50');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('₹1,000.50')).toBeInTheDocument());
    expect(client.put).toHaveBeenCalledWith('/api/v1/leads/lead-1/custom-fields', { customFields: { budget: 100050 } }, { ifMatch: '"v4"' });
  });

  it('AC-CR001-08 hides the section when the tenant has no definitions and tolerates payloads without customFields', async () => {
    const old: Partial<LeadDetailView> = { ...lead };
    delete old.customFields;
    render([], old as LeadDetailView);
    expect(await screen.findByText('Rajesh Kumar')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Custom fields' })).not.toBeInTheDocument();
  });
});
