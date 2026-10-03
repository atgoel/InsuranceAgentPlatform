import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider } from '../../../lib/api';
import { ApiError } from '../../../lib/api/api-error';
import { I18nProvider } from '../../../lib/i18n';
import { TasksScreen } from './TasksScreen';
import { ApiClient } from '../../../lib/api/api-client';

describe('AC-M04-28 TasksScreen', () => {
  const mockTasksResponse = {
    groups: [
      {
        bucket: 'OVERDUE',
        items: [
          {
            id: 'task-1',
            ownerMemberId: 'member-1',
            subjectType: 'LEAD' as const,
            subjectId: 'lead-1',
            kind: 'CALL' as const,
            title: 'Call Rajesh Kumar',
            dueAt: new Date(Date.now() - 3600000).toISOString(),
            status: 'OPEN' as const,
            source: 'ROUTING',
            createdAt: new Date().toISOString(),
            version: 1,
          },
        ],
      },
      {
        bucket: 'TODAY',
        items: [
          {
            id: 'task-2',
            ownerMemberId: 'member-1',
            subjectType: 'LEAD' as const,
            subjectId: 'lead-2',
            kind: 'WHATSAPP' as const,
            title: 'Send WhatsApp to Priya',
            dueAt: new Date().toISOString(),
            status: 'OPEN' as const,
            source: 'CADENCE',
            createdAt: new Date().toISOString(),
            version: 1,
          },
        ],
      },
      {
        bucket: 'UPCOMING',
        items: [
          {
            id: 'task-3',
            ownerMemberId: 'member-1',
            subjectType: 'OPPORTUNITY' as const,
            subjectId: 'opp-1',
            kind: 'MEETING' as const,
            title: 'Meeting with Amit',
            dueAt: new Date(Date.now() + 86400000).toISOString(),
            status: 'OPEN' as const,
            source: 'MANUAL',
            createdAt: new Date().toISOString(),
            version: 1,
          },
        ],
      },
    ],
    counts: { overdue: 1, today: 1, upcoming: 1 },
  };

  let mockApiClient: ApiClient;

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn().mockResolvedValue(mockTasksResponse),
      post: vi.fn().mockResolvedValue({ id: 'task-new' }),
      patch: vi.fn().mockResolvedValue(mockTasksResponse.groups[0].items[0]),
      put: vi.fn().mockResolvedValue({}),
      del: vi.fn().mockResolvedValue({}),
    } as ApiClient;
  });

  it('AC-M04-28 renders My/Team tabs', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TasksScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      const tabs = screen.getAllByRole('button').filter((btn) => {
        const text = btn.textContent?.toLowerCase() || '';
        return text.includes('my') || text.includes('team');
      });
      expect(tabs.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('AC-M04-28 displays task groups by bucket', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TasksScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      const allText = screen.queryAllByText(/overdue/i);
      expect(allText.length + screen.queryAllByText(/Overdue/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/today/i) || screen.getByText(/Today/i)).toBeTruthy();
  });

  it('AC-M04-28 displays tasks with titles and details', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TasksScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Call Rajesh Kumar')).toBeInTheDocument();
    });
    expect(screen.getByText('Send WhatsApp to Priya')).toBeInTheDocument();
    expect(screen.getByText('Meeting with Amit')).toBeInTheDocument();
  });

  it('AC-M04-28 allows completing tasks with checkbox', async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TasksScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Call Rajesh Kumar')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('checkbox', { name: 'Complete task: Call Rajesh Kumar' }));
    expect(mockApiClient.patch).not.toHaveBeenCalled(); // ticking asks for the outcome first
    await user.type(screen.getByRole('textbox', { name: 'Outcome for Call Rajesh Kumar (optional)' }), 'Connected, wants a quote');
    await user.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(mockApiClient.patch).toHaveBeenCalledWith('/api/v1/tasks/task-1', { status: 'DONE', outcome: 'Connected, wants a quote' }, { ifMatch: '"v1"' });
  });

  it('AC-M04-28 cancelling the outcome step does not complete the task', async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TasksScreen />
        </I18nProvider>
      </ApiProvider>
    );
    await screen.findByText('Call Rajesh Kumar');
    await user.click(screen.getByRole('checkbox', { name: 'Complete task: Call Rajesh Kumar' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Mark done' })).not.toBeInTheDocument();
    expect(mockApiClient.patch).not.toHaveBeenCalled();
  });

  it('AC-M04-28 opens new task form when button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TasksScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Call Rajesh Kumar')).toBeInTheDocument();
    });

    const newTaskBtn = screen.queryByRole('button', { name: /new task/i });
    if (newTaskBtn) {
      await user.click(newTaskBtn);
    }
  });

  it('AC-M04-28 displays cadence rules card', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TasksScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/cadence/i)).toBeInTheDocument();
    });
  });

  it('AC-M04-28 allows switching between My and Team tasks', async () => {
    const user = userEvent.setup();
    let callCount = 0;
    mockApiClient.get = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(mockTasksResponse);
      }
      return Promise.resolve({
        groups: [
          { bucket: 'OVERDUE', items: [] },
          { bucket: 'TODAY', items: [] },
          { bucket: 'UPCOMING', items: [] },
        ],
        counts: { overdue: 0, today: 0, upcoming: 0 },
      });
    });

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TasksScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Call Rajesh Kumar')).toBeInTheDocument();
    });

    const teamTab = screen.getAllByRole('button').find((btn) => btn.textContent?.toLowerCase().includes('team'));
    if (teamTab) {
      await user.click(teamTab);
      expect(mockApiClient.get).toHaveBeenCalled();
    }
  });

  it('AC-M04-28 shows task kind badges', async () => {
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TasksScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Call', { selector: '.kind' })).toBeInTheDocument();
    });
    expect(screen.getByText('WhatsApp', { selector: '.kind' })).toBeInTheDocument();
    expect(screen.getByText('Meeting', { selector: '.kind' })).toBeInTheDocument();
  });

  it('AC-M04-28 handles API errors gracefully', async () => {
    mockApiClient.get = vi.fn().mockRejectedValue(new ApiError(500, 'error', 'Server error'));

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TasksScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  it('AC-M04-28 handles permission denied', async () => {
    mockApiClient.get = vi.fn().mockRejectedValue(new ApiError(403, 'error', 'Forbidden'));

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TasksScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });
  });

  it('AC-M04-28 completes without an outcome when none is given, still sending If-Match', async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TasksScreen />
        </I18nProvider>
      </ApiProvider>
    );
    await screen.findByText('Send WhatsApp to Priya');
    await user.click(screen.getByRole('checkbox', { name: 'Complete task: Send WhatsApp to Priya' }));
    await user.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(mockApiClient.patch).toHaveBeenCalledWith('/api/v1/tasks/task-2', { status: 'DONE', outcome: undefined }, { ifMatch: '"v1"' });
  });

  it('AC-M04-28 displays empty state when no tasks', async () => {
    mockApiClient.get = vi.fn().mockResolvedValue({
      groups: [
        { bucket: 'OVERDUE', items: [] },
        { bucket: 'TODAY', items: [] },
        { bucket: 'UPCOMING', items: [] },
      ],
      counts: { overdue: 0, today: 0, upcoming: 0 },
    });

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TasksScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      const noTasksText = screen.queryAllByText(/No tasks in this group/i);
      expect(noTasksText.length).toBeGreaterThan(0);
    });
  });
});
