import { describe, it, expect } from 'vitest';
import { mockClient } from '../../test/render';
import { createBookApi, type ServicingRequest } from './api';

describe('AC-M07-15 book API contracts', () => {
  it('sends mapping, decisions, confirmed referrer and payments to exact routes', async () => {
    const client = mockClient({ '/api/v1/held-policies/p1/payments': {} }); const api = createBookApi(client);
    await api.map('b1', { remarks: 'Remarks', commissionRemarks: 'Remarks#2' });
    await api.decide('b1', 2, 'SKIP'); await api.referrer('b1', 1, { memberId: 'm1' }); await api.pay('p1', '2026-10-01', '2026-10-03');
    expect(client.put.mock.calls).toEqual([
      ['/api/v1/book-imports/b1/mapping', { mapping: { remarks: 'Remarks', commissionRemarks: 'Remarks#2' } }],
      ['/api/v1/book-imports/b1/rows/2/decision', { decision: 'SKIP' }],
      ['/api/v1/book-imports/b1/rows/1/referrer', { memberId: 'm1' }],
    ]);
    expect(client.post).toHaveBeenCalledWith('/api/v1/held-policies/p1/payments', { installmentDue: '2026-10-01', paidOn: '2026-10-03' });
  });
  it('uses optimistic concurrency for servicing and custom fields', async () => {
    const client = mockClient({}); const api = createBookApi(client);
    await api.transition({ id: 'r1', version: 4 } as ServicingRequest, 'RESOLVED'); await api.updatePolicy('p1', { branch_code: 'M11' }, 3);
    expect(client.patch.mock.calls).toEqual([
      ['/api/v1/servicing-requests/r1', { status: 'RESOLVED' }, { ifMatch: '"v4"' }],
      ['/api/v1/held-policies/p1', { customFields: { branch_code: 'M11' } }, { ifMatch: '"v3"' }],
    ]);
  });
});
