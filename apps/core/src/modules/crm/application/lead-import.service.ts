import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DomainError, ValidationError } from '../../../kernel/errors/domain-errors';
import { PhoneNumber, EmailAddress } from '../../../kernel/domain';
import { Principal } from '../../../kernel/tenancy/principal';
import { ProductLine } from '../domain/lead';
import { LEAD_IMPORT_REPOSITORY, LeadImportRepository, Transaction } from './ports';
import { CrmContext } from './crm-context';
import { LeadCaptureService } from './lead-capture.service';

const MAX_ROWS = 5000;

export interface ImportRow {
  fullName: string;
  mobile?: string;
  email?: string;
  productInterest?: ProductLine;
  pincode?: string;
}

export interface LeadImportInput {
  fileChecksum: string;
  sourceTag: string;
  consentBasis: 'CAPTURED_AT_EVENT' | 'NONE';
  noticeVersion?: string;
  route?: boolean;
  rows: ImportRow[];
}

export interface ImportPreview {
  valid: number;
  duplicates: number;
  rejected: Array<{ row: number; reasons: string[] }>;
}

/** Bulk lead import (CRM08): validated rows go through the same capture path, idempotent by file and row (AC-M04-20). */
@Injectable()
export class LeadImportService {
  constructor(
    @Inject(LEAD_IMPORT_REPOSITORY) private readonly imports: LeadImportRepository,
    private readonly capture: LeadCaptureService,
    private readonly ctx: CrmContext,
  ) {}

  preview(principal: Principal, input: LeadImportInput): Promise<ImportPreview> {
    assertBatch(input);
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const rejected = rejections(input);
      const seen = await this.seenRows(tx, input);
      const valid = input.rows.filter((_, i) => !rejected.some((r) => r.row === i + 1) && !seen.has(i)).length;
      return { valid, duplicates: seen.size, rejected };
    });
  }

  commit(principal: Principal, input: LeadImportInput) {
    assertBatch(input);
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const existing = await this.imports.findBatchByChecksum(tx, input.fileChecksum);
      if (existing) return { batchId: existing.id, imported: 0, duplicates: 0, rejected: [], skippedAlreadyImported: input.rows.length };
      const batchId = this.ctx.ids.next('imp');
      const rejected = rejections(input);
      const summary = { imported: 0, duplicates: 0, rejected: rejected.length, skippedAlreadyImported: 0 };
      for (const [i, row] of input.rows.entries()) {
        if (rejected.some((r) => r.row === i + 1)) continue;
        const hash = rowHash(row);
        if (await this.imports.rowSeen(tx, hash)) {
          summary.skippedAlreadyImported += 1;
          continue;
        }
        const result = await this.capture.captureIn(tx, toCapture(row, input), { kind: 'STAFF', principal });
        if (result.deduplicated) summary.duplicates += 1;
        else summary.imported += 1;
        await this.imports.markRow(tx, hash, batchId);
      }
      await this.imports.saveBatch(tx, { id: batchId, fileChecksum: input.fileChecksum, sourceTag: input.sourceTag, summary, createdAt: this.ctx.clock.now().toISOString() });
      await this.ctx.recorder.record(tx, { audit: { action: 'crm.lead_import.committed', entityType: 'lead_import', entityId: batchId, metadata: { ...summary, sourceTag: input.sourceTag } } });
      return { batchId, ...summary, rejected };
    });
  }

  private async seenRows(tx: Transaction, input: LeadImportInput): Promise<Set<number>> {
    const seen = new Set<number>();
    for (const [i, row] of input.rows.entries()) if (await this.imports.rowSeen(tx, rowHash(row))) seen.add(i);
    return seen;
  }
}

function assertBatch(input: LeadImportInput): void {
  if (input.rows.length > MAX_ROWS) throw new ValidationError('too_many_rows', `At most ${MAX_ROWS} rows per import`);
  if (input.consentBasis === 'CAPTURED_AT_EVENT' && !input.noticeVersion) {
    throw new ValidationError('notice_version_required', 'Consent captured at an event needs the notice version shown');
  }
}

function rejections(input: LeadImportInput): Array<{ row: number; reasons: string[] }> {
  return input.rows.flatMap((row, i) => {
    const reasons = rowProblems(row);
    return reasons.length ? [{ row: i + 1, reasons }] : [];
  });
}

function rowProblems(row: ImportRow): string[] {
  const reasons: string[] = [];
  if (!row.fullName || row.fullName.trim().length < 2) reasons.push('Name is missing');
  if (!row.mobile && !row.email) reasons.push('No mobile or e-mail');
  if (row.mobile && !parses(() => PhoneNumber.parse(row.mobile as string))) reasons.push('Invalid mobile');
  if (row.email && !parses(() => EmailAddress.parse(row.email as string))) reasons.push('Invalid e-mail');
  if (row.pincode && !/^[1-9][0-9]{5}$/.test(row.pincode)) reasons.push('Invalid pincode');
  return reasons;
}

function parses(fn: () => unknown): boolean {
  try {
    fn();
    return true;
  } catch (e) {
    if (e instanceof DomainError) return false;
    throw e;
  }
}

/** Row identity for idempotency: normalised contact + name (no raw values are stored, only the hash). */
function rowHash(row: ImportRow): string {
  const mobile = row.mobile && parses(() => PhoneNumber.parse(row.mobile as string)) ? PhoneNumber.parse(row.mobile).e164 : '';
  const key = [row.fullName.trim().toLowerCase(), mobile, (row.email ?? '').trim().toLowerCase()].join('|');
  return createHash('sha256').update(key).digest('hex');
}

function toCapture(row: ImportRow, input: LeadImportInput) {
  const granted = input.consentBasis === 'CAPTURED_AT_EVENT';
  return {
    fullName: row.fullName.trim(), mobile: row.mobile, email: row.email, productInterest: row.productInterest ?? 'OTHER', pincode: row.pincode,
    source: 'IMPORT' as const, touchRef: input.sourceTag,
    consent: {
      granted, noticeVersion: input.noticeVersion ?? 'none', evidenceRef: `import:${input.fileChecksum}`,
      channels: ['CALL', 'WHATSAPP', 'SMS'] as Array<'CALL' | 'WHATSAPP' | 'SMS'>, purposes: ['SERVICE', 'MARKETING'] as Array<'SERVICE' | 'MARKETING'>,
    },
  };
}
