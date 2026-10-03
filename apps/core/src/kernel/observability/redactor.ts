export interface StringScrubber {
  readonly name: string;
  scrub(value: string): string;
}

export const phoneScrubber: StringScrubber = {
  name: 'phone',
  scrub: (value: string): string => {
    // Match Indian mobiles (+91/91/0 optional prefix, 10 digits starting 6-9)
    const match = value.match(/(?:\+91|91|0)?([6-9]\d{9})/);
    if (match) {
      return '+91' + '******' + match[1].slice(-4);
    }
    return value;
  },
};

export const emailScrubber: StringScrubber = {
  name: 'email',
  scrub: (value: string): string => {
    const atIndex = value.indexOf('@');
    if (atIndex > 0) {
      return value.charAt(0) + '***' + value.substring(atIndex);
    }
    return value;
  },
};

export const panScrubber: StringScrubber = {
  name: 'pan',
  scrub: (value: string): string => {
    if (/[A-Z]{5}[0-9]{4}[A-Z]/.test(value)) {
      return '[PAN]';
    }
    return value;
  },
};

export const aadhaarScrubber: StringScrubber = {
  name: 'aadhaar',
  scrub: (value: string): string => {
    // 12 digits optionally grouped 4-4-4 by space/hyphen
    if (/^\d{4}[\s-]?\d{4}[\s-]?\d{4}$/.test(value) || /^\d{12}$/.test(value)) {
      return '[AADHAAR]';
    }
    return value;
  },
};

export class Redactor {
  private scrubbers: StringScrubber[];
  private denyKeys: RegExp;
  private maxString: number;
  private maxArray: number;
  private maxDepth: number;

  constructor(opts?: {
    scrubbers?: StringScrubber[];
    denyKeys?: RegExp;
    maxString?: number;
    maxArray?: number;
    maxDepth?: number;
  }) {
    this.scrubbers = opts?.scrubbers ?? [
      aadhaarScrubber,
      phoneScrubber,
      emailScrubber,
      panScrubber,
    ];
    this.denyKeys =
      opts?.denyKeys ??
      /^(password|otp|token|authorization|secret|pan|aadhaar|dob|dateOfBirth|health.*|medical.*|nominee.*|bankAccount|ifsc|address.*|declaration.*)$/i;
    this.maxString = opts?.maxString ?? 256;
    this.maxArray = opts?.maxArray ?? 20;
    this.maxDepth = opts?.maxDepth ?? 4;
  }

  redact(value: unknown, depth = 0): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (depth > this.maxDepth) {
      return '[DEPTH]';
    }

    if (value instanceof Error) {
      return this.redactError(value);
    }

    if (typeof value === 'string') {
      return this.redactString(value);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      return this.redactArray(value, depth);
    }

    if (typeof value === 'object') {
      return this.redactObject(value, depth);
    }

    return value;
  }

  private redactError(error: Error): Record<string, unknown> {
    return {
      type: error.constructor.name,
      message: this.redactString(error.message),
    };
  }

  private redactArray(value: unknown[], depth: number): unknown[] {
    return value.slice(0, this.maxArray).map((item) => this.redact(item, depth + 1));
  }

  private redactObject(value: unknown, depth: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (this.denyKeys.test(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = this.redact(val, depth + 1);
      }
    }
    return result;
  }

  private redactString(value: string): string {
    let result = value;

    // Apply scrubbers
    for (const scrubber of this.scrubbers) {
      result = scrubber.scrub(result);
    }

    // Truncate if needed
    if (result.length > this.maxString) {
      return result.substring(0, this.maxString) + '…';
    }

    return result;
  }
}
