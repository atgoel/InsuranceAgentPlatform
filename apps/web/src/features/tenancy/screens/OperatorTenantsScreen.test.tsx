import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockClient } from '../../../test/render';
import { ApiError } from '../../../lib/api/api-error';
import { OperatorTenantsScreen } from './OperatorTenantsScreen';
import type { Plan, TenantSummary } from '../api';

const TENANTS = '/api/v1/ops/tenants';
const PLANS = '/api/v1/ops/plans';

const tenant = (over: Partial<TenantSummary>): TenantSummary => ({
  id: 't1',
  slug: 'acme',
  displayName: 'Acme IMF',
  kind: 'ORGANISATION',
  status: 'active',
  planCode: 'TEAM',
  cell: 'cell-1',
  createdAt: '2026-10-04T08:00:00Z',
  ...over,
});

const plan = (over: Partial<Plan>): Plan => ({
  code: 'TEAM',
  name: 'Team',
  kind: 'ORGANISATION',
  stage: 'L',
  capabilities: [],
  limits: { seats: 25, customers: null, ai_credits: null, messages: null, customFields: 5 },
  alertThresholdPct: 90,
  canHidePoweredBy: false,
  ...over,
});

const tenants = [
  tenant({}),
  tenant({ id: 't2', displayName: 'Beta Brokers', status: 'suspended', planCode: 'BUSINESS' }),
  tenant({ id: 't3', displayName: 'Half Way', status: 'provisioning' }),
  tenant({ id: 't4', displayName: 'Solo Sam', kind: 'SOLO', planCode: 'SOLO' }),
];
const plans = [plan({}), plan({ code: 'BUSINESS', name: 'Business', limits: { seats: null, customers: null, ai_credits: null, messages: null, customFields: 20 } })];

function setup(over: Record<string, unknown> = {}) {
  const client = mockClient({ [TENANTS]: { items: tenants }, [PLANS]: { items: plans }, ...over });
  renderAt(<OperatorTenantsScreen />, client, '/console/ops/tenants');
  return client;
}

function kpi(label: string): string | null | undefined {
  const tile = Array.from(document.querySelectorAll('.kpi-tile')).find((t) => t.querySelector('.kpi-tile-label')?.textContent === label);
  return tile?.querySelector('.kpi-tile-value')?.textContent;
}

describe('AC-M01-18 OperatorTenantsScreen KPI tiles', () => {
  it('AC-M01-18 shows exact counts when the list has no next page', async () => {
    setup();
    await screen.findByRole('row', { name: /Beta Brokers/ });
    expect(kpi('Organisation tenants')).toBe('3');
    expect(kpi('Solo agents')).toBe('1');
  });

  it('AC-M01-18 shows a plus sign on both tiles when the list response has a nextCursor', async () => {
    setup({ [TENANTS]: { items: tenants, nextCursor: 'page-2' } });
    await screen.findByRole('row', { name: /Beta Brokers/ });
    expect(kpi('Organisation tenants')).toBe('3+');
    expect(kpi('Solo agents')).toBe('1+');
  });
});

describe('AC-M01-18 OperatorTenantsScreen', () => {
  it('AC-M01-18 lists tenants with labelled type, plan name, status chip and formatted creation date (BUG-09, BUG-16)', async () => {
    setup();
    const row = await screen.findByRole('row', { name: /Beta Brokers/ });
    expect(within(row).getByText('Organisation')).toBeInTheDocument();
    expect(within(row).getByText('Business')).toBeInTheDocument();
    expect(within(row).getByText('Suspended')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Acme IMF/ })).getByText('4 Oct 2026')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Solo Sam/ })).getByText('Solo agent')).toBeInTheDocument();
    expect(screen.queryByText('ORGANISATION')).not.toBeInTheDocument();
    expect(screen.queryByText('suspended')).not.toBeInTheDocument();
  });

  it('AC-M01-18 shows KPI tiles for organisation and solo tenants and a card per plan', async () => {
    setup();
    await screen.findByRole('row', { name: /Acme IMF/ });
    expect(kpi('Organisation tenants')).toBe('3');
    expect(kpi('Solo agents')).toBe('1');
    expect(screen.getByRole('heading', { name: 'Team' })).toBeInTheDocument();
    expect(screen.getByText('25 seats')).toBeInTheDocument();
    expect(screen.getByText('Unlimited seats')).toBeInTheDocument();
  });

  it('AC-M01-18 suspends a tenant after a reason and sends it with an idempotency key', async () => {
    const client = setup();
    client.post.mockResolvedValue(tenant({ status: 'suspended' }));
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Suspend Acme IMF' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('button', { name: 'Confirm' })).toBeDisabled();
    await user.click(within(sheet).getByLabelText('Reason'));
    await user.paste('Non-payment');
    await user.click(within(sheet).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.post).toHaveBeenCalledExactlyOnceWith(
      `${TENANTS}/t1/status-transitions`,
      { to: 'suspended', reason: 'Non-payment' },
      { idempotencyKey: expect.any(String) },
    );
  });

  it('AC-M01-18 resumes a suspended tenant', async () => {
    const client = setup();
    client.post.mockResolvedValue(tenant({ id: 't2' }));
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Resume Beta Brokers' }));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByLabelText('Reason'));
    await user.paste('Paid up');
    await user.click(within(sheet).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
    expect(client.post).toHaveBeenCalledWith(`${TENANTS}/t2/status-transitions`, { to: 'active', reason: 'Paid up' }, { idempotencyKey: expect.any(String) });
  });

  it('AC-M01-18 shows a refused status change inline in the sheet and keeps the table', async () => {
    const client = setup();
    client.post.mockRejectedValue(new ApiError(422, 'illegal_tenant_transition', 'This tenant cannot be suspended'));
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Suspend Acme IMF' }));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByLabelText('Reason'));
    await user.paste('Non-payment');
    await user.click(within(sheet).getByRole('button', { name: 'Confirm' }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('This tenant cannot be suspended');
    expect(screen.getByRole('row', { name: /Acme IMF/ })).toBeInTheDocument();
  });

  it('AC-M01-18 provisions a tenant with an idempotency key and shows the new host', async () => {
    const client = setup();
    client.post.mockResolvedValue({ tenantId: 't9', status: 'active', host: 'newco.example.test' });
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: '+ Provision tenant' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('button', { name: 'Create tenant' })).toBeDisabled();
    const fill = async (label: string, value: string) => {
      await user.click(within(sheet).getByLabelText(label));
      await user.paste(value);
    };
    await fill('Legal Name', 'NewCo Marketing');
    await user.selectOptions(within(sheet).getByLabelText('Entity Type'), 'BROKER');
    await user.selectOptions(within(sheet).getByLabelText('Plan'), 'BUSINESS');
    await fill('Tenant Slug', 'newco');
    await fill('Registration No.', 'REG-77');
    await fill('Valid Until', '2028-03-31');
    await fill('Admin Name', 'Nita Admin');
    await fill('Admin email', 'nita@newco.example.test');
    await user.click(within(sheet).getByRole('button', { name: 'Create tenant' }));

    expect(await screen.findByText('Tenant created at newco.example.test')).toBeInTheDocument();
    expect(client.post).toHaveBeenCalledExactlyOnceWith(
      TENANTS,
      {
        slug: 'newco',
        displayName: 'NewCo Marketing',
        kind: 'ORGANISATION',
        planCode: 'BUSINESS',
        entity: { entityType: 'BROKER', legalName: 'NewCo Marketing', registrationNo: 'REG-77', registrationValidTo: '2028-03-31' },
        admin: { name: 'Nita Admin', email: 'nita@newco.example.test' },
      },
      { idempotencyKey: expect.any(String) },
    );
  });

  it('AC-M01-18 shows the failed step when provisioning is incomplete and offers to resume it', async () => {
    const client = setup();
    client.post.mockResolvedValue({ tenantId: 't3', status: 'provisioning', host: 'half.example.test', failedStep: 'keycloak_realm' });
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Resume provisioning for Half Way' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Provisioning stopped at step keycloak_realm');
    expect(client.post).toHaveBeenCalledExactlyOnceWith(`${TENANTS}/t3/provisioning-resumptions`, {}, { idempotencyKey: expect.any(String) });
  });

  it('AC-M01-18 shows a refused provisioning inline in the sheet', async () => {
    const client = setup();
    client.post.mockRejectedValue(new ApiError(409, 'slug_taken', 'That slug is already taken'));
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: '+ Provision tenant' }));
    const sheet = await screen.findByRole('dialog');
    const fill = async (label: string, value: string) => {
      await user.click(within(sheet).getByLabelText(label));
      await user.paste(value);
    };
    await fill('Legal Name', 'NewCo');
    await fill('Tenant Slug', 'acme');
    await fill('Registration No.', 'R1');
    await fill('Valid Until', '2028-03-31');
    await fill('Admin Name', 'Nita');
    await user.click(within(sheet).getByRole('button', { name: 'Create tenant' }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('That slug is already taken');
    expect(within(sheet).getByLabelText('Legal Name')).toHaveValue('NewCo');
  });

  it('AC-M01-18 shows an empty state when there are no tenants', async () => {
    setup({ [TENANTS]: { items: [] } });
    expect(await screen.findByText('No tenants yet')).toBeInTheDocument();
  });

  it('AC-M01-12 shows the permission-denied state for a non-operator (403)', async () => {
    setup({ [TENANTS]: new ApiError(403, 'forbidden', 'Forbidden') });
    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
  });

  it('AC-M01-18 shows an error state on a server failure', async () => {
    setup({ [PLANS]: new ApiError(500, 'server_error', 'Server error') });
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  });

  it('AC-M01-18 shows the loading state first', () => {
    const client = mockClient({});
    client.get.mockImplementation(() => new Promise(() => undefined));
    renderAt(<OperatorTenantsScreen />, client, '/console/ops/tenants');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
