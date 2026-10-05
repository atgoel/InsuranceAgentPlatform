import { Injectable } from '@nestjs/common';
import { RecordScope, Transaction } from './ports';
import { PartyBookSegmentReader } from './ports';

/**
 * Late-bound holder of the M07 reader. M07 imports M03, so M03 cannot import M07's module; BookModule binds its reader here on init
 * (the same registration style as the My Work contributors).
 */
@Injectable()
export class BookSegmentSlot implements PartyBookSegmentReader {
  private reader?: PartyBookSegmentReader;

  bind(reader: PartyBookSegmentReader): void {
    this.reader = reader;
  }

  partyIdsWithDues(tx: Transaction, scope: RecordScope, today: string): Promise<string[]> {
    return this.bound().partyIdsWithDues(tx, scope, today);
  }

  partyIdsWithAnyPolicy(tx: Transaction, scope: RecordScope): Promise<string[]> {
    return this.bound().partyIdsWithAnyPolicy(tx, scope);
  }

  private bound(): PartyBookSegmentReader {
    if (!this.reader) throw new Error('PARTY_BOOK_SEGMENT_READER is not bound: the book module is not loaded');
    return this.reader;
  }
}
