import { describe, it, expect } from '@jest/globals';
import { SensitiveContentGuard } from './activity';
import { SensitiveContentGuard as KernelGuard } from '../../../kernel/domain/sensitive-content';

describe('AC-M04-04 SensitiveContentGuard re-export', () => {
  it('AC-M04-04 activity.ts re-exports the kernel guard', () => {
    expect(SensitiveContentGuard).toBe(KernelGuard);
  });
});
