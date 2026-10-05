import { describe, it, expect } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { mockClient, renderAt } from '../../../test/render';
import { compactPaise, formatPaise } from '../money';
import { DueCalendarScreen } from './DueCalendarScreen';

function due(over: Record<string, unknown>) {
  return {
    policyId: 'hp1',
    holderName: 'Asha Patil',
    productName: 'Term cover',
    dueDate: '2026-10-04',
    amountPaise: 100000,
    status: 'DUE_TODAY',
    line: 'LIFE',
    source: 'IMPORT',
    asOf: '2026-07-02',
    confidence: 'MEDIUM',
    ...over,
  };
}

const grace = due({ policyId: 'hp2', holderName: 'Ravi', amountPaise: 250050, status: 'IN_GRACE', graceEndsOn: '2026-10-20' });
const lapsed = due({ policyId: 'hp3', dueDate: '2026-10-09', status: 'LAPSED', line: 'HEALTH', amountPaise: 12345678 });
const paid = due({ policyId: 'hp4', dueDate: '2026-10-15', status: 'PAID', amountPaise: 5000 });
const october = {
  days: [
    { date: '2026-10-04', dues: [due({}), grace] },
    { date: '2026-10-09', dues: [lapsed] },
    { date: '2026-10-15', dues: [paid] },
  ],
};

function open() {
  const client = mockClient({ '/api/v1/me': { permissions: [] }, '/api/v1/dues': october });
  renderAt(<DueCalendarScreen today="2026-10-04" />, client, '/m/dues');
  return client;
}

describe('AC-M07-15 due calendar month grid', () => {
  it('requests the whole month and colours each day by the server classification with its total amount', async () => {
    const client = open();
    await screen.findByText('October 2026');
    expect(client.get).toHaveBeenCalledWith('/api/v1/dues', { query: { from: '2026-10-01', to: '2026-10-31' } });
    expect(screen.getByLabelText('4 Oct 2026, 2 dues, ₹3,500.50')).toHaveAttribute('data-tone', 'warn');
    expect(screen.getByLabelText('9 Oct 2026, 1 due, ₹1,23,456.78')).toHaveAttribute('data-tone', 'bad');
    expect(screen.getByLabelText('15 Oct 2026, 1 due, ₹50')).toHaveAttribute('data-tone', 'ok');
    expect(screen.getByLabelText('5 Oct 2026')).toHaveAttribute('data-tone', 'none');
    expect(screen.getByText('₹1.2L')).toBeInTheDocument();
  });
  it('shows month name and formatted dates instead of ISO values', async () => {
    open();
    expect(await screen.findByText('October 2026')).toBeInTheDocument();
    expect(screen.getByText('Due on 4 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText(/Grace ends 20 Oct 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-10-04/)).not.toBeInTheDocument();
    expect(document.querySelectorAll('.due-meta')).toHaveLength(2);
    expect(screen.getAllByText(/Life insurance/, { selector: '.due-meta' })).toHaveLength(2);
  });
  it('AC-M07-15 names a day with one due in the singular and several in the plural', async () => {
    open();
    await screen.findByText('October 2026');
    expect(screen.getByLabelText('9 Oct 2026, 1 due, ₹1,23,456.78')).toBeInTheDocument();
    expect(screen.getByLabelText('4 Oct 2026, 2 dues, ₹3,500.50')).toBeInTheDocument();
    expect(screen.queryByLabelText(/1 dues/)).not.toBeInTheDocument();
  });

  it('lists the dues of a picked day and filters by line with counts', async () => {
    open();
    fireEvent.click(await screen.findByLabelText('9 Oct 2026, 1 due, ₹1,23,456.78'));
    expect(screen.getByText('₹1,23,456.78', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Lapsed', { selector: '.status-chip' })).toBeInTheDocument();
    const chip = screen.getByRole('button', { name: /^Health insurance\s*1$/ });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('4 Oct 2026')).toHaveAttribute('data-tone', 'none');
  });
  it('loads the next month when the month changes', async () => {
    const client = open();
    fireEvent.change(await screen.findByLabelText('Month'), { target: { value: '2026-11' } });
    await screen.findByText('November 2026');
    expect(client.get).toHaveBeenLastCalledWith('/api/v1/dues', { query: { from: '2026-11-01', to: '2026-11-30' } });
  });
});

describe('AC-M07-15 money without floats', () => {
  it('formats integer paise exactly', () => {
    expect(formatPaise(0)).toBe('₹0');
    expect(formatPaise(5)).toBe('₹0.05');
    expect(formatPaise(100)).toBe('₹1');
    expect(formatPaise(12345678)).toBe('₹1,23,456.78');
    expect(formatPaise(9007199254740991)).toBe('₹9,00,71,99,25,47,409.91');
  });
  it('shortens amounts by truncating', () => {
    expect(compactPaise(99999)).toBe('₹999');
    expect(compactPaise(250050)).toBe('₹2k');
    expect(compactPaise(12345678)).toBe('₹1.2L');
    expect(compactPaise(10000000)).toBe('₹1L');
  });
});
