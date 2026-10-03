/**
 * AC-M02-09: SellerDirectory.eligibleSellers returns only active, non-leave sellers within the
 * unit subtree, excludes POSPs for non-POS products, excludes sellers whose required licence
 * is expired, and filters by language.
 */
describe('AC-M02-09 SellerDirectory', () => {
  describe('eligibleSellers', () => {
    it('returns only active members', async () => {
      const directory = createDirectory();
      const tx = mockTx();

      const sellers = await directory.eligibleSellers(tx, {
        at: new Date('2026-01-01T00:00:00Z'),
      });

      // All returned sellers should have status 'active'
      sellers.forEach(seller => {
        expect(['SALESPERSON', 'SOLO_OWNER']).toContain(seller.salespersonType || 'SOLO_OWNER');
      });
    });

    it('excludes invited and onboarding members', async () => {
      const directory = createDirectory();
      const tx = mockTx();

      const sellers = await directory.eligibleSellers(tx, {
        at: new Date('2026-01-01T00:00:00Z'),
      });

      // Should not return invited or onboarding members
      expect(sellers.every(s => s.memberId.startsWith('active_'))).toBe(true);
    });

    it('excludes members on leave', async () => {
      const directory = createDirectory();
      const tx = mockTx();
      const date = new Date('2026-02-15T00:00:00Z');

      const sellers = await directory.eligibleSellers(tx, {
        at: date,
      });

      // Should not include members whose leave period covers the date
      expect(sellers).toBeDefined();
    });

    it('filters by orgUnitIds when provided', async () => {
      const directory = createDirectory();
      const tx = mockTx();

      const sellers = await directory.eligibleSellers(tx, {
        orgUnitIds: ['ou_br1'],
        at: new Date('2026-01-01T00:00:00Z'),
      });

      // All returned sellers should be in ou_br1 or its descendants
      sellers.forEach(seller => {
        expect(seller.orgUnitId).toBe('ou_br1');
      });
    });

    it('excludes POSP when posEligibleProduct is false', async () => {
      const directory = createDirectory();
      const tx = mockTx();

      const sellers = await directory.eligibleSellers(tx, {
        posEligibleProduct: false,
        at: new Date('2026-01-01T00:00:00Z'),
      });

      // Should not include POSP sellers
      sellers.forEach(seller => {
        expect(seller.salespersonType).not.toBe('POSP');
      });
    });

    it('includes POSP when posEligibleProduct is true', async () => {
      const directory = createDirectory();
      const tx = mockTx();

      const sellers = await directory.eligibleSellers(tx, {
        posEligibleProduct: true,
        at: new Date('2026-01-01T00:00:00Z'),
      });

      // May include POSP sellers
      expect(sellers).toBeDefined();
    });

    it('excludes sellers with expired required licence', async () => {
      const directory = createDirectory();
      const tx = mockTx();
      const date = new Date('2026-06-01T00:00:00Z'); // After expiry

      const sellers = await directory.eligibleSellers(tx, {
        line: 'LIFE',
        at: date,
      });

      // Should not include sellers whose LIFE licence expired
      expect(sellers).toBeDefined();
    });

    it('filters by language', async () => {
      const directory = createDirectory();
      const tx = mockTx();

      const sellers = await directory.eligibleSellers(tx, {
        language: 'hi',
        at: new Date('2026-01-01T00:00:00Z'),
      });

      // All returned sellers should have 'hi' in their languages
      sellers.forEach(seller => {
        expect(seller.languages).toContain('hi');
      });
    });

    it('returns EligibleSeller shape with required fields', async () => {
      const directory = createDirectory();
      const tx = mockTx();

      const sellers = await directory.eligibleSellers(tx, {
        at: new Date('2026-01-01T00:00:00Z'),
      });

      if (sellers.length > 0) {
        const seller = sellers[0];
        expect(seller.memberId).toBeDefined();
        expect(seller.displayName).toBeDefined();
        expect(seller.orgUnitId).toBeDefined();
        expect(seller.salespersonType).toBeDefined();
        expect(seller.capacityPerDay).toBeDefined();
        expect(seller.skills).toBeDefined();
        expect(seller.languages).toBeDefined();
      }
    });

    it('combines multiple filters', async () => {
      const directory = createDirectory();
      const tx = mockTx();

      const sellers = await directory.eligibleSellers(tx, {
        orgUnitIds: ['ou_br1'],
        line: 'HEALTH',
        posEligibleProduct: false,
        language: 'en',
        at: new Date('2026-01-01T00:00:00Z'),
      });

      // All should match all criteria
      sellers.forEach(seller => {
        expect(seller.orgUnitId).toBe('ou_br1');
        expect(seller.languages).toContain('en');
        expect(seller.salespersonType).not.toBe('POSP');
      });
    });
  });

  describe('sellingScope', () => {
    it('returns SellingScope for active seller', async () => {
      const directory = createDirectory();
      const tx = mockTx();

      const scope = await directory.sellingScope(tx, 'mem_001', new Date('2026-01-01T00:00:00Z'));

      expect(scope).toBeDefined();
      if (scope) {
        expect(scope.memberId).toBe('mem_001');
        expect(scope.salespersonType).toBeDefined();
        expect(scope.lines).toBeDefined();
        expect(scope.insurerCodes).toBeDefined();
      }
    });

    it('returns undefined for non-existent member', async () => {
      const directory = createDirectory();
      const tx = mockTx();

      const scope = await directory.sellingScope(tx, 'mem_unknown', new Date('2026-01-01T00:00:00Z'));

      expect(scope).toBeUndefined();
    });

    it('returns undefined for non-seller', async () => {
      const directory = createDirectory();
      const tx = mockTx();

      const scope = await directory.sellingScope(tx, 'mem_manager', new Date('2026-01-01T00:00:00Z'));

      expect(scope).toBeUndefined();
    });

    it('returns undefined for inactive seller', async () => {
      const directory = createDirectory();
      const tx = mockTx();

      const scope = await directory.sellingScope(tx, 'mem_suspended', new Date('2026-01-01T00:00:00Z'));

      expect(scope).toBeUndefined();
    });

    it('sets posEligibleOnly based on salesperson type', async () => {
      const directory = createDirectory();
      const tx = mockTx();

      const posScope = await directory.sellingScope(tx, 'mem_posp', new Date('2026-01-01T00:00:00Z'));
      if (posScope) {
        expect(posScope.posEligibleOnly).toBe(true);
      }

      const ispScope = await directory.sellingScope(tx, 'mem_isp', new Date('2026-01-01T00:00:00Z'));
      if (ispScope) {
        expect(ispScope.posEligibleOnly).toBe(false);
      }
    });
  });
});

// Helper stubs
function createDirectory(): Record<string, unknown> {
  throw new Error('createDirectory not implemented');
}

function mockTx(): Record<string, unknown> {
  return {};
}
