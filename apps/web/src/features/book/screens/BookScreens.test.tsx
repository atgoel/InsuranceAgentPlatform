import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor, render } from '@testing-library/react';
import { ApiProvider } from '../../../lib/api';
import { I18nProvider } from '../../../lib/i18n';
import { mockClient, renderAt } from '../../../test/render';
import { ApiError } from '../../../lib/api/api-error';
import { DueCalendarScreen } from './DueCalendarScreen';
import { HeldPoliciesPanel } from '../HeldPoliciesPanel';
import { ServicingTrackerScreen } from './ServicingTrackerScreen';
import { HeldPolicyDetail } from '../HeldPolicyDetail';
import { NewServicingForm, ServicingCard } from '../ServicingCard';

describe('AC-M07-15 book screens', () => {
  it('marks the selected installment paid with exact body and keeps date controls', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const client = mockClient({
      '/api/v1/me': { permissions: ['book.write'] },
      '/api/v1/dues': {
        days: [
          {
            date: today,
            dues: [
              {
                policyId: 'hp1',
                holderName: 'Asha',
                productName: 'Life cover',
                dueDate: today,
                amountPaise: 100000,
                status: 'DUE_TODAY',
                line: 'LIFE',
                source: 'IMPORT',
                asOf: today,
                confidence: 'MEDIUM',
              },
            ],
          },
        ],
      },
      '/api/v1/held-policies/hp1/payments': {},
    });
    renderAt(<DueCalendarScreen />, client, '/m/dues');
    fireEvent.click(await screen.findByRole('button', { name: 'Mark paid' }));
    fireEvent.change(screen.getByLabelText('Paid on'), { target: { value: '2026-10-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith('/api/v1/held-policies/hp1/payments', { installmentDue: today, paidOn: '2026-10-02' }),
    );
    expect(screen.getByLabelText('Month')).toBeInTheDocument();
  });
  it('loads scoped policies and shows source, confidence and as-of for each policy', async () => {
    const client = mockClient({
      '/api/v1/held-policies': {
        items: [
          {
            id: 'hp1',
            holderName: 'Asha',
            productName: 'Health cover',
            policyNumber: 'XXXX1234',
            insurerName: 'Star',
            source: 'IMPORT',
            asOf: '2026-07-02',
            confidence: 'MEDIUM',
            premiumPaise: 100000,
            status: 'IN_FORCE',
          },
        ],
      },
    });
    renderAt(<HeldPoliciesPanel partyId="party1" />, client, '/crm/customers/party1');
    expect(await screen.findByText('Health cover')).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith('/api/v1/held-policies', { query: { partyId: 'party1' } });
    expect(screen.getByText(/Imported · As of 2026-07-02 · Confidence Medium/)).toBeInTheDocument();
    expect(screen.getByText(/XXXX1234/)).toBeInTheDocument();
  });
  it('reports read errors with a trace reference', async () => {
    const client = mockClient({
      '/api/v1/servicing-requests': ApiError.fromProblem(500, { title: 'Service unavailable', traceId: 'trace-book' }),
    });
    renderAt(<ServicingTrackerScreen />, client, '/m/servicing');
    expect(await screen.findByText('Service unavailable')).toBeInTheDocument();
    expect(screen.getByText('Reference trace-book')).toBeInTheDocument();
  });
  it('shows a scoped permission state and reference without replacing filters', async () => {
    const client = mockClient({ '/api/v1/dues': ApiError.fromProblem(403, { title: 'Denied', traceId: 'trace-denied' }) });
    renderAt(<DueCalendarScreen />, client, '/m/dues');
    expect(await screen.findByText('You do not have permission for this action.')).toBeInTheDocument();
    expect(screen.getByText('Reference trace-denied')).toBeInTheDocument();
    expect(screen.getByLabelText('Insurance line')).toBeInTheDocument();
  });
  it('shows masked motor registration, commercials, schedule and provenance in detail', async () => {
    const client = mockClient({
      '/api/v1/held-policies/hp1': {
        id: 'hp1',
        productName: 'Motor cover',
        policyNumber: 'XXXX1234',
        insurerName: 'Insurer',
        source: 'MANUAL',
        asOf: '2026-10-01',
        confidence: 'HIGH',
        commercials: {
          bookedOn: '2026-10-01',
          premiumNetPaise: 100000,
          premiumTaxPaise: 18000,
          premiumGrossPaise: 118000,
          businessType: 'FRESH',
          referredBy: { name: 'Saurabh' },
        },
        registrationNoLast4: '4567',
        risk: { schemaId: 'motor', schemaVersion: 1, details: { make: 'Tata', model: 'Nexon', ncbPercent: 20, odPremiumPaise: 50000 } },
        schedule: [{ dueDate: '2027-10-01', amountPaise: 118000 }],
        due: { status: 'UPCOMING' },
        servicingRequests: [],
        customFields: {},
        version: 1,
      },
    });
    renderAt(<HeldPolicyDetail id="hp1" onClose={() => undefined} />, client, '/crm/customers/party1');
    expect(await screen.findByText('Motor cover')).toBeInTheDocument();
    expect(screen.getByText('Registration number XXXX4567')).toBeInTheDocument();
    expect(screen.getByText('Nexon')).toBeInTheDocument();
    expect(screen.getByText('Saurabh')).toBeInTheDocument();
    expect(screen.getByText(/2027-10-01/)).toBeInTheDocument();
    expect(screen.queryByText('FRESH')).not.toBeInTheDocument();
    expect(screen.getByText(/Manually recorded · As of 2026-10-01 · Confidence High/)).toBeInTheDocument();
  });
  it('keeps servicing notes on failure and submits status with version', async () => {
    const request = { id: 'r1', heldPolicyId: 'hp1', kind: 'CLAIM', status: 'OPEN', followUpOn: '2026-10-01', notes: [], version: 2 };
    const client = mockClient({
      '/api/v1/me': { permissions: ['book.servicing'] },
      '/api/v1/servicing-requests': { items: [request] },
      '/api/v1/servicing-requests/r1/notes': ApiError.fromProblem(400, { title: 'Sensitive content blocked', traceId: 'note-trace' }),
    });
    client.patch.mockResolvedValue({ ...request, status: 'SUBMITTED_TO_INSURER', version: 3 });
    renderAt(<ServicingTrackerScreen />, client, '/m/servicing');
    fireEvent.click(await screen.findByRole('button', { name: 'Submitted to insurer' }));
    await waitFor(() =>
      expect(client.patch).toHaveBeenCalledWith('/api/v1/servicing-requests/r1', { status: 'SUBMITTED_TO_INSURER' }, { ifMatch: '"v2"' }),
    );
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Unsafe customer data' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(await screen.findByText('Sensitive content blocked')).toBeInTheDocument();
    expect(screen.getByLabelText('Note')).toHaveValue('Unsafe customer data');
    expect(client.post).toHaveBeenCalledWith('/api/v1/servicing-requests/r1/notes', { text: 'Unsafe customer data' });
  });
  it('hides servicing writes and payment writes from read-only users', async () => {
    const client = mockClient({
      '/api/v1/me': { permissions: ['book.read'] },
      '/api/v1/servicing-requests': { items: [{ id: 'r1', heldPolicyId: 'hp1', kind: 'CLAIM', status: 'OPEN', notes: [], version: 1 }] },
    });
    renderAt(<ServicingTrackerScreen />, client, '/m/servicing');
    expect(await screen.findByText('Claim')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submitted to insurer' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Note')).not.toBeInTheDocument();
  });
  it('removes a prior policy when a changed detail target is denied', async () => {
    const client = mockClient({
      '/api/v1/held-policies/hp1': {
        id: 'hp1',
        productName: 'Previous private policy',
        policyNumber: 'XXXX1234',
        source: 'MANUAL',
        asOf: '2026-10-03',
        confidence: 'HIGH',
        commercials: {},
        customFields: {},
        version: 1,
        schedule: [],
        due: { status: 'PAID' },
        servicingRequests: [],
      },
      '/api/v1/held-policies/hp2': ApiError.fromProblem(403, { title: 'Denied' }),
    });
    const detail = (id: string) => (
      <ApiProvider client={client}>
        <I18nProvider>
          <HeldPolicyDetail id={id} onClose={() => undefined} />
        </I18nProvider>
      </ApiProvider>
    );
    const rendered = render(detail('hp1'));
    expect(await screen.findByText('Previous private policy')).toBeInTheDocument();
    rendered.rerender(detail('hp2'));
    expect(await screen.findByText('You do not have permission for this action.')).toBeInTheDocument();
    expect(screen.queryByText('Previous private policy')).not.toBeInTheDocument();
  });
  it('creates servicing with follow-up and insurer portal after a recoverable error', async () => {
    const created = { id: 'r2', heldPolicyId: 'hp1', kind: 'LOAN', status: 'OPEN', notes: [], version: 1 };
    const client = mockClient({});
    const onCreated = vi.fn();
    client.post
      .mockRejectedValueOnce(ApiError.fromProblem(503, { title: 'Try again', traceId: 'create-trace' }))
      .mockResolvedValueOnce(created);
    renderAt(<NewServicingForm policyId="hp1" onCreated={onCreated} />, client, '/m/servicing');
    fireEvent.change(screen.getByLabelText('Request type'), { target: { value: 'LOAN' } });
    fireEvent.change(screen.getByLabelText('Insurer reference'), { target: { value: 'REF77' } });
    fireEvent.change(screen.getByLabelText('Follow-up date'), { target: { value: '2026-10-12' } });
    fireEvent.change(screen.getByLabelText('Insurer portal'), { target: { value: 'https://insurer.test/request' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create servicing request' }));
    expect(await screen.findByText('Try again')).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Insurer reference')).toHaveValue('REF77');
    fireEvent.click(screen.getByRole('button', { name: 'Create servicing request' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(client.post).toHaveBeenLastCalledWith('/api/v1/held-policies/hp1/servicing-requests', {
      kind: 'LOAN',
      insurerRef: 'REF77',
      followUpOn: '2026-10-12',
      portalUrl: 'https://insurer.test/request',
    });
  });
  it('shows insurer evidence and successfully appends a servicing note without reopening terminal status', async () => {
    const request = {
      id: 'r1',
      heldPolicyId: 'hp1',
      kind: 'CLAIM',
      status: 'RESOLVED',
      insurerRef: 'REF1',
      portalUrl: 'https://insurer.test/r1',
      notes: [{ at: '2026-10-03', by: 'member_1', text: 'Claim approved' }],
      version: 4,
    };
    const updated = { ...request, notes: [...request.notes, { at: '2026-10-04', by: 'member_1', text: 'Customer notified' }] };
    const client = mockClient({ '/api/v1/me': { permissions: ['book.servicing'] } });
    client.post.mockResolvedValue(updated);
    const onUpdated = vi.fn();
    renderAt(<ServicingCard request={request} onUpdated={onUpdated} />, client, '/m/servicing');
    expect(screen.getByText(/Claim approved/)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', request.portalUrl);
    await waitFor(() => expect(screen.getByLabelText('Note')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Submitted to insurer' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Customer notified' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated));
    expect(screen.getByLabelText('Note')).toHaveValue('');
  });
});
