import { describe, it, expect } from '@jest/globals';
import {
  ComparisonScopeEngine,
  type ScopeInput,
  type ProductVersionProps,
  type Insurer,
} from './scope-engine';

/**
 * AC-M05-02: Scope engine (LA-6): an IMF ISP sees only tied insurers' versions for the line;
 * a broker sees every channel-permitted insurer; a POSP sees only POS-eligible versions;
 * an individual agent sees only the appointing insurer; each exclusion carries the first
 * failing reason.
 *
 * AC-M05-03: Versions not effective on the date, of inactive insurers, not permitted for
 * the channel or outside the salesperson's licensed lines are excluded.
 */
describe('AC-M05-02, AC-M05-03 ComparisonScopeEngine', () => {
  const today = '2026-10-03';

  const activeInsurer: Insurer = {
    id: 'ins_1',
    name: 'Active Insurer',
    irdaiRegNo: 'REG001',
    lines: ['LIFE', 'HEALTH'],
    active: true,
  };

  const inactiveInsurer: Insurer = {
    id: 'ins_2',
    name: 'Inactive Insurer',
    irdaiRegNo: 'REG002',
    lines: ['LIFE'],
    active: false,
  };

  const effectiveVersion: ProductVersionProps = {
    id: 'pv_1',
    productId: 'prod_1',
    insurerId: 'ins_1',
    line: 'LIFE',
    uin: 'ABC123DEF456',
    wordingVersion: 'v1.0',
    posEligible: true,
    channels: ['IMF', 'BROKER'],
    effectiveFrom: '2026-10-01',
    effectiveTo: '2026-10-31',
    status: 'active',
    quoteRequirements: [],
    keyFacts: [],
  };

  const notEffectiveVersion: ProductVersionProps = {
    id: 'pv_2',
    productId: 'prod_2',
    insurerId: 'ins_1',
    line: 'LIFE',
    uin: 'XYZ789GHI123',
    wordingVersion: 'v1.0',
    posEligible: true,
    channels: ['IMF'],
    effectiveFrom: '2026-10-04',
    status: 'active',
    quoteRequirements: [],
    keyFacts: [],
  };

  const notChannelPermittedVersion: ProductVersionProps = {
    id: 'pv_3',
    productId: 'prod_3',
    insurerId: 'ins_1',
    line: 'LIFE',
    uin: 'PQR456STU789',
    wordingVersion: 'v1.0',
    posEligible: true,
    channels: ['CORPORATE_AGENT'],
    effectiveFrom: '2026-10-01',
    effectiveTo: '2026-10-31',
    status: 'active',
    quoteRequirements: [],
    keyFacts: [],
  };

  const inactivInsurerVersion: ProductVersionProps = {
    id: 'pv_4',
    productId: 'prod_4',
    insurerId: 'ins_2',
    line: 'LIFE',
    uin: 'JKL012MNO345',
    wordingVersion: 'v1.0',
    posEligible: true,
    channels: ['IMF'],
    effectiveFrom: '2026-10-01',
    effectiveTo: '2026-10-31',
    status: 'active',
    quoteRequirements: [],
    keyFacts: [],
  };

  const notPosEligibleVersion: ProductVersionProps = {
    id: 'pv_5',
    productId: 'prod_5',
    insurerId: 'ins_1',
    line: 'LIFE',
    uin: 'DEF678GHI901',
    wordingVersion: 'v1.0',
    posEligible: false,
    channels: ['IMF'],
    effectiveFrom: '2026-10-01',
    effectiveTo: '2026-10-31',
    status: 'active',
    quoteRequirements: [],
    keyFacts: [],
  };

  const healthLineVersion: ProductVersionProps = {
    id: 'pv_6',
    productId: 'prod_6',
    insurerId: 'ins_1',
    line: 'HEALTH',
    uin: 'GHI901JKL234',
    wordingVersion: 'v1.0',
    posEligible: true,
    channels: ['IMF'],
    effectiveFrom: '2026-10-01',
    effectiveTo: '2026-10-31',
    status: 'active',
    quoteRequirements: [],
    keyFacts: [],
  };

  const withdrawnVersion: ProductVersionProps = {
    id: 'pv_7',
    productId: 'prod_7',
    insurerId: 'ins_1',
    line: 'LIFE',
    uin: 'JKL234MNO567',
    wordingVersion: 'v1.0',
    posEligible: true,
    channels: ['IMF'],
    effectiveFrom: '2026-10-01',
    effectiveTo: '2026-10-02',
    status: 'withdrawn',
    quoteRequirements: [],
    keyFacts: [],
  };

  const draftVersion: ProductVersionProps = {
    id: 'pv_8',
    productId: 'prod_8',
    insurerId: 'ins_1',
    line: 'LIFE',
    uin: 'MNO567PQR890',
    wordingVersion: 'v1.0',
    posEligible: true,
    channels: ['IMF'],
    effectiveFrom: '2026-10-01',
    effectiveTo: '2026-10-31',
    status: 'draft',
    quoteRequirements: [],
    keyFacts: [],
  };

  describe('default filter order and first failing filter gives reason', () => {
    it('excludes not_effective when version is not active', () => {
      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [draftVersion],
        insurers: [activeInsurer],
      });

      expect(result.excluded).toContainEqual({ versionId: 'pv_8', reason: 'not_effective' });
    });

    it('excludes not_effective when version effectiveFrom is in future', () => {
      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [notEffectiveVersion],
        insurers: [activeInsurer],
      });

      expect(result.excluded).toContainEqual({ versionId: 'pv_2', reason: 'not_effective' });
    });

    it('excludes not_effective when version is withdrawn and past effectiveTo', () => {
      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [withdrawnVersion],
        insurers: [activeInsurer],
      });

      expect(result.excluded).toContainEqual({ versionId: 'pv_7', reason: 'not_effective' });
    });

    it('returns insurer_inactive for version of inactive insurer (checked after effective)', () => {
      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: ['ins_2'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [inactivInsurerVersion],
        insurers: [inactiveInsurer],
      });

      expect(result.excluded).toContainEqual({ versionId: 'pv_4', reason: 'insurer_inactive' });
    });

    it('returns channel_not_permitted for version not in channel before tie-up check', () => {
      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'BROKER',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [notChannelPermittedVersion],
        insurers: [activeInsurer],
      });

      expect(result.excluded).toContainEqual({ versionId: 'pv_3', reason: 'channel_not_permitted' });
    });

    it('returns insurer_not_tied for TIED_INSURERS scope when insurer not in tie-ups', () => {
      const anotherInsurer: Insurer = {
        id: 'ins_3',
        name: 'Another Insurer',
        irdaiRegNo: 'REG003',
        lines: ['LIFE'],
        active: true,
      };

      const anotherVersion: ProductVersionProps = {
        id: 'pv_9',
        productId: 'prod_9',
        insurerId: 'ins_3',
        line: 'LIFE',
        uin: 'UVW901XYZ234',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [anotherVersion],
        insurers: [anotherInsurer],
      });

      expect(result.excluded).toContainEqual({ versionId: 'pv_9', reason: 'insurer_not_tied' });
    });

    it('returns not_pos_eligible when salesperson is POSP and version not posEligible', () => {
      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'POSP', lines: ['LIFE'] },
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [notPosEligibleVersion],
        insurers: [activeInsurer],
      });

      expect(result.excluded).toContainEqual({ versionId: 'pv_5', reason: 'not_pos_eligible' });
    });

    it('returns line_not_licensed when salesperson does not have the line', () => {
      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: ['ins_1'], HEALTH: [] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [healthLineVersion],
        insurers: [activeInsurer],
      });

      expect(result.excluded).toContainEqual({ versionId: 'pv_6', reason: 'line_not_licensed' });
    });

    it('filters by line when provided in input', () => {
      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: ['ins_1'], HEALTH: ['ins_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE', 'HEALTH'] },
        line: 'HEALTH',
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [effectiveVersion, healthLineVersion],
        insurers: [activeInsurer],
      });

      expect(result.versions).toHaveLength(1);
      expect(result.versions[0].versionId).toBe('pv_6');
    });

    it('excludes versions outside requested line with filtered_out reason', () => {
      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: ['ins_1'], HEALTH: ['ins_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE', 'HEALTH'] },
        line: 'HEALTH',
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [effectiveVersion],
        insurers: [activeInsurer],
      });

      expect(result.excluded).toContainEqual({ versionId: 'pv_1', reason: 'filtered_out' });
    });
  });

  describe('scope variants', () => {
    it('MARKET_WIDE broker sees all channel-permitted versions', () => {
      const ins1 = activeInsurer;
      const ins2: Insurer = {
        id: 'ins_2b',
        name: 'Another Active',
        irdaiRegNo: 'REG002B',
        lines: ['LIFE'],
        active: true,
      };

      const version1: ProductVersionProps = {
        id: 'pv_mw_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['BROKER'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const version2: ProductVersionProps = {
        id: 'pv_mw_2',
        productId: 'prod_2',
        insurerId: 'ins_2b',
        line: 'LIFE',
        uin: 'XYZ789GHI123',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['BROKER'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'BROKER',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: [] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [version1, version2],
        insurers: [ins1, ins2],
      });

      expect(result.versions).toHaveLength(2);
      expect(result.versions.map((v: { versionId: string }) => v.versionId).sort()).toEqual(['pv_mw_1', 'pv_mw_2']);
    });

    it('TIED_INSURERS IMF only sees tied insurers per line', () => {
      const ins1 = activeInsurer;
      const ins2: Insurer = {
        id: 'ins_tied_2',
        name: 'Tied Insurer 2',
        irdaiRegNo: 'REG_TIED_2',
        lines: ['LIFE', 'HEALTH'],
        active: true,
      };
      const ins3: Insurer = {
        id: 'ins_not_tied',
        name: 'Not Tied',
        irdaiRegNo: 'REG_NOT_TIED',
        lines: ['LIFE'],
        active: true,
      };

      const versionTied1: ProductVersionProps = {
        id: 'pv_tied_1',
        productId: 'prod_tied_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'TIED001LIF000',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const versionTied2: ProductVersionProps = {
        id: 'pv_tied_2',
        productId: 'prod_tied_2',
        insurerId: 'ins_tied_2',
        line: 'LIFE',
        uin: 'TIED002LIF000',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const versionNotTied: ProductVersionProps = {
        id: 'pv_not_tied',
        productId: 'prod_not_tied',
        insurerId: 'ins_not_tied',
        line: 'LIFE',
        uin: 'NOTIE001LIF000',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_1', 'ins_tied_2'], HEALTH: ['ins_tied_2'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [versionTied1, versionTied2, versionNotTied],
        insurers: [ins1, ins2, ins3],
      });

      expect(result.versions).toHaveLength(2);
      expect(result.versions.map((v: { versionId: string }) => v.versionId).sort()).toEqual(['pv_tied_1', 'pv_tied_2']);
    });

    it('POSP sees only posEligible versions', () => {
      const posEligibleVersion: ProductVersionProps = {
        id: 'pv_pos_elig',
        productId: 'prod_pos',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'POS_ELI001000',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const notPosEligible: ProductVersionProps = {
        id: 'pv_not_pos',
        productId: 'prod_not_pos',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'NOTPOS001000',
        wordingVersion: 'v1.0',
        posEligible: false,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'POSP', lines: ['LIFE'] },
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [posEligibleVersion, notPosEligible],
        insurers: [activeInsurer],
      });

      expect(result.versions).toHaveLength(1);
      expect(result.versions[0].versionId).toBe('pv_pos_elig');
    });
  });

  describe('result structure', () => {
    it('returns insurerIds unique and sorted', () => {
      const ins1 = activeInsurer;
      const ins2: Insurer = {
        id: 'ins_alpha',
        name: 'Alpha Insurer',
        irdaiRegNo: 'REG_ALPHA',
        lines: ['LIFE'],
        active: true,
      };
      const ins3: Insurer = {
        id: 'ins_beta',
        name: 'Beta Insurer',
        irdaiRegNo: 'REG_BETA',
        lines: ['LIFE'],
        active: true,
      };

      const version1: ProductVersionProps = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['BROKER'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const version2: ProductVersionProps = {
        id: 'pv_2',
        productId: 'prod_2',
        insurerId: 'ins_beta',
        line: 'LIFE',
        uin: 'XYZ789GHI123',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['BROKER'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const version3: ProductVersionProps = {
        id: 'pv_3',
        productId: 'prod_3',
        insurerId: 'ins_alpha',
        line: 'LIFE',
        uin: 'PQR456STU789',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['BROKER'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'BROKER',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: [] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [version1, version2, version3],
        insurers: [ins1, ins2, ins3],
      });

      expect(result.insurerIds).toEqual(['ins_1', 'ins_alpha', 'ins_beta']);
    });

    it('returns excluded list with every non-included version and its reason', () => {
      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [
          effectiveVersion,
          notEffectiveVersion,
          notChannelPermittedVersion,
          notPosEligibleVersion,
          healthLineVersion,
        ],
        insurers: [activeInsurer],
      });

      expect(result.excluded).toHaveLength(4);
      expect(result.excluded).toContainEqual({ versionId: 'pv_2', reason: 'not_effective' });
      expect(result.excluded).toContainEqual({ versionId: 'pv_3', reason: 'channel_not_permitted' });
      expect(result.excluded).toContainEqual({ versionId: 'pv_5', reason: 'not_pos_eligible' });
      expect(result.excluded).toContainEqual({ versionId: 'pv_6', reason: 'line_not_licensed' });
    });

    it('includes ScopedVersion entries with versionId, productId, insurerId, line', () => {
      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'IMF',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: ['ins_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [effectiveVersion],
        insurers: [activeInsurer],
      });

      expect(result.versions).toHaveLength(1);
      expect(result.versions[0]).toEqual({
        versionId: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
      });
    });

    it('includes disclosure text in result', () => {
      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'BROKER',
        comparisonScope: 'MARKET_WIDE',
        tiedInsurerIds: { LIFE: [] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [effectiveVersion],
        insurers: [activeInsurer],
      });

      expect(result.disclosure).toBe('Broker view: comparing across all configured insurers (Active Insurer). Advice is documented in the advice record.');
    });
  });

  describe('INDIVIDUAL_AGENT scope behavior', () => {
    it('INDIVIDUAL_AGENT sees only one insurer per line (the appointed one)', () => {
      const ins1: Insurer = {
        id: 'ins_appt',
        name: 'Appointing Insurer',
        irdaiRegNo: 'REG_APPT',
        lines: ['LIFE', 'HEALTH'],
        active: true,
      };

      const version1: ProductVersionProps = {
        id: 'pv_appt',
        productId: 'prod_appt',
        insurerId: 'ins_appt',
        line: 'LIFE',
        uin: 'APPT001LIF000',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['INDIVIDUAL_AGENT'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'INDIVIDUAL_AGENT',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_appt'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [version1],
        insurers: [ins1],
      });

      expect(result.versions).toHaveLength(1);
      expect(result.versions[0].insurerId).toBe('ins_appt');
    });
  });

  describe('CORPORATE_AGENT scope behavior', () => {
    it('CORPORATE_AGENT with TIED_INSURERS sees only tied insurers', () => {
      const ins1: Insurer = {
        id: 'ins_corp_1',
        name: 'Corporate Insurer 1',
        irdaiRegNo: 'REG_CORP_1',
        lines: ['LIFE'],
        active: true,
      };

      const version1: ProductVersionProps = {
        id: 'pv_corp',
        productId: 'prod_corp',
        insurerId: 'ins_corp_1',
        line: 'LIFE',
        uin: 'CORP001LIF000',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['CORPORATE_AGENT'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        status: 'active',
        quoteRequirements: [],
        keyFacts: [],
      };

      const engine = new ComparisonScopeEngine();
      const input: ScopeInput = {
        entityType: 'CORPORATE_AGENT',
        comparisonScope: 'TIED_INSURERS',
        tiedInsurerIds: { LIFE: ['ins_corp_1'] },
        salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] },
        date: today,
      };

      const result = engine.evaluate(input, {
        versions: [version1],
        insurers: [ins1],
      });

      expect(result.versions).toHaveLength(1);
    });
  });
});
