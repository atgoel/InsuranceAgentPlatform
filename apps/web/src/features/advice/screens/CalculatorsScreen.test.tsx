import { describe, it, expect } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import type { CalcOutput } from '../api';
import { CalculatorsScreen } from './CalculatorsScreen';
import { mockClient, renderAt } from '../../../test/render';

// No per-keystroke typing: the behaviour under test is the request, so values are set in one change event.
const user = userEvent.setup({ delay: null });
function enter(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
}

const GAP = '/api/v1/calculators/protection-gap/runs';
const OUTPUT: CalcOutput = {
  result: { humanLifeValuePaise: 25000000, recommendedCoverPaise: 20000000, gapPaise: 12345600 },
  workings: [
    { label: 'Income multiple', value: 10 },
    { label: 'Less existing cover', value: '50 lakh' },
  ],
  assumptionsVersion: '2026.1',
};

function fillProtectionGap() {
  const type = (label: string, value: string) => enter(screen.getByLabelText(label), value);
  type('Annual income (₹)', '12,00,000');
  type('Annual expenses (₹)', '600000');
  type('Years to retirement', '25');
  type('Liabilities (₹)', '1500000.50');
  type('Existing cover (₹)', '5000000');
  type('Liquid assets (₹)', '0');
}

describe('AC-M06-12 CalculatorsScreen (/m/calculators)', () => {
  it('AC-M06-12 converts rupee inputs to integer paise in the request body', async () => {
    const client = mockClient({ [GAP]: OUTPUT });
    renderAt(<CalculatorsScreen />, client, '/m/calculators');
    fillProtectionGap();
    fireEvent.click(screen.getByText('Calculate'));
    await screen.findByText('Result');
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post).toHaveBeenCalledWith(GAP, {
      input: {
        annualIncomePaise: 120000000,
        annualExpensesPaise: 60000000,
        yearsToRetire: 25,
        liabilitiesPaise: 150000050,
        existingCoverPaise: 500000000,
        liquidAssetsPaise: 0,
      },
    });
  });

  it('AC-M06-12 shows result amounts in rupees with Indian grouping, the workings and the assumptions version', async () => {
    renderAt(<CalculatorsScreen />, mockClient({ [GAP]: OUTPUT }), '/m/calculators');
    fillProtectionGap();
    await user.click(screen.getByRole('button', { name: 'Calculate' }));
    expect(await screen.findByText('₹2,50,000.00')).toBeInTheDocument();
    expect(screen.getByText('₹2,00,000.00')).toBeInTheDocument();
    expect(screen.getByText('₹1,23,456.00')).toBeInTheDocument();
    expect(screen.getByText('Human life value')).toBeInTheDocument();
    expect(screen.getByText('Income multiple: 10')).toBeInTheDocument();
    expect(screen.getByText('Less existing cover: 50 lakh')).toBeInTheDocument();
    expect(screen.getByText('Assumptions v2026.1')).toBeInTheDocument();
  });

  it('AC-M06-12 shows a 400 field error next to the matching field and no result', async () => {
    const error = new ApiError(400, 'validation_failed', 'Validation failed');
    error.errors = [{ path: 'input.yearsToRetire', code: 'out_of_range', message: 'Must be between 1 and 60' }];
    renderAt(<CalculatorsScreen />, mockClient({ [GAP]: error }), '/m/calculators');
    fillProtectionGap();
    await user.click(screen.getByRole('button', { name: 'Calculate' }));
    expect(await screen.findByText('Must be between 1 and 60')).toBeInTheDocument();
    expect(screen.getByLabelText('Years to retirement')).toHaveAccessibleDescription('Must be between 1 and 60');
    expect(screen.getByLabelText('Years to retirement')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Annual income (₹)')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByText('Result')).not.toBeInTheDocument();
  });

  it('AC-M06-12 a non-field failure is shown inline with its server title', async () => {
    renderAt(<CalculatorsScreen />, mockClient({ [GAP]: new ApiError(500, 'internal', 'Calculator unavailable') }), '/m/calculators');
    await user.click(screen.getByRole('button', { name: 'Calculate' }));
    expect(await screen.findByText('Calculator unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calculate' })).toBeInTheDocument();
  });

  it('AC-M06-12 has one tab per calculator and each posts its own input shape', async () => {
    const health = '/api/v1/calculators/health-sum-insured/runs';
    const floater = '/api/v1/calculators/floater/runs';
    const client = mockClient({
      [health]: { result: { recommendedPaise: 1000000000, gapPaise: 500000000, note: 'Metro city' }, workings: [], assumptionsVersion: '2026.1' },
      [floater]: { result: { floaterPaise: 1, individualTotalPaise: 2, recommendation: 'FLOATER_PLUS_SENIOR_INDIVIDUAL' }, workings: [], assumptionsVersion: '2026.1' },
    });
    renderAt(<CalculatorsScreen />, client, '/m/calculators');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Protection gap', 'Retirement', 'Child goal', 'Health sum insured', 'Floater']);

    await user.click(screen.getByRole('tab', { name: 'Health sum insured' }));
    await user.selectOptions(screen.getByLabelText('City tier'), '2');
    enter(screen.getByLabelText('Ages'), '35, 33');
    enter(screen.getByLabelText('Existing cover (₹)'), '500000');
    await user.click(screen.getByLabelText('Pre-existing conditions'));
    await user.click(screen.getByRole('button', { name: 'Calculate' }));
    expect(await screen.findByText('Metro city')).toBeInTheDocument();
    expect(client.post).toHaveBeenCalledWith(health, { input: { cityTier: 2, ages: [35, 33], existingCoverPaise: 50000000, preExisting: true } });

    await user.click(screen.getByRole('tab', { name: 'Floater' }));
    enter(screen.getByLabelText('Member ages'), '40, 38');
    await user.click(screen.getByRole('button', { name: 'Calculate' }));
    expect(await screen.findByText('Floater plus individual cover for seniors')).toBeInTheDocument();
    expect(client.post).toHaveBeenLastCalledWith(floater, { input: { members: [{ age: 40 }, { age: 38 }], cityTier: 1 } });
  });

  it('AC-M06-12 Save to customer re-runs with the partyId from the URL and confirms', async () => {
    const client = mockClient({ [GAP]: OUTPUT });
    renderAt(<CalculatorsScreen />, client, '/m/calculators?partyId=pty_01', '/m/calculators');
    fillProtectionGap();
    await user.click(screen.getByRole('button', { name: 'Calculate' }));
    await user.click(await screen.findByRole('button', { name: 'Save to customer' }));
    expect(await screen.findByText('Saved to customer')).toBeInTheDocument();
    expect(client.post).toHaveBeenCalledTimes(2);
    expect(client.post).toHaveBeenLastCalledWith(GAP, {
      input: {
        annualIncomePaise: 120000000,
        annualExpensesPaise: 60000000,
        yearsToRetire: 25,
        liabilitiesPaise: 150000050,
        existingCoverPaise: 500000000,
        liquidAssetsPaise: 0,
      },
      partyId: 'pty_01',
    });
    expect(screen.queryByRole('button', { name: 'Save to customer' })).not.toBeInTheDocument();
  });

  it('AC-M06-12 offers no Save to customer without a partyId', async () => {
    renderAt(<CalculatorsScreen />, mockClient({ [GAP]: OUTPUT }), '/m/calculators');
    await user.click(screen.getByRole('button', { name: 'Calculate' }));
    await screen.findByText('Result');
    expect(screen.queryByRole('button', { name: 'Save to customer' })).not.toBeInTheDocument();
  });

  it('AC-M06-12 a failed save shows the server title and keeps the result on screen', async () => {
    let calls = 0;
    const client = mockClient({
      [GAP]: () => {
        calls += 1;
        if (calls > 1) throw new ApiError(403, 'forbidden', 'Not allowed to save for this customer');
        return OUTPUT;
      },
    });
    renderAt(<CalculatorsScreen />, client, '/m/calculators?partyId=pty_01', '/m/calculators');
    await user.click(screen.getByRole('button', { name: 'Calculate' }));
    await user.click(await screen.findByRole('button', { name: 'Save to customer' }));
    expect(await screen.findByText('Not allowed to save for this customer')).toBeInTheDocument();
    expect(screen.getByText('Assumptions v2026.1')).toBeInTheDocument();
  });

  it('AC-M06-12 a health result leads to the health comparison and a protection result has no next step', async () => {
    const health = '/api/v1/calculators/health-sum-insured/runs';
    const client = mockClient({
      [GAP]: OUTPUT,
      [health]: { result: { recommendedPaise: 1000000000, gapPaise: 500000000, note: 'Metro city' }, workings: [], assumptionsVersion: '2026.1' },
    });
    renderAt(<CalculatorsScreen />, client, '/m/calculators');
    await user.click(screen.getByRole('button', { name: 'Calculate' }));
    await screen.findByText('Result');
    expect(screen.queryByRole('link', { name: 'Compare health plans' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Health sum insured' }));
    await user.click(screen.getByRole('button', { name: 'Calculate' }));
    await user.click(await screen.findByRole('link', { name: 'Compare health plans' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/m/compare?line=HEALTH');
  });
});
