import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import type { TaskView } from '../api';
import { MyTasksScreen } from './MyTasksScreen';
import { mockClient, renderAt } from '../../../test/render';

const task = (over: Partial<TaskView>): TaskView => ({
  id: 'tsk', ownerMemberId: 'mem_1', subjectType: 'LEAD', subjectId: 'lead_1', kind: 'CALL', title: 'Task', dueAt: '2026-10-03T10:00:00.000Z',
  status: 'OPEN', source: 'CADENCE', createdAt: '2026-10-01T10:00:00.000Z', version: 3, ...over,
});
const GROUPS = [
  { bucket: 'OVERDUE', items: [task({ id: 'tsk_1', title: 'Call Asha back', version: 3 })] },
  { bucket: 'TODAY', items: [task({ id: 'tsk_2', title: 'Send brochure', kind: 'WHATSAPP' })] },
  { bucket: 'UPCOMING', items: [] },
];
const PATH = '/api/v1/tasks';
const queryOf = (call: unknown[]) => (call[1] as { query: Record<string, unknown> }).query;

describe('AC-M04-28 MyTasksScreen (/m/tasks)', () => {
  it('AC-M04-28 shows my open tasks grouped Overdue / Today / Upcoming', async () => {
    const client = mockClient({ [PATH]: { groups: GROUPS, counts: { overdue: 1, today: 1, upcoming: 0 } } });
    renderAt(<MyTasksScreen />, client, '/m/tasks');
    expect(within(await screen.findByRole('region', { name: 'Overdue' })).getByText('Call Asha back')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Today' })).getByText('Send brochure')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Upcoming' })).getByText('No tasks in this group')).toBeInTheDocument();
    expect(queryOf(client.get.mock.calls[0] ?? [])).toMatchObject({ mine: true, kind: undefined });
  });

  it('AC-M04-28 a type chip re-queries with that kind', async () => {
    const client = mockClient({ [PATH]: { groups: GROUPS, counts: { overdue: 1, today: 1, upcoming: 0 } } });
    renderAt(<MyTasksScreen />, client, '/m/tasks');
    await screen.findByText('Call Asha back');
    await userEvent.click(screen.getByRole('button', { name: 'WhatsApp' }));
    expect(screen.getByRole('button', { name: 'WhatsApp' })).toHaveAttribute('aria-pressed', 'true');
    expect(client.get.mock.calls.map((c) => queryOf(c).kind)).toEqual([undefined, 'WHATSAPP']);
  });

  it('AC-M04-28 tick → outcome → done sends the PATCH with If-Match and reloads', async () => {
    const client = mockClient({ [PATH]: { groups: GROUPS, counts: { overdue: 1, today: 1, upcoming: 0 } } });
    client.patch.mockResolvedValue(task({ id: 'tsk_1', status: 'DONE', version: 4 }));
    renderAt(<MyTasksScreen />, client, '/m/tasks');
    await screen.findByText('Call Asha back');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Complete task: Call Asha back' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Outcome for Call Asha back (optional)' }), 'No answer, retry tomorrow');
    await userEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(client.patch).toHaveBeenCalledWith('/api/v1/tasks/tsk_1', { status: 'DONE', outcome: 'No answer, retry tomorrow' }, { ifMatch: '"v3"' });
    await screen.findByText('Call Asha back');
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it('AC-M04-28 a stale version (412) is shown inline with the server title; the list stays on screen', async () => {
    const client = mockClient({ [PATH]: { groups: GROUPS, counts: { overdue: 1, today: 1, upcoming: 0 } } });
    client.patch.mockRejectedValue(new ApiError(412, 'precondition_failed', 'Changed elsewhere'));
    renderAt(<MyTasksScreen />, client, '/m/tasks');
    await screen.findByText('Call Asha back');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Complete task: Call Asha back' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The task could not be completed: Changed elsewhere');
    expect(screen.getByText('Call Asha back')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All types' })).toBeInTheDocument();
  });

  it('AC-M04-28 groups show their counts and each task its type label and IST due date and time', async () => {
    renderAt(<MyTasksScreen />, mockClient({ [PATH]: { groups: GROUPS, counts: { overdue: 1, today: 1, upcoming: 0 } } }), '/m/tasks');
    expect(await screen.findByRole('heading', { level: 2, name: 'Overdue · 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Upcoming · 0' })).toBeInTheDocument();
    const row = screen.getByText('Call Asha back').closest('li') as HTMLElement;
    expect(within(row).getByText('Call')).toBeInTheDocument();
    expect(within(row).getByText('3 Oct 2026, 3:30 pm')).toBeInTheDocument();
  });

  it('AC-M04-28 403 shows the permission state', async () => {
    renderAt(<MyTasksScreen />, mockClient({ [PATH]: new ApiError(403, 'forbidden', 'No') }), '/m/tasks');
    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
  });
});
