import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEventLib from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import { LeadImportScreen } from './LeadImportScreen';
import { mockClient, renderAt, type MockClient } from '../../../test/render';

const CSV = 'Client Name,CONTACT NO.,Type,City\r\nAsha Verma,9876500001,Health Floater,Delhi\r\nRavi Kumar,12345,TERM_LIFE,Pune\r\n';
const PREVIEW = '/api/v1/lead-imports/previews';
const COMMIT = '/api/v1/lead-imports';
const PREVIEW_RESULT = { valid: 1, duplicates: 0, rejected: [{ row: 2, reasons: ['invalid_mobile'] }] };
const COMMIT_RESULT = { batchId: 'imp_01', imported: 1, duplicates: 0, rejected: 1, skippedAlreadyImported: 0 };
const EXPECTED_ROWS = [
  { fullName: 'Asha Verma', mobile: '9876500001', productInterest: 'HEALTH_FLOATER' },
  { fullName: 'Ravi Kumar', mobile: '12345', productInterest: 'TERM_LIFE' },
];

/** No inter-key delay: the default 0 ms timer per keystroke made long typing tests slow under load. */
const userEvent = userEventLib.setup({ delay: null });

describe('AC-M04-30 LeadImportScreen (/crm/import)', () => {
  const start = async (client: MockClient, csv = CSV) => {
    renderAt(<LeadImportScreen />, client, '/crm/import');
    await userEvent.upload(screen.getByLabelText('Select CSV file'), new File([csv], 'leads.csv', { type: 'text/csv' }));
    await screen.findByRole('region', { name: 'Map columns' });
  };
  const body = (client: MockClient, path: string) => client.post.mock.calls.find((c) => c[0] === path)?.[1] as Record<string, unknown>;

  it('AC-M04-30 auto-maps register headers and leaves unknown columns unmapped', async () => {
    await start(mockClient({}));
    expect(screen.getByRole('combobox', { name: 'Client Name maps to' })).toHaveValue('fullName');
    expect(screen.getByRole('combobox', { name: 'CONTACT NO. maps to' })).toHaveValue('mobile');
    expect(screen.getByRole('combobox', { name: 'Type maps to' })).toHaveValue('productInterest');
    expect(screen.getByRole('combobox', { name: 'City maps to' })).toHaveValue('');
  });

  it('AC-M04-30 without a name and a contact column the rows cannot be checked', async () => {
    await start(mockClient({}));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'CONTACT NO. maps to' }), '');
    expect(screen.getByText('Map a column to Mobile or Email.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check rows' })).toBeDisabled();
  });

  it('AC-M04-30 preview sends only mapped fields with the file checksum, then shows counts and rejected reasons', async () => {
    const client = mockClient({ [PREVIEW]: PREVIEW_RESULT });
    await start(client);
    await userEvent.click(screen.getByRole('button', { name: 'Check rows' }));
    expect(await screen.findByRole('region', { name: 'Validate' })).toBeInTheDocument();
    expect(body(client, PREVIEW)).toEqual({ fileChecksum: expect.stringMatching(/^[a-f0-9]{64}$/), sourceTag: 'preview', consentBasis: 'NONE', rows: EXPECTED_ROWS });
    expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual(['1', '0', '1']);
    expect(screen.getByRole('table', { name: 'Rejected rows (preview)' })).toHaveTextContent('2invalid_mobile');
  });

  it('AC-M04-30 the import needs a source tag; commit sends the consent basis and shows the batch id and rerun note', async () => {
    const client = mockClient({ [PREVIEW]: PREVIEW_RESULT, [COMMIT]: COMMIT_RESULT });
    await start(client);
    await userEvent.click(screen.getByRole('button', { name: 'Check rows' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Source tag is required');
    expect(body(client, COMMIT)).toBeUndefined();
    await userEvent.type(screen.getByRole('textbox', { name: 'Source tag (required)' }), 'Diwali expo 2026');
    await userEvent.click(screen.getByRole('radio', { name: 'Consent captured at event' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Notice version' }), 'v2');
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByText('imp_01')).toBeInTheDocument();
    expect(screen.getByText('Re-running the same file skips existing rows.')).toBeInTheDocument();
    expect(body(client, COMMIT)).toEqual({
      fileChecksum: body(client, PREVIEW).fileChecksum, sourceTag: 'Diwali expo 2026', consentBasis: 'CAPTURED_AT_EVENT', noticeVersion: 'v2', rows: EXPECTED_ROWS,
    });
  });

  it('AC-M04-30 a failed preview stays on the mapping step with the mapping intact', async () => {
    const client = mockClient({ [PREVIEW]: new ApiError(400, 'invalid_rows', 'Too many rows') });
    await start(client);
    await userEvent.click(screen.getByRole('button', { name: 'Check rows' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not complete this step: Too many rows');
    expect(screen.getByRole('combobox', { name: 'Client Name maps to' })).toHaveValue('fullName');
  });

  it('AC-M04-30 a file with only a header row is refused at upload', async () => {
    renderAt(<LeadImportScreen />, mockClient({}), '/crm/import');
    await userEvent.upload(screen.getByLabelText('Select CSV file'), new File(['Name,Mobile\r\n'], 'empty.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CSV must have at least a header row and one data row');
  });

  it('AC-M04-30 shows the four steps of CRM08 with the current one marked, and a Duplicate queue tab', async () => {
    renderAt(<LeadImportScreen />, mockClient({}), '/crm/import');
    const steps = Array.from(document.querySelectorAll('.stepper-item')).map((item) => item.textContent);
    expect(steps).toEqual(['1Upload', '2Map columns', '3Validate', '4Import']);
    expect(document.querySelector('.stepper-badge.step-current')?.textContent).toBe('1');
    expect(screen.getByRole('link', { name: 'Duplicate queue' })).toHaveAttribute('href', '/crm/import/duplicates');
  });
});
