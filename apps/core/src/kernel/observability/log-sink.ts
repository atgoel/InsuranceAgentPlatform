import { LogRecord } from './log-record';

export interface LogSink {
  write(record: LogRecord): void;
}

export class MemoryLogSink implements LogSink {
  readonly records: LogRecord[] = [];

  write(record: LogRecord): void {
    this.records.push(record);
  }

  byEvent(event: string): LogRecord[] {
    return this.records.filter((r) => r.event === event);
  }

  clear(): void {
    this.records.length = 0;
  }
}
