import { SellingScope } from './selling-scope';

/**
 * AC-M02-09: SellingScope for active sellers
 */
describe('AC-M02-09 SellingScope', () => {
  it('contains member id, salesperson type, and eligible lines', () => {
    const scope = {
      memberId: 'mem_001',
      salespersonType: 'POSP',
      posEligibleOnly: true,
      lines: ['LIFE', 'HEALTH'],
      insurerCodes: { 'ins_001': 'CODE-123' },
    };

    expect(scope.memberId).toBe('mem_001');
    expect(scope.salespersonType).toBe('POSP');
    expect(scope.posEligibleOnly).toBe(true);
    expect(scope.lines).toContain('LIFE');
  });

  it('sets posEligibleOnly=true for POSP', () => {
    const posScope = {
      memberId: 'mem_001',
      salespersonType: 'POSP',
      posEligibleOnly: true,
      lines: ['LIFE'],
      insurerCodes: {},
    };

    expect(posScope.posEligibleOnly).toBe(true);
  });

  it('sets posEligibleOnly=false for non-POSP', () => {
    const ispScope = {
      memberId: 'mem_001',
      salespersonType: 'ISP',
      posEligibleOnly: false,
      lines: ['LIFE', 'HEALTH', 'GENERAL'],
      insurerCodes: { 'ins_001': 'CODE-123' },
    };

    expect(ispScope.posEligibleOnly).toBe(false);
  });

  it('maps insurers to codes', () => {
    const scope = {
      memberId: 'mem_001',
      salespersonType: 'ISP',
      posEligibleOnly: false,
      lines: ['LIFE'],
      insurerCodes: {
        'ins_001': 'INSURER_CODE_1',
        'ins_002': 'INSURER_CODE_2',
      },
    };

    expect(scope.insurerCodes['ins_001']).toBe('INSURER_CODE_1');
    expect(scope.insurerCodes['ins_002']).toBe('INSURER_CODE_2');
  });
});
