export interface StringScrubber {
  readonly name: string;
  scrub(value: string): string;
}

// Scrubbers replace every match inside a string and keep the surrounding text (02-observability §3).
// Order matters: Aadhaar (12 digits) runs before phone so it is not half-masked as a mobile.
// Aadhaar never starts with 0/1 (UIDAI); an ungrouped 91+[6-9]… run is a phone with country code, not Aadhaar.
const AADHAAR = /(?<![\d+])(?!91[6-9]\d{9}(?!\d))[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g;
const PHONE = /(?<![\d+])(?:\+91[\s-]?|91[\s-]?|0)?([6-9]\d{4})[\s-]?(\d{5})(?!\d)/g;
const EMAIL = /([A-Za-z0-9])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const PAN = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;

export const phoneScrubber: StringScrubber = {
  name: 'phone',
  scrub: (value: string): string => value.replace(PHONE, (_m, _a: string, b: string) => `+91******${b.slice(-4)}`),
};

export const emailScrubber: StringScrubber = {
  name: 'email',
  scrub: (value: string): string => value.replace(EMAIL, (_m, first: string, domain: string) => `${first}***${domain}`),
};

export const panScrubber: StringScrubber = {
  name: 'pan',
  scrub: (value: string): string => value.replace(PAN, '[PAN]'),
};

export const aadhaarScrubber: StringScrubber = {
  name: 'aadhaar',
  scrub: (value: string): string => value.replace(AADHAAR, '[AADHAAR]'),
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
