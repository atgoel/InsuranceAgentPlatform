import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockClient } from '../../../test/render';
import { ApiError } from '../../../lib/api/api-error';
import { member, role } from '../test-fixtures';
import { UsersRolesScreen } from './UsersRolesScreen';

const MEMBERS = '/api/v1/members';
const ROLES = '/api/v1/roles';
const UNITS = '/api/v1/org-units';

const members = [
  member({ id: 'mem_1', displayName: 'Alice Manager', roles: ['BRANCH_MANAGER'], status: 'active', mfaRequired: true }),
  member({ id: 'mem_2', displayName: 'Bob Seller', roles: ['SALESPERSON'], status: 'active', mfaRequired: false }),
  member({ id: 'mem_3', displayName: 'Carol Gone', roles: ['SALESPERSON'], status: 'suspended', mfaRequired: false }),
  member({ id: 'mem_4', displayName: 'Dev Invitee', roles: ['SALESPERSON'], status: 'invited', mfaRequired: false }),
];

const roles = [
  role({ role: 'BRANCH_MANAGER' }),
  role({ role: 'SALESPERSON', version: 1, etag: 'v1', recordScope: 'OWN', privileged: false, permissions: ['distribution.self.read'] }),
  role({ role: 'TENANT_ADMIN', recordScope: 'TENANT', editable: false }),
];

const tree = { root: { id: 'ou_root', kind: 'HEAD_OFFICE', name: 'Head Office', children: [] } };

/** The value of the KPI tile with this label. */
function kpi(label: string): string | null | undefined {
  const tile = Array.from(document.querySelectorAll('.kpi-tile')).find((t) => t.querySelector('.kpi-tile-label')?.textContent === label);
  return tile?.querySelector('.kpi-tile-value')?.textContent;
}

const ADMIN = ['distribution.member.write', 'distribution.role.write'];

function setup(over: Record<string, unknown> = {}, permissions: string[] = ADMIN) {
  const client = mockClient({
    '/api/v1/me': { userRef: 'u1', tenantId: 't1', roles: [], permissions },
    [MEMBERS]: { items: members },
    [ROLES]: { items: roles },
    [UNITS]: tree,
    '/api/v1/roles/SALESPERSON/preview': { role: 'SALESPERSON', sees: ['Own leads'] },
    ...over,
  });
  renderAt(<UsersRolesScreen />, client, '/console/users-roles');
  return client;
}

describe('AC-M02-16 UsersRolesScreen', () => {
  it('AC-M02-16 shows KPI tiles, filter chips with counts and labelled members (UI-07, BUG-09)', async () => {
    setup();
    expect(await screen.findByRole('row', { name: /Alice Manager/ })).toBeInTheDocument();
    expect(kpi('Active users')).toBe('2');
    expect(kpi('Privileged users with MFA')).toBe('1');
    expect(kpi('Invites pending')).toBe('1');
    expect(kpi('Deactivated')).toBe('1');
    expect(screen.getByRole('button', { name: /^Salesperson ?3$/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('heading', { name: 'Tenant admin' })).toBeInTheDocument();
    expect(screen.queryByText('TENANT_ADMIN')).not.toBeInTheDocument();
    expect(screen.queryByText('suspended')).not.toBeInTheDocument();
  });

  it('AC-M02-16 filters the table by role and by status', async () => {
    setup();
    const user = userEvent.setup({ delay: null });
    await screen.findByRole('row', { name: /Alice Manager/ });
    await user.click(screen.getByRole('button', { name: /^Salesperson ?3$/ }));
    expect(screen.getByRole('button', { name: /^Salesperson ?3$/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('row', { name: /Alice Manager/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Bob Seller/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Deactivated ?1$/ }));
    expect(screen.queryByRole('row', { name: /Bob Seller/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Carol Gone/ })).toBeInTheDocument();
  });

  it('AC-M02-16 deactivates a member after confirming with a reason and shows the new status', async () => {
    const client = setup();
    client.post.mockResolvedValue({ ...members[1], status: 'suspended' });
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Deactivate Bob Seller' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeDisabled();
    await user.click(within(dialog).getByLabelText('Reason'));
    await user.paste('Left the firm');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.post).toHaveBeenCalledExactlyOnceWith(
      '/api/v1/members/mem_2/status-transitions',
      { to: 'suspended', reason: 'Left the firm' },
      { idempotencyKey: expect.any(String) },
    );
    expect(within(screen.getByRole('row', { name: /Bob Seller/ })).getByText('Deactivated')).toBeInTheDocument();
  });

  it('AC-M02-16 keeps the page and the dialog when a deactivation fails and shows the server title inline', async () => {
    const client = setup();
    client.post.mockRejectedValue(new ApiError(422, 'illegal_member_transition', 'This member cannot be deactivated'));
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Deactivate Bob Seller' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Reason'));
    await user.paste('Left the firm');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This member cannot be deactivated');
    expect(screen.getByRole('row', { name: /Alice Manager/ })).toBeInTheDocument();
  });

  it('AC-M02-05 invites a user into the chosen unit and lists them', async () => {
    const client = setup();
    client.post.mockResolvedValue(member({ id: 'mem_9', displayName: 'Nina New', roles: ['SALESPERSON'], status: 'invited' }));
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: '+ Invite user' }));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByLabelText('Name'));
    await user.paste('Nina New');
    await user.click(within(sheet).getByLabelText('Phone'));
    await user.paste('+91-9000-000-000');
    await user.selectOptions(within(sheet).getByLabelText('Unit'), 'ou_root');
    await user.click(within(sheet).getByRole('checkbox', { name: 'Salesperson' }));
    await user.click(within(sheet).getByRole('button', { name: 'Invite' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.post).toHaveBeenCalledExactlyOnceWith(
      MEMBERS,
      { displayName: 'Nina New', phone: '+91-9000-000-000', email: undefined, roles: ['SALESPERSON'], orgUnitId: 'ou_root' },
      { idempotencyKey: expect.any(String) },
    );
    expect(screen.getByRole('row', { name: /Nina New/ })).toBeInTheDocument();
  });

  it('AC-M02-16 edits a role: preview loads, locked-aware save sends the permissions with If-Match', async () => {
    const client = setup();
    client.put.mockResolvedValue({ ...roles[1], version: 2, etag: 'v2', permissions: ['distribution.self.read', 'distribution.member.read'] });
    const user = userEvent.setup({ delay: null });
    const card = (await screen.findByRole('heading', { name: 'Salesperson' })).closest('.role-card') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Edit' }));

    expect(await screen.findByText('What a Salesperson sees')).toBeInTheDocument();
    expect(screen.getByText('Own leads')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'View members' }));
    await user.click(screen.getByRole('button', { name: 'Save as role version 2' }));

    await waitFor(() => expect(screen.queryByText('What a Salesperson sees')).not.toBeInTheDocument());
    expect(client.put).toHaveBeenCalledExactlyOnceWith(
      '/api/v1/roles/SALESPERSON/permissions',
      { permissions: ['distribution.self.read', 'distribution.member.read'] },
      { ifMatch: 'v1' },
    );
  });

  it('AC-M02-11 shows a stale version (412) inline in the editor and keeps it open', async () => {
    const client = setup();
    client.put.mockRejectedValue(new ApiError(412, 'precondition_failed', 'The role changed since you opened it'));
    const user = userEvent.setup({ delay: null });
    const card = (await screen.findByRole('heading', { name: 'Salesperson' })).closest('.role-card') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Edit' }));
    await user.click(await screen.findByRole('button', { name: 'Save as role version 2' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The role changed since you opened it');
    expect(screen.getByRole('button', { name: 'Save as role version 2' })).toBeInTheDocument();
  });

  it('AC-M02-16 is read-only without distribution.member.write and distribution.role.write (OPS, PRINCIPAL_OFFICER)', async () => {
    setup({}, ['distribution.member.read']);
    expect(await screen.findByRole('row', { name: /Alice Manager/ })).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Salesperson' });
    expect(screen.queryByRole('button', { name: /^Deactivate (Alice|Bob)/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Invite user' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('AC-M02-16 shows the permission-denied state when members are forbidden', async () => {
    setup({ [MEMBERS]: new ApiError(403, 'forbidden', 'Forbidden') });
    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('AC-M02-16 keeps members and shows access denied only for the roles section when roles are forbidden (BRANCH_MANAGER)', async () => {
    setup({ [ROLES]: new ApiError(403, 'forbidden', 'Forbidden') });
    expect(await screen.findByRole('row', { name: /Alice Manager/ })).toBeInTheDocument();
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Invite user' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Roles' })).not.toBeInTheDocument();
  });

  it('AC-M02-16 shows an error with a retry when members fail to load', async () => {
    const client = setup({ [MEMBERS]: new ApiError(500, 'server_error', 'Server error') });
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    client.get.mockClear();
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'Try again' }));
    expect(client.get).toHaveBeenCalledWith(MEMBERS, expect.anything());
  });

  it('AC-M02-16 shows the loading state first', () => {
    const client = mockClient({});
    client.get.mockImplementation(() => new Promise(() => undefined));
    renderAt(<UsersRolesScreen />, client, '/console/users-roles');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
