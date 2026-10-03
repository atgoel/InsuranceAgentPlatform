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
      get: vi.fn(() => Promise.resolve(mockTasksResponse)),
      post: vi.fn(() => Promise.resolve({ id: 'task-new' })),
      patch: vi.fn(() => Promise.resolve(mockTasksResponse.groups[0].items[0])),
      put: vi.fn(),
      del: vi.fn(),
    };
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
      const tabs = screen.getAllByRole('button').filter((btn) => btn.textContent?.toLowerCase().includes('my') || btn.textContent?.toLowerCase().includes('team'));
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
      expect(screen.getByText(/overdue/i) || screen.getByText(/OVERDUE/)).toBeInTheDocument();
      expect(screen.getByText(/today/i) || screen.getByText(/TODAY/)).toBeInTheDocument();
      expect(screen.getByText(/upcoming/i) || screen.getByText(/UPCOMING/)).toBeInTheDocument();
    });
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
      expect(screen.getByText('Send WhatsApp to Priya')).toBeInTheDocument();
      expect(screen.getByText('Meeting with Amit')).toBeInTheDocument();
    });
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

    const checkboxes = screen.getAllByRole('checkbox');
    if (checkboxes.length > 0) {
      await user.click(checkboxes[0]);
      expect(mockApiClient.patch).toHaveBeenCalled();
    }
  });

  it('AC-M04-28 opens new task form when "+" is clicked', async () => {
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

    const newTaskBtn = screen.getByRole('button', { name: /new task/i });
    await user.click(newTaskBtn);

    await waitFor(() => {
      expect(screen.getByText(/new task/i, { selector: 'h2' })).toBeInTheDocument();
    });
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
    mockApiClient.get = vi.fn((path) => {
      if (path === '/api/v1/tasks') {
        return Promise.resolve({
          groups: [
            {
              bucket: 'OVERDUE',
              items: [],
            },
          ],
          counts: { overdue: 0, today: 0, upcoming: 0 },
        });
      }
      return Promise.resolve(mockTasksResponse);
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
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/v1/tasks', expect.anything());
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
      expect(screen.getByText('CALL')).toBeInTheDocument();
      expect(screen.getByText('WHATSAPP')).toBeInTheDocument();
      expect(screen.getByText('MEETING')).toBeInTheDocument();
    });
  });

  it('AC-M04-28 handles API errors gracefully', async () => {
    mockApiClient.get = vi.fn(() => Promise.reject(new ApiError('Server error', 500)));

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TasksScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/error/i) || screen.getByText(/went wrong/i)).toBeInTheDocument();
    });
  });

  it('AC-M04-28 handles permission denied', async () => {
    mockApiClient.get = vi.fn(() => Promise.reject(new ApiError('Forbidden', 403)));

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TasksScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/denied/i) || screen.getByText(/not authorized/i)).toBeInTheDocument();
    });
  });

  it('AC-M04-28 sends If-Match header when completing task', async () => {
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

    const checkboxes = screen.getAllByRole('checkbox');
    if (checkboxes.length > 0) {
      await user.click(checkboxes[0]);
      expect(mockApiClient.patch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/tasks'), expect.anything(), expect.objectContaining({ headers: { 'If-Match': expect.any(String) } }));
    }
  });

  it('AC-M04-28 displays empty state when no tasks', async () => {
    mockApiClient.get = vi.fn(() =>
      Promise.resolve({
        groups: [
          { bucket: 'OVERDUE', items: [] },
          { bucket: 'TODAY', items: [] },
          { bucket: 'UPCOMING', items: [] },
        ],
        counts: { overdue: 0, today: 0, upcoming: 0 },
      })
    );

    render(
      <ApiProvider client={mockApiClient}>
        <I18nProvider>
          <TasksScreen />
        </I18nProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/no tasks/i) || screen.getByText(/empty/i)).toBeInTheDocument();
    });
  });
});
