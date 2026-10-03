import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import type { CatalogueRow } from '../../catalogue/api';
import type { QuoteOption, QuoteView } from '../api';
import { QuoteWorkspaceScreen } from './QuoteWorkspaceScreen';
import { mockClient, renderAt } from '../../../test/render';

const PATH = '/crm/opportunities/opp_1/quote';
const ROUTE = '/crm/opportunities/:id/quote';
const QUOTES = '/api/v1/quotes';
const QUOTE_URL = '/api/v1/quotes/qte_1';
const PRODUCTS = '/api/v1/catalogue/products';
const DISCLOSURE = 'Showing plans from your tied insurers only: HDFC Life, Star Health.';
const DOC_REF = 'doc_01ARZ3NDEKTSV4RRFFQ69G5FAV';

function option(over: Partial<QuoteOption> & Pick<QuoteOption, 'id' | 'productName'>): QuoteOption {
  return {
    versionId: `pv_${over.id}`,
    insurerId: 'ins_hdfc',
    source: 'MANUAL_PORTAL',
    sumAssuredPaise: 1000000000,
    policyTermYears: 30,
    premium: { basePaise: 1000000, ridersPaise: 200000, taxPaise: 180000, totalPaise: 1380000, frequency: 'ANNUAL' },
    coverage: [{ label: 'Accidental death', value: 'Included' }],
    exclusions: [],
    waitingPeriods: [],
    validUntil: '2026-12-31',
    insurerName: 'HDFC Life',
    category: 'TERM',
    expired: false,
    bi: { required: false, acknowledged: false, records: [] },
    ...over,
  };
}

const TERM = option({ id: 'qo_term', productName: 'Click 2 Protect' });
const ULIP = option({
  id: 'qo_ulip',
  productName: 'Wealth Plus',
  category: 'ULIP',
  premium: { basePaise: 2000000, ridersPaise: 0, taxPaise: 360000, totalPaise: 2360000, frequency: 'MONTHLY' },
  policyTermYears: undefined,
  bi: { required: true, acknowledged: false, records: [] },
});

function quote(options: QuoteOption[], over: Partial<QuoteView> = {}): QuoteView {
  return {
    id: 'qte_1',
    opportunityId: 'opp_1',
    partyId: 'pty_1',
    line: 'LIFE',
    status: 'OPEN',
    version: 1,
    disclosure: DISCLOSURE,
    options,
    comparison: [
      { key: 'premium_total', label: 'Total premium', values: options.map((o) => o.premium.totalPaise) },
      { key: 'premium_frequency', label: 'Premium frequency', values: options.map((o) => o.premium.frequency) },
      { key: 'sum_assured', label: 'Sum assured', values: options.map((o) => o.sumAssuredPaise) },
      { key: 'policy_term', label: 'Policy term (years)', values: options.map((o) => o.policyTermYears ?? null) },
    ],
    ...over,
  };
}

function product(versionId: string, productName: string, inScope: boolean): CatalogueRow {
  return {
    versionId, productId: `prd_${versionId}`, productName, insurerId: 'ins_hdfc', insurerName: 'HDFC Life', line: 'LIFE', category: 'TERM',
    uin: 'UIN1', wordingVersion: 'v1', ispEligible: true, posEligible: false, status: 'active', inScope,
  };
}

const CATALOGUE = {
  items: [product('pv_term', 'Click 2 Protect', true), product('pv_other', 'Other Insurer Plan', false), product('pv_saral', 'Saral Jeevan Bima', true)],
};

const open = (client = mockClient({ [QUOTES]: { items: [quote([TERM, ULIP])] }, [PRODUCTS]: CATALOGUE })) => {
  renderAt(<QuoteWorkspaceScreen />, client, PATH, ROUTE);
  return client;
};

async function fillOption(total: string) {
  await userEvent.selectOptions(screen.getByLabelText('Product'), 'pv_saral');
  await userEvent.type(screen.getByLabelText('Sum assured (₹)'), '10000000');
  await userEvent.type(screen.getByLabelText('Policy term (years)'), '30');
  await userEvent.type(screen.getByLabelText('Base premium (₹)'), '10000');
  await userEvent.type(screen.getByLabelText('Riders premium (₹)'), '2000');
  await userEvent.type(screen.getByLabelText('Tax (₹)'), '1800');
  await userEvent.type(screen.getByLabelText('Total premium (₹)'), total);
  fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2026-12-31' } });
}

describe('AC-M06-13 QuoteWorkspaceScreen (/crm/opportunities/:id/quote)', () => {
  it('AC-M06-13 loads the first quote of the opportunity and shows its disclosure banner', async () => {
    const client = open();
    expect(await screen.findByRole('note')).toHaveTextContent(DISCLOSURE);
    expect(client.get).toHaveBeenCalledWith(QUOTES, { query: { opportunityId: 'opp_1' } });
  });

  it('AC-M06-13 offers Start quote when none exists and creates it with empty insured parties and requirements', async () => {
    const client = mockClient({ [QUOTES]: (opts: unknown) => (opts && (opts as { query?: unknown }).query ? { items: [] } : quote([])), [PRODUCTS]: CATALOGUE });
    open(client);
    await userEvent.click(await screen.findByRole('button', { name: 'Start quote' }));
    expect(await screen.findByRole('note')).toHaveTextContent(DISCLOSURE);
    expect(client.post).toHaveBeenCalledWith(QUOTES, { opportunityId: 'opp_1', insuredPartyIds: [], requirements: {} });
  });

  it('AC-M06-13 the product picker lists only in-scope products for the quote line', async () => {
    const client = open();
    await screen.findByRole('note');
    const picker = screen.getByLabelText('Product');
    await within(picker).findByRole('option', { name: 'Click 2 Protect (HDFC Life)' });
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a product', 'Click 2 Protect (HDFC Life)', 'Saral Jeevan Bima (HDFC Life)']);
    expect(client.get).toHaveBeenCalledWith(PRODUCTS, { query: { line: 'LIFE', category: undefined, insurerId: undefined } });
  });

  it('AC-M06-13 a premium total that is not base + riders + tax shows a mismatch and disables submit', async () => {
    open();
    await screen.findByRole('note');
    await within(screen.getByLabelText('Product')).findByRole('option', { name: 'Saral Jeevan Bima (HDFC Life)' });
    await fillOption('13000');
    expect(screen.getByText('Total premium must equal base + riders + tax (₹13,800.00)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add option to quote' })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Total premium (₹)'));
    await userEvent.type(screen.getByLabelText('Total premium (₹)'), '13800');
    expect(screen.queryByText(/Total premium must equal/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add option to quote' })).toBeEnabled();
  });

  it('AC-M06-13 submits the option in paise and shows the new column in the comparison grid', async () => {
    const added = option({ id: 'qo_saral', productName: 'Saral Jeevan Bima' });
    const client = mockClient({
      [QUOTES]: { items: [quote([TERM])] },
      [PRODUCTS]: CATALOGUE,
      [`${QUOTE_URL}/options`]: quote([TERM, added]),
    });
    open(client);
    await screen.findByRole('note');
    await within(screen.getByLabelText('Product')).findByRole('option', { name: 'Saral Jeevan Bima (HDFC Life)' });
    await fillOption('13800');
    await userEvent.click(screen.getByRole('button', { name: 'Add option to quote' }));
    expect(await screen.findByRole('columnheader', { name: 'Saral Jeevan Bima (HDFC Life)' })).toBeInTheDocument();
    expect(client.post).toHaveBeenCalledWith(`${QUOTE_URL}/options`, {
      versionId: 'pv_saral',
      source: 'MANUAL_PORTAL',
      sumAssuredPaise: 1000000000,
      policyTermYears: 30,
      premium: { basePaise: 1000000, ridersPaise: 200000, taxPaise: 180000, totalPaise: 1380000, frequency: 'ANNUAL' },
      coverage: [],
      exclusions: [],
      waitingPeriods: [],
      assumptions: {},
      validUntil: '2026-12-31',
    });
    expect(screen.getByLabelText('Total premium (₹)')).toHaveValue('');
  });

  it('AC-M06-13 a rejected option shows the server title inline and keeps the form values', async () => {
    const client = mockClient({
      [QUOTES]: { items: [quote([TERM])] },
      [PRODUCTS]: CATALOGUE,
      [`${QUOTE_URL}/options`]: new ApiError(403, 'product_out_of_scope', 'Product is outside your scope'),
    });
    open(client);
    await screen.findByRole('note');
    await within(screen.getByLabelText('Product')).findByRole('option', { name: 'Saral Jeevan Bima (HDFC Life)' });
    await fillOption('13800');
    await userEvent.click(screen.getByRole('button', { name: 'Add option to quote' }));
    expect(await screen.findByText('Product is outside your scope')).toBeInTheDocument();
    expect(screen.getByLabelText('Total premium (₹)')).toHaveValue('13800');
    expect(screen.getByRole('note')).toHaveTextContent(DISCLOSURE);
  });

  it('AC-M06-13 the comparison grid has one column per option with paise rows in rupees and enums translated', async () => {
    open();
    const grid = await screen.findByRole('table', { name: 'Comparison' });
    expect(within(grid).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Comparison', 'Click 2 Protect (HDFC Life)', 'Wealth Plus (HDFC Life)']);
    const rowCells = (label: string) => within(within(grid).getByRole('row', { name: new RegExp(`^${label}`) })).getAllByRole('cell').map((c) => c.textContent);
    expect(rowCells('Total premium')).toEqual(['₹13,800.00', '₹23,600.00']);
    expect(rowCells('Sum assured')).toEqual(['₹1,00,00,000.00', '₹1,00,00,000.00']);
    expect(rowCells('Premium frequency')).toEqual(['Annual', 'Monthly']);
    expect(rowCells('Policy term')).toEqual(['30', 'Not available']);
  });

  it('AC-M06-13 Share copies the returned link and shows its expiry', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const client = mockClient({
      [QUOTES]: { items: [quote([TERM])] },
      [PRODUCTS]: CATALOGUE,
      [`${QUOTE_URL}/shares`]: { url: 'https://app.example/q/tok123', expiresAt: '2026-10-10T12:00:00.000Z' },
    });
    open(client);
    await userEvent.click(await screen.findByRole('button', { name: 'Share' }));
    expect(await screen.findByText('Share link https://app.example/q/tok123 (expires 10 Oct 2026)')).toBeInTheDocument();
    expect(client.post).toHaveBeenCalledWith(`${QUOTE_URL}/shares`);
    expect(writeText).toHaveBeenCalledWith('https://app.example/q/tok123');
  });

  it('AC-M06-13 an option needing an unacknowledged benefit illustration shows the message and cannot be selected', async () => {
    open();
    const ulip = await screen.findByRole('article', { name: 'Wealth Plus' });
    expect(within(ulip).getByText('Benefit illustration acknowledgement required')).toBeInTheDocument();
    expect(within(ulip).getByRole('button', { name: 'Select Wealth Plus' })).toBeDisabled();
    const term = screen.getByRole('article', { name: 'Click 2 Protect' });
    expect(within(term).queryByText('Benefit illustration acknowledgement required')).not.toBeInTheDocument();
    expect(within(term).getByRole('button', { name: 'Select Click 2 Protect' })).toBeEnabled();
  });

  it('AC-M06-13 selecting an option posts its id and marks it selected', async () => {
    const client = mockClient({
      [QUOTES]: { items: [quote([TERM, ULIP])] },
      [PRODUCTS]: CATALOGUE,
      [`${QUOTE_URL}/selection`]: quote([TERM, ULIP], { status: 'SELECTED', selectedOptionId: 'qo_term' }),
    });
    open(client);
    const term = await screen.findByRole('article', { name: 'Click 2 Protect' });
    await userEvent.click(within(term).getByRole('button', { name: 'Select Click 2 Protect' }));
    expect(await within(term).findByText('Selected option')).toBeInTheDocument();
    expect(client.post).toHaveBeenCalledWith(`${QUOTE_URL}/selection`, { optionId: 'qo_term' });
    expect(within(screen.getByRole('article', { name: 'Wealth Plus' })).queryByText('Selected option')).not.toBeInTheDocument();
  });

  it('AC-M06-13 shows the server message for a 422 quote_expired and a 422 bi_acknowledgement_required', async () => {
    let answer: Error = new ApiError(422, 'quote_expired', 'This option has expired');
    const client = mockClient({
      [QUOTES]: { items: [quote([TERM])] },
      [PRODUCTS]: CATALOGUE,
      [`${QUOTE_URL}/selection`]: () => {
        throw answer;
      },
    });
    open(client);
    await userEvent.click(await screen.findByRole('button', { name: 'Select Click 2 Protect' }));
    expect(await screen.findByText('This option has expired')).toBeInTheDocument();
    answer = new ApiError(422, 'bi_acknowledgement_required', 'Acknowledge the benefit illustration first');
    await userEvent.click(screen.getByRole('button', { name: 'Select Click 2 Protect' }));
    expect(await screen.findByText('Acknowledge the benefit illustration first')).toBeInTheDocument();
    expect(screen.queryByText('This option has expired')).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Comparison' })).toBeInTheDocument();
  });

  it('AC-M06-13 attaching a benefit illustration validates the document reference and posts it with the insurer version', async () => {
    const attached = { id: 'bi_1', documentRef: DOC_REF, insurerBiVersion: 'v3', uploadedAt: '2026-10-01T10:00:00Z' };
    const withBi = quote([TERM, { ...ULIP, bi: { required: true, acknowledged: false, records: [attached] } }]);
    let reloaded = false;
    const client = mockClient({
      [QUOTES]: { items: [quote([TERM, ULIP])] },
      [PRODUCTS]: CATALOGUE,
      [QUOTE_URL]: () => (reloaded ? withBi : quote([TERM, ULIP])),
      '/api/v1/quote-options/qo_ulip/benefit-illustrations': () => {
        reloaded = true;
        return attached;
      },
    });
    open(client);
    const ulip = await screen.findByRole('article', { name: 'Wealth Plus' });
    await userEvent.type(within(ulip).getByLabelText('Document reference'), 'doc_lower');
    expect(within(ulip).getByText(/Document reference must look like doc_/)).toBeInTheDocument();
    await userEvent.type(within(ulip).getByLabelText('Insurer illustration version'), 'v3');
    expect(within(ulip).getByRole('button', { name: 'Attach illustration' })).toBeDisabled();
    await userEvent.clear(within(ulip).getByLabelText('Document reference'));
    await userEvent.type(within(ulip).getByLabelText('Document reference'), DOC_REF);
    await userEvent.click(within(ulip).getByRole('button', { name: 'Attach illustration' }));
    expect(await within(ulip).findByText(`Illustration ${DOC_REF}, insurer version v3`)).toBeInTheDocument();
    expect(client.post).toHaveBeenCalledWith('/api/v1/quote-options/qo_ulip/benefit-illustrations', { documentRef: DOC_REF, insurerBiVersion: 'v3' });
    expect(within(ulip).getByRole('button', { name: 'Record acknowledgement' })).toBeInTheDocument();
  });

  it('AC-M06-13 an assisted acknowledgement needs evidence, then posts the method and evidence and unblocks Select', async () => {
    const pending = { id: 'bi_1', documentRef: DOC_REF, insurerBiVersion: 'v3', uploadedAt: '2026-10-01T10:00:00Z' };
    const ulipPending = { ...ULIP, bi: { required: true, acknowledged: false, records: [pending] } };
    const ulipDone = { ...ULIP, bi: { required: true, acknowledged: true, records: [{ ...pending, acknowledgement: { method: 'ASSISTED' as const, at: '2026-10-02T10:00:00Z', by: 'mem_1', evidenceRef: 'EV-1' } }] } };
    let done = false;
    const client = mockClient({
      [QUOTES]: { items: [quote([ulipPending])] },
      [PRODUCTS]: CATALOGUE,
      [QUOTE_URL]: () => quote([done ? ulipDone : ulipPending]),
      '/api/v1/benefit-illustrations/bi_1/acknowledgement': () => {
        done = true;
        return ulipDone.bi.records[0];
      },
    });
    open(client);
    const card = await screen.findByRole('article', { name: 'Wealth Plus' });
    await userEvent.selectOptions(within(card).getByLabelText('Acknowledgement method'), 'ASSISTED');
    expect(within(card).getByText('Evidence is required for assisted acknowledgement')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Record acknowledgement' })).toBeDisabled();
    await userEvent.type(within(card).getByLabelText('Evidence reference'), 'EV-1');
    await userEvent.click(within(card).getByRole('button', { name: 'Record acknowledgement' }));
    expect(await within(card).findByText('Benefit illustration acknowledged')).toBeInTheDocument();
    expect(client.post).toHaveBeenCalledWith('/api/v1/benefit-illustrations/bi_1/acknowledgement', { method: 'ASSISTED', evidenceRef: 'EV-1' });
    expect(within(card).getByRole('button', { name: 'Select Wealth Plus' })).toBeEnabled();
    expect(within(card).queryByText('Benefit illustration acknowledgement required')).not.toBeInTheDocument();
  });

  it('AC-M06-13 shows the forbidden state and the error state for the quote load', async () => {
    const denied = renderAt(<QuoteWorkspaceScreen />, mockClient({ [QUOTES]: new ApiError(403, 'forbidden', 'No') }), PATH, ROUTE);
    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
    denied.unmount();
    renderAt(<QuoteWorkspaceScreen />, mockClient({ [QUOTES]: new ApiError(500, 'internal', 'Boom') }), PATH, ROUTE);
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  });
});
