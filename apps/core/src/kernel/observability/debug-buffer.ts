export interface BufferedEntry {
  t: number;
  level: 'debug' | 'info' | 'warn';
  event: string;
  msg: string;
  ctx?: Record<string, unknown>;
}

export class DebugBuffer {
  private entries_array: BufferedEntry[] = [];
  private maxEntries: number = 200;
  private maxBytes: number = 65536;
  dropped: number = 0;

  constructor(opts?: { maxEntries?: number; maxBytes?: number }) {
    if (opts?.maxEntries !== undefined) {
      this.maxEntries = opts.maxEntries;
    }
    if (opts?.maxBytes !== undefined) {
      this.maxBytes = opts.maxBytes;
    }
  }

  add(entry: BufferedEntry): void {
    // Check approximate size
    const entrySize = JSON.stringify(entry).length;

    // Check if we need to evict
    while (
      this.entries_array.length >= this.maxEntries ||
      this.getTotalBytes() + entrySize > this.maxBytes
    ) {
      if (this.entries_array.length === 0) break;
      this.entries_array.shift();
      this.dropped++;
    }

    this.entries_array.push(entry);
  }

  entries(): readonly BufferedEntry[] {
    return this.entries_array;
  }

  clear(): void {
    this.entries_array = [];
    this.dropped = 0;
  }

  private getTotalBytes(): number {
    return JSON.stringify(this.entries_array).length;
  }
}
