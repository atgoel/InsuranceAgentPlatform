import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockClient } from '../../../test/render';
import { ApiError } from '../../../lib/api/api-error';
import { member, memberDetail } from '../test-fixtures';
import type { ChecklistItem } from '../api';
import { OnboardingHierarchyScreen } from './OnboardingHierarchyScreen';

const UNITS = '/api/v1/org-units';
const MEMBERS = '/api/v1/members';

const tree = {
  root: {
    id: 'ou_root',
    kind: 'HEAD_OFFICE',
    name: 'Head Office',
    memberCount: 4,
    children: [
      { id: 'ou_a', kind: 'BRANCH', name: 'Andheri', memberCount: 3, children: [] },
      { id: 'ou_b', kind: 'BRANCH', name: 'Borivali', memberCount: 1, children: [] },
    ],
  },
};

const members = [
  member({ id: 'mem_1', displayName: 'Invited One', status: 'invited', orgUnitId: 'ou_a', orgUnitName: 'Andheri', salespersonType: 'ISP' }),
  member({ id: 'mem_2', displayName: 'Onboarding One', status: 'onboarding', orgUnitId: 'ou_a', orgUnitName: 'Andheri' }),
  member({ id: 'mem_3', displayName: 'Active One', status: 'active', orgUnitId: 'ou_a', orgUnitName: 'Andheri' }),
  member({ id: 'mem_4', displayName: 'Borivali One', status: 'onboarding', orgUnitId: 'ou_b', orgUnitName: 'Borivali' }),
  member({ id: 'mem_5', displayName: 'Active Two', status: 'active', orgUnitId: 'ou_b', orgUnitName: 'Borivali' }),
];

const incomplete: ChecklistItem[] = [
  { key: 'IDENTITY_PAN', done: true },
  { key: 'TRAINING', done: false, hoursLogged: 5, hoursRequired: 25 },
];
const complete: ChecklistItem[] = incomplete.map((item) => ({ ...item, done: true }));

function setup(over: Record<string, unknown> = {}, permissions: string[] = ['distribution.member.write']) {
  const client = mockClient({
    '/api/v1/me': { userRef: 'u1', tenantId: 't1', roles: [], permissions },
    [UNITS]: tree,
    [MEMBERS]: { items: members },
    '/api/v1/licences/expiring': { items: [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }] },
    '/api/v1/members/mem_2': memberDetail({ id: 'mem_2', displayName: 'Onboarding One', checklist: incomplete }),
    '/api/v1/members/mem_3': memberDetail({ id: 'mem_3', displayName: 'Active One', status: 'active', checklist: complete }),
    ...over,
  });
  renderAt(<OnboardingHierarchyScreen />, client, '/console/onboarding');
  return client;
}

/** The tree panel's button for a unit (candidate cards also mention their unit). */
function unitButton(name: RegExp): HTMLElement {
  const panel = document.querySelector('.hierarchy-tree-panel') as HTMLElement;
  return within(panel).getByRole('button', { name });
}

function kpi(label: string): string | null | undefined {
  const tile = Array.from(document.querySelectorAll('.kpi-tile')).find((t) => t.querySelector('.kpi-tile-label')?.textContent === label);
  return tile?.querySelector('.kpi-tile-value')?.textContent;
}

describe('AC-M02-15 OnboardingHierarchyScreen', () => {
  it('AC-M02-15 shows the two KPI tiles, the hierarchy with counts and the pipeline columns', async () => {
    setup();
    expect(await screen.findByText('Invited One')).toBeInTheDocument();
    expect(kpi('In onboarding')).toBe('3');
    expect(kpi('Licences expiring in 60 days')).toBe('3');
    expect(unitButton(/Andheri/)).toBeInTheDocument();
    expect(screen.getByTitle('3 members')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'In onboarding' })).getByText('Onboarding One')).toBeInTheDocument();
    expect(screen.getByText('Select a salesperson to see their onboarding checklist')).toBeInTheDocument();
    expect(screen.queryByText('invited')).not.toBeInTheDocument();
  });

  it('AC-M02-15 narrows the pipeline to the selected unit and its sub-units', async () => {
    setup();
    const user = userEvent.setup({ delay: null });
    await screen.findByText('Invited One');
    await user.click(unitButton(/Borivali/));
    expect(screen.getByText('Borivali One')).toBeInTheDocument();
    expect(screen.queryByText('Invited One')).not.toBeInTheDocument();
    await user.click(unitButton(/Head Office/));
    expect(screen.getByText('Invited One')).toBeInTheDocument();
  });

  it('AC-M02-15 selecting a candidate shows its checklist with Activate disabled while incomplete', async () => {
    const client = setup();
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: /Onboarding One/ }));
    expect(await screen.findByRole('checkbox', { name: 'Identity (PAN)' })).toBeChecked();
    expect(screen.getByText('5/25 hours')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activate · checklist incomplete' })).toBeDisabled();
    expect(client.get).toHaveBeenCalledWith('/api/v1/members/mem_2');
  });

  it('AC-M02-04 activates a complete candidate with an idempotency key and shows the new status', async () => {
    const client = setup({ '/api/v1/members/mem_2': memberDetail({ id: 'mem_2', displayName: 'Onboarding One', checklist: complete }) });
    client.post.mockImplementation(async () => {
      client.get.mockImplementation(async (path: string) =>
        path === '/api/v1/members/mem_2' ? memberDetail({ id: 'mem_2', displayName: 'Onboarding One', status: 'active', checklist: complete }) : { items: members },
      );
      return member({ id: 'mem_2', status: 'active' });
    });
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: /Onboarding One/ }));
    await user.click(await screen.findByRole('button', { name: 'Activate Onboarding One' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Activate Onboarding One' })).not.toBeInTheDocument());
    expect(client.post).toHaveBeenCalledExactlyOnceWith('/api/v1/members/mem_2/activation', {}, { idempotencyKey: expect.any(String) });
  });

  it('AC-M02-04 shows the missing items by label when the server refuses activation (422)', async () => {
    const refusal = Object.assign(new ApiError(422, 'onboarding_incomplete', 'Onboarding incomplete'), { missing: ['TRAINING', 'EXAM'] });
    const client = setup({ '/api/v1/members/mem_2': memberDetail({ id: 'mem_2', displayName: 'Onboarding One', checklist: complete }) });
    client.post.mockRejectedValue(refusal);
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: /Onboarding One/ }));
    await user.click(await screen.findByRole('button', { name: 'Activate Onboarding One' }));

    expect(await screen.findByText('Missing required onboarding items')).toBeInTheDocument();
    const items = Array.from(document.querySelectorAll('.missing-items li')).map((li) => li.textContent);
    expect(items).toEqual(['Training', 'Exam']);
    expect(screen.getByRole('button', { name: /Invited One/ })).toBeInTheDocument();
  });

  it('AC-M02-07 exits an active member with the chosen transfer target', async () => {
    const client = setup();
    client.post.mockResolvedValue(member({ id: 'mem_3', status: 'exited' }));
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: /Active One/ }));
    await user.selectOptions(await screen.findByLabelText('Transfer customers to'), 'mem_5');
    await user.click(screen.getByLabelText('Reason'));
    await user.paste('Moved to another firm');
    await user.click(screen.getByRole('button', { name: 'Confirm exit' }));

    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/members/mem_3/exit',
      { transferToMemberId: 'mem_5', reason: 'Moved to another firm' },
      { idempotencyKey: expect.any(String) },
    );
  });

  it('AC-M02-07 hides the exit panel without distribution.member.write', async () => {
    setup({}, ['distribution.member.read']);
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: /Active One/ }));
    await screen.findByRole('checkbox', { name: 'Identity (PAN)' });
    expect(screen.queryByRole('button', { name: 'Confirm exit' })).not.toBeInTheDocument();
  });

  it('AC-M02-15 keeps the page and shows the title inline when a candidate cannot be loaded', async () => {
    setup({ '/api/v1/members/mem_2': new ApiError(404, 'not_found', 'Member not found') });
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: /Onboarding One/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Member not found');
    expect(screen.getByRole('button', { name: /Invited One/ })).toBeInTheDocument();
  });

  it('AC-M02-05 invites a salesperson into a unit of the tree', async () => {
    const client = setup();
    client.post.mockResolvedValue(member({ id: 'mem_9', displayName: 'Nina New', status: 'invited' }));
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: '+ Invite salesperson' }));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByLabelText('Name'));
    await user.paste('Nina New');
    await user.click(within(sheet).getByLabelText('Email'));
    await user.paste('nina@example.com');
    await user.selectOptions(within(sheet).getByLabelText('Unit'), 'ou_b');
    await user.click(within(sheet).getByRole('checkbox', { name: 'Salesperson' }));
    await user.click(within(sheet).getByRole('button', { name: 'Invite' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.post).toHaveBeenCalledExactlyOnceWith(
      MEMBERS,
      { displayName: 'Nina New', phone: undefined, email: 'nina@example.com', roles: ['SALESPERSON'], orgUnitId: 'ou_b' },
      { idempotencyKey: expect.any(String) },
    );
  });

  it('AC-M02-15 shows a dash for the licence tile when that request fails, without failing the page', async () => {
    setup({ '/api/v1/licences/expiring': new ApiError(500, 'server_error', 'Server error') });
    await screen.findByText('Invited One');
    await waitFor(() => expect(kpi('Licences expiring in 60 days')).toBe('—'));
  });

  it('AC-M02-15 shows the permission-denied state when the hierarchy is forbidden', async () => {
    setup({ [UNITS]: new ApiError(403, 'forbidden', 'Forbidden') });
    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
  });

  it('AC-M02-15 shows an error with retry when the hierarchy fails to load', async () => {
    setup({ [UNITS]: new ApiError(500, 'server_error', 'Server error') });
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
