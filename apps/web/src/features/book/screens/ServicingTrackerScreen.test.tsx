import { describe, it, expect } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { mockClient, renderAt } from '../../../test/render';
import { ServicingTrackerScreen } from './ServicingTrackerScreen';

const claim = { id: 'r1', heldPolicyId: 'hp1', kind: 'CLAIM', status: 'OPEN', followUpOn: '2026-10-06', notes: [], version: 2 };

function open() {
  const client = mockClient({
    '/api/v1/me': { permissions: [] },
    '/api/v1/servicing-requests': (opts: unknown) => {
      const before = (opts as { query?: { followUpBefore?: string } }).query?.followUpBefore;
      return { items: !before || claim.followUpOn <= before ? [claim] : [] };
    },
  });
  renderAt(<ServicingTrackerScreen />, client, '/m/servicing');
  return client;
}

describe('AC-M07-15 servicing tracker', () => {
  it('BUG-12 lists every open request on first load, without a follow-up date filter', async () => {
    const client = open();
    expect(await screen.findByText('Claim')).toBeInTheDocument();
    const calls = client.get.mock.calls.filter(([path]) => path === '/api/v1/servicing-requests');
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0][1])).toBe('{"query":{}}');
    expect(screen.getByText(/6 Oct 2026/)).toBeInTheDocument();
    expect(screen.queryByText('No open follow-ups.')).not.toBeInTheDocument();
  });
  it('narrows by follow-up date on request and restores the full list', async () => {
    const client = open();
    fireEvent.change(await screen.findByLabelText('Follow-ups through'), { target: { value: '2026-10-05' } });
    expect(await screen.findByText('No open follow-ups.')).toBeInTheDocument();
    expect(client.get).toHaveBeenLastCalledWith('/api/v1/servicing-requests', { query: { followUpBefore: '2026-10-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show all follow-ups' }));
    expect(await screen.findByText('Claim')).toBeInTheDocument();
  });
});
