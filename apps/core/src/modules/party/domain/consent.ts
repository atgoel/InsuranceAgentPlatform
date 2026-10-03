export type ConsentPurpose = 'SERVICE' | 'MARKETING' | 'AI_PROCESSING' | 'DATA_SHARING_INSURER';
export type ConsentChannel = 'WHATSAPP' | 'SMS' | 'EMAIL' | 'CALL' | 'ANY';

export interface ConsentRecord {
  readonly id: string;
  readonly partyId: string;
  readonly purpose: ConsentPurpose;
  readonly channel: ConsentChannel;
  readonly granted: boolean;
  readonly noticeVersion: string;
  readonly source: 'WEB_FORM' | 'ASSISTED' | 'IMPORT' | 'CUSTOMER_LINK' | 'SIGNUP';
  readonly evidenceRef?: string;
  readonly capturedBy: string;
  readonly occurredAt: string;
}

export class ConsentLedger {
  private readonly records_: ConsentRecord[];

  constructor(records: ConsentRecord[]) {
    this.records_ = [...records].sort((a, b) => {
      const timeCmp = new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
      if (timeCmp !== 0) return timeCmp;
      return a.id.localeCompare(b.id);
    });
  }

  append(r: ConsentRecord): ConsentLedger {
    return new ConsentLedger([...this.records_, r]);
  }

  stateFor(purpose: ConsentPurpose, channel: Exclude<ConsentChannel, 'ANY'>): { granted: boolean; record?: ConsentRecord } {
    const specificChannelRecords = this.records_.filter(
      (r) => r.purpose === purpose && r.channel === channel
    );
    const anyChannelRecords = this.records_.filter(
      (r) => r.purpose === purpose && r.channel === 'ANY'
    );

    const latestSpecific = specificChannelRecords.length > 0 ? specificChannelRecords[specificChannelRecords.length - 1] : undefined;
    const latestAny = anyChannelRecords.length > 0 ? anyChannelRecords[anyChannelRecords.length - 1] : undefined;

    if (!latestSpecific && !latestAny) {
      return { granted: false };
    }

    if (!latestSpecific) {
      return { granted: latestAny!.granted, record: latestAny };
    }

    if (!latestAny) {
      return { granted: latestSpecific.granted, record: latestSpecific };
    }

    const specificTime = new Date(latestSpecific.occurredAt).getTime();
    const anyTime = new Date(latestAny.occurredAt).getTime();

    if (anyTime > specificTime) {
      return { granted: latestAny.granted, record: latestAny };
    }

    return { granted: latestSpecific.granted, record: latestSpecific };
  }

  summary(): Array<{
    purpose: ConsentPurpose;
    channel: ConsentChannel;
    granted: boolean;
    occurredAt: string;
    noticeVersion: string;
  }> {
    const latestPerPair = new Map<string, ConsentRecord>();
    for (const record of this.records_) {
      const key = `${record.purpose}:${record.channel}`;
      latestPerPair.set(key, record);
    }

    return Array.from(latestPerPair.values()).map((r) => ({
      purpose: r.purpose,
      channel: r.channel,
      granted: r.granted,
      occurredAt: r.occurredAt,
      noticeVersion: r.noticeVersion,
    }));
  }

  history(): readonly ConsentRecord[] {
    return Object.freeze([...this.records_]);
  }
}
