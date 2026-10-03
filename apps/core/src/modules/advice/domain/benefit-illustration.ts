import { BusinessRuleError, ValidationError } from '../../../kernel/errors/domain-errors';

/** M13 document pointer; until M13 an opaque, pattern-checked string. */
export const DOCUMENT_REF = /^doc_[A-Z0-9]{26}$/;

export type AcknowledgementMethod = 'CUSTOMER_LINK' | 'ASSISTED';

export interface Acknowledgement {
  method: AcknowledgementMethod;
  at: string;
  by: string;
  evidenceRef?: string;
}

export interface BiRecordProps {
  id: string;
  quoteOptionId: string;
  documentRef: string;
  insurerBiVersion: string;
  uploadedBy: string;
  uploadedAt: string;
  acknowledgement?: Acknowledgement;
  version: number;
}

/** F75 evidence of the insurer-generated benefit illustration; the platform never computes one. */
export class BiRecord {
  static attach(input: { id: string; quoteOptionId: string; documentRef: string; insurerBiVersion: string; uploadedBy: string; now: Date }): BiRecord {
    assertDocumentRef('documentRef', input.documentRef);
    const biVersion = input.insurerBiVersion.trim();
    if (biVersion.length < 1 || biVersion.length > 64) {
      throw new ValidationError('invalid_bi_version', 'Insurer BI version must be 1 to 64 characters', [{ path: 'insurerBiVersion', code: 'length', message: '1 to 64 characters' }]);
    }
    return new BiRecord({
      id: input.id,
      quoteOptionId: input.quoteOptionId,
      documentRef: input.documentRef,
      insurerBiVersion: biVersion,
      uploadedBy: input.uploadedBy,
      uploadedAt: input.now.toISOString(),
      version: 1,
    });
  }

  static restore(props: BiRecordProps): BiRecord {
    return new BiRecord(props);
  }

  private constructor(private _props: BiRecordProps) {}

  get props(): Readonly<BiRecordProps> {
    return this._props;
  }

  get acknowledged(): boolean {
    return !!this._props.acknowledgement;
  }

  markSaved(): void {
    this._props = { ...this._props, version: this._props.version + 1 };
  }

  /** Once only; an ASSISTED acknowledgement needs evidence (e.g. a photo of the signed form). */
  acknowledge(ack: { method: AcknowledgementMethod; by: string; evidenceRef?: string }, now: Date): void {
    if (this._props.acknowledgement) throw new BusinessRuleError('bi_already_acknowledged', 'This benefit illustration has already been acknowledged');
    if (ack.method === 'ASSISTED' && !ack.evidenceRef) {
      throw new ValidationError('evidence_required', 'An assisted acknowledgement needs an evidence document', [{ path: 'evidenceRef', code: 'required', message: 'Required for ASSISTED' }]);
    }
    if (ack.evidenceRef) assertDocumentRef('evidenceRef', ack.evidenceRef);
    this._props = { ...this._props, acknowledgement: { method: ack.method, at: now.toISOString(), by: ack.by, evidenceRef: ack.evidenceRef } };
  }
}

function assertDocumentRef(path: string, value: string): void {
  if (!DOCUMENT_REF.test(value)) throw new ValidationError('invalid_document_ref', 'Not a document reference', [{ path, code: 'pattern', message: 'Must look like doc_ followed by 26 characters' }]);
}
