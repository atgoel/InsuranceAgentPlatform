import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEventLib from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import type { CapacityRow, RoutingRule } from '../api';
import { RoutingRulesScreen } from './RoutingRulesScreen';
import { mockClient, renderAt, type MockClient } from '../../../test/render';

const rule = (over: Partial<RoutingRule>): RoutingRule => ({ id: 'r', priority: 1, name: 'Rule', active: true, conditions: [], method: 'ROUND_ROBIN', slaMinutes: 30, onBreach: 'NOTIFY_MANAGER', ...over });
const RULES = [
  rule({ id: 'r_health', priority: 20, name: 'Health to Delhi team', conditions: [{ field: 'productInterest', op: 'in', value: ['HEALTH', 'HEALTH_FLOATER'] }], method: 'LEAST_LOADED' }),
  rule({ id: 'r_all', priority: 10, name: 'Everything else' }),
];
const CAPACITY: CapacityRow[] = [
  { memberId: 'm1', displayName: 'Priya Sharma', salespersonType: 'EMPLOYEE', openLeadsToday: 3, capacityPerDay: 20, available: true },
  { memberId: 'm2', displayName: 'Arjun Rao', salespersonType: 'POSP', openLeadsToday: 0, capacityPerDay: 20, available: false, reason: 'On leave until 5 Oct' },
];
const routes = () => ({ '/api/v1/routing-rules': { rules: RULES }, '/api/v1/routing/capacity': { items: CAPACITY } });
const savedBody = (client: MockClient) => client.put.mock.calls[0]?.[1] as { rules: RoutingRule[] };

/** No inter-key delay: the default 0 ms timer per keystroke made long typing tests slow under load. */
const userEvent = userEventLib.setup({ delay: null });

describe('AC-M04-19/28 RoutingRulesScreen (/crm/routing)', () => {
  const open = async (client: MockClient) => {
    renderAt(<RoutingRulesScreen newId={() => 'r_new'} />, client, '/crm/routing');
    await screen.findByRole('listitem', { name: 'Everything else' });
  };

  it('AC-M04-28 lists rules in priority order with method, SLA and condition count; explains first match wins', async () => {
    await open(mockClient(routes()));
    expect(screen.getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['Everything else', 'Health to Delhi team']);
    expect(screen.getByRole('listitem', { name: 'Health to Delhi team' })).toHaveTextContent('Least Loaded · SLA 30 min · 1 condition');
    expect(screen.getByText(/first rule that matches and has an eligible salesperson wins/)).toBeInTheDocument();
  });

  it('AC-M04-19 reorder, toggle and save send the whole list with priorities renumbered by position', async () => {
    const client = mockClient(routes());
    client.put.mockImplementation(async (_p: string, body: { rules: RoutingRule[] }) => body);
    await open(client);
    await userEvent.click(within(screen.getByRole('listitem', { name: 'Health to Delhi team' })).getByRole('button', { name: 'Move up' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Active: Everything else' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(client.put).toHaveBeenCalledWith('/api/v1/routing-rules', { rules: [{ ...RULES[0], priority: 1 }, { ...RULES[1], priority: 2, active: false }] });
    expect(await screen.findByRole('status')).toHaveTextContent('Rules saved');
  });

  it('AC-M04-28 adds a rule with a condition; empty values are refused before saving', async () => {
    const client = mockClient(routes());
    client.put.mockImplementation(async (_p: string, body: { rules: RoutingRule[] }) => body);
    await open(client);
    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    const editor = within(screen.getByRole('form', { name: 'Edit rule' }));
    await userEvent.type(editor.getByLabelText('Rule name'), 'Mumbai pincodes');
    await userEvent.click(editor.getByRole('button', { name: 'Add condition' }));
    await userEvent.click(editor.getByRole('button', { name: 'Apply' }));
    expect(editor.getByRole('alert')).toHaveTextContent('Every condition needs a value');
    await userEvent.selectOptions(editor.getByRole('combobox', { name: 'Field' }), 'pincodePrefix');
    await userEvent.selectOptions(editor.getByRole('combobox', { name: 'Operator' }), 'startsWith');
    await userEvent.type(editor.getByRole('textbox', { name: 'Value' }), '400');
    await userEvent.click(editor.getByRole('button', { name: 'Apply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(savedBody(client).rules[2]).toEqual({
      id: 'r_new', priority: 3, name: 'Mumbai pincodes', active: true, method: 'ROUND_ROBIN', slaMinutes: 30, onBreach: 'NOTIFY_MANAGER',
      conditions: [{ field: 'pincodePrefix', op: 'startsWith', value: '400' }],
    });
  });

  it('AC-M04-28 "is one of" turns a comma list into an array; reassign needs its delay', async () => {
    const client = mockClient(routes());
    client.put.mockImplementation(async (_p: string, body: { rules: RoutingRule[] }) => body);
    await open(client);
    await userEvent.click(within(screen.getByRole('listitem', { name: 'Everything else' })).getByRole('button', { name: 'Edit' }));
    const editor = within(screen.getByRole('form', { name: 'Edit rule' }));
    await userEvent.click(editor.getByRole('button', { name: 'Add condition' }));
    await userEvent.selectOptions(editor.getByRole('combobox', { name: 'Operator' }), 'in');
    await userEvent.type(editor.getByRole('textbox', { name: 'Value' }), 'MOTOR, HEALTH');
    await userEvent.selectOptions(editor.getByLabelText('On breach'), 'NOTIFY_THEN_REASSIGN');
    await userEvent.click(editor.getByRole('button', { name: 'Apply' }));
    expect(editor.getByRole('alert')).toHaveTextContent('Reassign after must be at least 5 minutes');
    await userEvent.type(editor.getByLabelText('Reassign after (minutes)'), '60');
    await userEvent.click(editor.getByRole('button', { name: 'Apply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(savedBody(client).rules[0]).toMatchObject({ id: 'r_all', onBreach: 'NOTIFY_THEN_REASSIGN', reassignAfterMinutes: 60, conditions: [{ field: 'productInterest', op: 'in', value: ['MOTOR', 'HEALTH'] }] });
  });

  it('AC-M04-19 a server rejection on save is shown with the server message', async () => {
    const client = mockClient(routes());
    client.put.mockRejectedValue(new ApiError(400, 'duplicate_rule_id', 'Rule ids must be unique'));
    await open(client);
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Rule ids must be unique');
  });

  it('AC-M04-19 test a lead shows who and why, without saving anything', async () => {
    const client = mockClient({ ...routes(), '/api/v1/routing-rules/simulations': { memberId: 'm1', memberName: 'Priya Sharma', reason: 'Rule "Everything else" (round robin) → Priya Sharma' } });
    await open(client);
    const form = within(screen.getByRole('form', { name: 'Test a lead' }));
    await userEvent.selectOptions(form.getByLabelText('Product'), 'MOTOR');
    await userEvent.type(form.getByLabelText('Pincode'), '110001');
    await userEvent.click(form.getByRole('button', { name: 'Simulate routing' }));
    expect(await form.findByRole('status', { name: 'Routing decision' })).toHaveTextContent('Priya SharmaRule "Everything else" (round robin) → Priya Sharma');
    expect(client.post).toHaveBeenCalledWith('/api/v1/routing-rules/simulations', { productInterest: 'MOTOR', source: 'WEB_FORM', pincode: '110001', language: undefined });
    expect(client.put).not.toHaveBeenCalled();
  });

  it('AC-M04-28 the capacity table shows availability or the server reason', async () => {
    await open(mockClient(routes()));
    const table = within(screen.getByRole('region', { name: 'Capacity' }));
    expect(table.getByText('Priya Sharma').closest('tr')).toHaveTextContent('Priya SharmaEmployee320Available');
    expect(table.getByText('Arjun Rao').closest('tr')).toHaveTextContent('On leave until 5 Oct');
  });

  it('AC-M04-28 403 shows the permission state', async () => {
    renderAt(<RoutingRulesScreen />, mockClient({ '/api/v1/routing-rules': new ApiError(403, 'forbidden', 'No'), '/api/v1/routing/capacity': { items: [] } }), '/crm/routing');
    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
  });

  it('AC-M04-28 a server error shows the error state, and Try again loads the rules', async () => {
    let failing = true;
    const client = mockClient({
      '/api/v1/routing-rules': () => {
        if (failing) throw new ApiError(500, 'boom', 'Server error', 'Internal server error', 'trace-123456789');
        return { rules: RULES };
      },
      '/api/v1/routing/capacity': { items: CAPACITY },
    });
    renderAt(<RoutingRulesScreen />, client, '/crm/routing');
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('listitem', { name: 'Everything else' })).toBeInTheDocument();
  });

  it('AC-M04-28 shows the rule order as numbers and translates the salesperson type', async () => {
    await open(mockClient(routes()));
    const numbers = Array.from(document.querySelectorAll('.rule-priority')).map((n) => n.textContent);
    expect(numbers).toEqual(['1', '2']);
    expect(screen.getByText('POSP')).toBeInTheDocument();
    expect(screen.queryByText('EMPLOYEE')).not.toBeInTheDocument();
  });
});
