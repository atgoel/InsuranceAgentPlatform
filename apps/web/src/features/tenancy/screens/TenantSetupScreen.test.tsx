import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockClient } from '../../../test/render';
import { ApiError } from '../../../lib/api/api-error';
import { TenantSetupScreen } from './TenantSetupScreen';
import type { FeatureFlag, TenantProfile, TieUpsResponse } from '../api';

const PROFILE = '/api/v1/tenant';
const TIE_UPS = '/api/v1/tenant/tie-ups';
const FLAGS = '/api/v1/tenant/feature-flags';
const ONLINE = `${FLAGS}/online_purchase`;

const profile: TenantProfile = {
  id: 'tenant-1',
  slug: 'acme',
  displayName: 'Acme',
  kind: 'ORGANISATION',
  status: 'active',
  planCode: 'BUSINESS',
  crmMode: 'twenty',
  entity: {
    entityType: 'IMF',
    legalName: 'Acme Insurance Marketing',
    registrationNo: 'IMF001',
    registrationValidTo: '2027-12-31',
    principalOfficerName: 'John Doe',
  },
  registrationStatus: 'valid',
  comparisonScope: 'TIED_INSURERS',
  hosts: [],
};

const tieUps: TieUpsResponse = {
  entityType: 'IMF',
  comparisonScope: 'TIED_INSURERS',
  lines: [
    { line: 'LIFE', max: 2, active: [{ insurerId: 'INSURER1', line: 'LIFE', effectiveFrom: '2026-01-01' }] },
    { line: 'HEALTH', max: 2, active: [] },
  ],
};

const flags: FeatureFlag[] = [
  { key: 'online_purchase', enabled: false, gate: { kind: 'COMPLIANCE_REVIEW', reason: 'ISNP rules require compliance review' } },
  { key: 'referral_rewards', enabled: false, gate: { kind: 'LEGAL_LOCK', reason: 'Insurance Act s.41' } },
];

function setup(over: Record<string, unknown> = {}, permissions: string[] = ['tenant.flag.write']) {
  const client = mockClient({
    '/api/v1/me': { userRef: 'u1', tenantId: 't1', roles: [], permissions },
    [PROFILE]: profile,
    [TIE_UPS]: tieUps,
    [FLAGS]: { items: flags },
    '/api/v1/catalogue/products': { items: [] },
    ...over,
  });
  renderAt(<TenantSetupScreen />, client, '/console/tenant');
  return client;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('AC-M01-16 TenantSetupScreen', () => {
  it('AC-M01-16 shows the entity with a translated registration status chip and a formatted date (BUG-14, BUG-16)', async () => {
    setup();
    expect(await screen.findByText('Acme Insurance Marketing')).toBeInTheDocument();
    expect(screen.getByText('Insurance Marketing Firm')).toBeInTheDocument();
    expect(screen.getByText('IMF001')).toBeInTheDocument();
    expect(screen.getByText('31 Dec 2027')).toBeInTheDocument();
    expect(screen.getByText('Valid')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Only tied insurers')).toBeInTheDocument();
    expect(screen.queryByText(/tenancy\.setup\.status_/)).not.toBeInTheDocument();
    expect(screen.queryByText('IMF')).not.toBeInTheDocument();
  });

  it('AC-M01-16 shows the expiring chip when the server computes it', async () => {
    setup({ [PROFILE]: { ...profile, registrationStatus: 'expiring' } });
    expect(await screen.findByText('Expiring soon')).toBeInTheDocument();
  });

  it('AC-M01-16 shows the market-wide sentence for a market-wide scope', async () => {
    setup({ [PROFILE]: { ...profile, comparisonScope: 'MARKET_WIDE' } });
    expect(await screen.findByText('Market-wide comparison across configured insurers')).toBeInTheDocument();
  });

  it('AC-M01-16 shows tie-ups per line with used/max counters and line labels, not codes (BUG-09)', async () => {
    setup();
    expect(await screen.findByText('Life insurance')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('0/2')).toBeInTheDocument();
    expect(screen.getByText('INSURER1')).toBeInTheDocument();
    expect(screen.queryByText('LIFE')).not.toBeInTheDocument();
  });

  it('AC-M01-16 hides the add form and warns when a line is at its limit', async () => {
    setup({
      [TIE_UPS]: {
        ...tieUps,
        lines: [
          {
            line: 'LIFE',
            max: 2,
            active: [
              { insurerId: 'A', line: 'LIFE', effectiveFrom: '2026-01-01' },
              { insurerId: 'B', line: 'LIFE', effectiveFrom: '2026-01-01' },
            ],
          },
        ],
      },
    });
    expect(await screen.findByText('2/2')).toBeInTheDocument();
    expect(screen.getByText('Limit reached')).toBeInTheDocument();
    expect(screen.queryByLabelText('Insurer ID for Life insurance')).not.toBeInTheDocument();
  });

  it('AC-M01-16 saves the edited tie-ups with the IST date as effective-from', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-04T20:00:00Z')); // 5 Oct 01:30 in IST, still 4 Oct in UTC
    const client = setup();
    const user = userEvent.setup({ delay: null });
    await screen.findByText('Life insurance');
    await user.click(screen.getByLabelText('Insurer ID for Health insurance'));
    await user.paste('INSURER2');
    const healthLine = screen.getByText('Health insurance').closest('.line-section') as HTMLElement;
    await user.click(within(healthLine).getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Save configuration' }));

    await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
    expect(client.put).toHaveBeenCalledWith(TIE_UPS, {
      tieUps: [
        { insurerId: 'INSURER1', line: 'LIFE', effectiveFrom: '2026-01-01' },
        { insurerId: 'INSURER2', line: 'HEALTH', effectiveFrom: '2026-10-05' },
      ],
    });
  });

  it('AC-M01-16 removes a tie-up before saving', async () => {
    const client = setup();
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Remove INSURER1 from Life insurance' }));
    await user.click(screen.getByRole('button', { name: 'Save configuration' }));
    await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
    expect(client.put).toHaveBeenCalledWith(TIE_UPS, { tieUps: [] });
  });

  it('AC-M01-16 shows tie_up_limit_exceeded inline and keeps the page', async () => {
    const client = setup();
    client.put.mockRejectedValue(new ApiError(422, 'tie_up_limit_exceeded', 'Tie-up limit exceeded'));
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Save configuration' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This exceeds the insurer tie-up limit for your entity type');
    expect(screen.getByText('Acme Insurance Marketing')).toBeInTheDocument();
  });

  it('AC-M01-16 shows any other save failure by its server title inline', async () => {
    const client = setup();
    client.put.mockRejectedValue(new ApiError(500, 'server_error', 'Could not save tie-ups'));
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Save configuration' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save tie-ups');
    expect(screen.getByText('Acme Insurance Marketing')).toBeInTheDocument();
  });

  it('AC-M01-16 records a compliance review, then enables online purchase', async () => {
    const client = setup();
    const reviewed: FeatureFlag = { ...flags[0], gate: { ...flags[0].gate!, reviewRef: 'CR-2026-07', reviewedAt: '2026-10-04' } };
    client.post.mockResolvedValue(reviewed);
    client.put.mockResolvedValue({ ...reviewed, enabled: true });
    const user = userEvent.setup({ delay: null });
    await screen.findByText('Pending review');
    await user.click(screen.getByLabelText('Compliance review reference'));
    await user.paste('CR-2026-07');
    await user.click(screen.getByRole('button', { name: 'Record Compliance review' }));

    expect(await screen.findByText('Reviewed, not enabled')).toBeInTheDocument();
    expect(client.post).toHaveBeenCalledExactlyOnceWith(
      `${ONLINE}/compliance-reviews`,
      { reviewRef: 'CR-2026-07' },
      { idempotencyKey: expect.any(String) },
    );
    await user.click(screen.getByRole('button', { name: 'Enable for this tenant' }));
    expect(await screen.findByText('Enabled')).toBeInTheDocument();
    expect(client.put).toHaveBeenCalledExactlyOnceWith(ONLINE, { enabled: true });
  });

  it('AC-M01-16 shows a refused enable (compliance_review_required) inline and keeps the page', async () => {
    const reviewed: FeatureFlag = { ...flags[0], gate: { ...flags[0].gate!, reviewRef: 'CR-1' } };
    const client = setup({ [FLAGS]: { items: [reviewed, flags[1]] } });
    client.put.mockRejectedValue(new ApiError(422, 'compliance_review_required', 'A compliance review is required'));
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Enable for this tenant' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A compliance review is required');
    expect(screen.getByText('Reviewed, not enabled')).toBeInTheDocument();
  });

  it('AC-M01-16 shows the referral rewards locked with its legal text and a disabled switch', async () => {
    setup();
    expect(await screen.findByText('Off · legal review required')).toBeInTheDocument();
    expect(screen.getByText(/Rebates and inducements to policyholders are prohibited/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Referral rewards (locked)' })).toBeDisabled();
  });

  it('AC-M01-16 offers no compliance actions without tenant.flag.write', async () => {
    setup({}, []);
    await screen.findByText('Pending review');
    expect(screen.queryByRole('button', { name: 'Record Compliance review' })).not.toBeInTheDocument();
  });

  it('AC-M01-16 shows the permission-denied state on 403', async () => {
    setup({ [PROFILE]: new ApiError(403, 'forbidden', 'Forbidden') });
    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
  });

  it('AC-M01-16 shows an error state on a server failure', async () => {
    setup({ [TIE_UPS]: new ApiError(500, 'server_error', 'Server error') });
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  });

  it('AC-M01-16 shows the loading state first', () => {
    const client = mockClient({});
    client.get.mockImplementation(() => new Promise(() => undefined));
    renderAt(<TenantSetupScreen />, client, '/console/tenant');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
