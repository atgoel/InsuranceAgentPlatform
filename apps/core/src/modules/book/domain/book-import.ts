import { BusinessRuleError, ValidationError } from '../../../kernel/errors/domain-errors';
import { importDate, ParsedPolicy, parseImportRow } from './book-import-values';
export { parseImportRow } from './book-import-values';
export type { ParsedPolicy } from './book-import-values';
export type ImportFormat = 'CSV_TEMPLATE' | 'LIC_PORTAL' | 'GENERIC_PORTAL' | 'OFFICE_SALES_REGISTER';
export interface ColumnMapping {
  [canonical: string]: string;
}
export interface ImportRow {
  rowNo: number;
  raw: Record<string, string>;
  parsed?: ParsedPolicy;
  problems: string[];
  warnings?: string[];
  match?: {
    kind: 'NEW' | 'DUPLICATE_IN_BOOK' | 'DUPLICATE_IN_FILE' | 'UPDATE';
    heldPolicyId?: string;
  };
  decision?: 'IMPORT' | 'SKIP' | 'UPDATE';
  referrerSuggestions?: Array<{
    memberId?: string;
    partyId?: string;
    name: string;
  }>;
  committed?: boolean;
}
export interface RowValidator {
  validate(row: Record<string, string>): string[];
}
export interface BookMatcher {
  match(row: ParsedPolicy): Promise<ImportRow['match']>;
}
export interface ImportSummary {
  imported: number;
  updated: number;
  skipped: number;
  parties: {
    created: number;
    linked: number;
  };
}
export interface ImportBatchProps {
  id: string;
  format: ImportFormat;
  fileChecksum: string;
  asOf: string;
  ownerMemberId: string;
  orgUnitId?: string;
  state: 'UPLOADED' | 'MAPPED' | 'VALIDATED' | 'REVIEWED' | 'COMMITTED' | 'DISCARDED';
  mapping: ColumnMapping;
  rows: ImportRow[];
  summary: ImportSummary;
  createdAt: string;
  version: number;
}
const SYNONYMS: Record<string, string> = {
  policyno: 'policyNumber',
  policynumber: 'policyNumber',
  companyname: 'insurerName',
  insurername: 'insurerName',
  clientname: 'holderName',
  holdername: 'holderName',
  planname: 'productName',
  productname: 'productName',
  contactno: 'mobile',
  mobile: 'mobile',
  email: 'email',
  proposerdob: 'dob',
  dob: 'dob',
  bookingdate: 'bookedOn',
  riskstartdate: 'commencementDate',
  commencementdate: 'commencementDate',
  policyenddate: 'expiryDate',
  expirydate: 'expiryDate',
  type: 'category',
  category: 'category',
  line: 'line',
  familysizemodel: 'familySizeOrModel',
  regnno: 'registrationNo',
  regnyear: 'registrationYear',
  siidv: 'sumAssured',
  sumassured: 'sumAssured',
  finalpremium: 'premiumGross',
  premwithgst: 'premiumGross',
  premiumwogst: 'premiumNet',
  premiumgross: 'premiumGross',
  premiumnet: 'premiumNet',
  premiumtax: 'premiumTax',
  premium: 'premium',
  odpremium: 'odPremium',
  tppremium: 'tpPremium',
  ncb: 'ncb',
  ncbyesnopy: 'ncb',
  intermediary: 'bookingChannelCode',
  portfreshrollover: 'businessType',
  businesstype: 'businessType',
  term: 'policyTerm',
  remarks: 'remarks',
  remarks2: 'commissionRemarks',
  reference: 'referredByName',
  source: 'businessSource',
  commission: 'commissionAmount',
  percent: 'commissionRatePct',
  invoiceno: 'invoiceNo',
  mode: 'mode',
  nextduedate: 'nextDueDate',
  maturitydate: 'maturityDate',
  renewaldate: 'renewalDate',
  status: 'status',
};
export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  let remarks = 0;
  for (const header of headers) {
    const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '');
    let key = header.trim() === '%' ? 'commissionRatePct' : SYNONYMS[normalized];
    if (normalized === 'remarks') key = ++remarks === 1 ? 'remarks' : 'commissionRemarks';
    if (header.startsWith('custom:') || header.startsWith('risk:')) key = header;
    if (key) mapping[key] = header;
  }
  return mapping;
}
export class ImportBatch {
  private constructor(private value: ImportBatchProps) {}
  static upload(input: {
    id: string;
    format: ImportFormat;
    fileChecksum: string;
    asOf: string;
    rows: Record<string, string>[];
    now: Date;
    ownerMemberId: string;
    orgUnitId?: string;
  }): ImportBatch {
    if (input.rows.length > 5000 || !input.rows.length || !importDate(input.asOf))
      throw new ValidationError('invalid_import', 'Import needs 1–5000 rows and a valid as-of date');
    return new ImportBatch({
      id: input.id,
      format: input.format,
      fileChecksum: input.fileChecksum,
      asOf: input.asOf,
      ownerMemberId: input.ownerMemberId,
      orgUnitId: input.orgUnitId,
      state: 'UPLOADED',
      mapping: {},
      rows: input.rows.map((raw, i) => ({ rowNo: i + 1, raw: structuredClone(raw), problems: [] })),
      summary: { imported: 0, updated: 0, skipped: 0, parties: { created: 0, linked: 0 } },
      createdAt: input.now.toISOString(),
      version: 0,
    });
  }
  static restore(props: ImportBatchProps): ImportBatch {
    return new ImportBatch(structuredClone(props));
  }
  get props(): Readonly<ImportBatchProps> {
    return structuredClone(this.value);
  }
  markSaved(): void {
    this.value.version++;
  }
  map(mapping: ColumnMapping): void {
    this.editable();
    this.value.mapping = { ...mapping };
    this.value.state = 'MAPPED';
  }
  async validate(validator: RowValidator, matcher: BookMatcher): Promise<void> {
    this.editable();
    const seen = new Set<string>();
    for (const row of this.value.rows) {
      const result = parseImportRow(row.raw, this.value.mapping, this.value.asOf);
      row.parsed = result.parsed;
      row.problems = [...result.problems, ...validator.validate(row.raw)];
      row.warnings = result.warnings;
      if (row.parsed) {
        row.match = seen.has(row.parsed.policyNumber) ? { kind: 'DUPLICATE_IN_FILE' } : await matcher.match(row.parsed);
        seen.add(row.parsed.policyNumber);
        row.decision = row.match?.kind === 'NEW' ? 'IMPORT' : row.match?.kind === 'UPDATE' ? 'UPDATE' : 'SKIP';
      }
    }
    this.value.state = 'VALIDATED';
  }
  replaceRows(rows: ImportRow[]): void {
    this.editable();
    this.value.rows = structuredClone(rows);
    this.value.state = 'VALIDATED';
  }
  decide(rowNo: number, decision: ImportRow['decision']): void {
    this.editable();
    const row = this.value.rows.find((r) => r.rowNo === rowNo);
    if (!row) throw new ValidationError('invalid_row', 'Unknown import row');
    row.decision = decision;
    this.value.state = 'REVIEWED';
  }
  confirmReferrer(
    rowNo: number,
    link: {
      memberId?: string;
      partyId?: string;
    },
  ): void {
    this.editable();
    const row = this.value.rows.find((r) => r.rowNo === rowNo);
    if (!row?.parsed?.commercials.referredBy) throw new ValidationError('referrer_missing', 'Row has no referrer');
    Object.assign(row.parsed.commercials.referredBy, link);
  }
  readyToCommit(): boolean {
    return (
      ['VALIDATED', 'REVIEWED'].includes(this.value.state) &&
      this.value.rows.every((r) => r.decision !== undefined && (r.decision === 'SKIP' || r.problems.length === 0))
    );
  }
  finishRows(rowNos: number[], summary: ImportSummary): void {
    for (const row of this.value.rows)
      if (rowNos.includes(row.rowNo)) {
        row.committed = true;
        row.raw = {};
        row.parsed = undefined;
      }
    this.value.summary = structuredClone(summary);
  }
  committed(summary: ImportSummary): void {
    this.value.summary = structuredClone(summary);
    this.value.rows = [];
    this.value.state = 'COMMITTED';
  }
  discard(): void {
    this.value.rows = [];
    this.value.state = 'DISCARDED';
  }
  private editable(): void {
    if (['COMMITTED', 'DISCARDED'].includes(this.value.state)) throw new BusinessRuleError('import_closed', 'Import is closed');
    if (this.value.rows.some((row) => row.committed))
      throw new BusinessRuleError('import_committing', 'Import review is frozen once committing begins');
  }
}
