import { describe, it, expect } from '@jest/globals';
import { Party } from './party';
import { ContactPoint } from './contact-point';
import { ValidationError, ConflictError, BusinessRuleError } from '../../../kernel/errors/domain-errors';

/**
 * AC-M03-01: Party.create validates name and contact points,
 * sets one primary per channel and keeps contact values only encrypted + hashed + masked;
 * removing the last contact point is refused.
 */
describe('AC-M03-01 Party aggregate', () => {
  const now = new Date('2026-10-03T00:00:00Z');

  const mobileCP: ContactPoint = {
    channel: 'MOBILE',
    valueEnc: 'base64(enc)',
    valueHash: 'hash_mobile_1',
    masked: '+91-XXXXXX1234',
    isPrimary: true,
  };

  const emailCP: ContactPoint = {
    channel: 'EMAIL',
    valueEnc: 'base64(enc)',
    valueHash: 'hash_email_1',
    masked: 'u***@example.com',
    isPrimary: true,
  };

  describe('Party.create', () => {
    it('creates a party with valid displayName and contact points', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        preferredLanguage: 'en',
        source: { kind: 'MANUAL' },
        now,
      });

      expect(party.props.id).toBe('party_1');
      expect(party.props.kind).toBe('PERSON');
      expect(party.props.displayName).toBe('John Doe');
      expect(party.props.contactPoints).toHaveLength(1);
      expect(party.props.createdAt).toBe(now.toISOString());
    });

    it('trims displayName and rejects if outside 2..120 range', () => {
      expect(() => {
        Party.create({
          id: 'party_1',
          kind: 'PERSON',
          displayName: 'A',
          contactPoints: [mobileCP],
          source: { kind: 'MANUAL' },
          now,
        });
      }).toThrow(ValidationError);

      expect(() => {
        Party.create({
          id: 'party_1',
          kind: 'PERSON',
          displayName: 'x'.repeat(121),
          contactPoints: [mobileCP],
          source: { kind: 'MANUAL' },
          now,
        });
      }).toThrow(ValidationError);

      const validLong = 'x'.repeat(120);
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: validLong,
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });
      expect(party.props.displayName).toBe(validLong);
    });

    it('rejects more than 5 contact points', () => {
      const contactPoints: ContactPoint[] = [];
      for (let i = 0; i < 6; i++) {
        contactPoints.push({
          channel: i % 2 === 0 ? 'MOBILE' : 'EMAIL',
          valueEnc: `base64(enc${i})`,
          valueHash: `hash_${i}`,
          masked: `masked_${i}`,
          isPrimary: i === 0,
        });
      }

      expect(() => {
        Party.create({
          id: 'party_1',
          kind: 'PERSON',
          displayName: 'John Doe',
          contactPoints,
          source: { kind: 'MANUAL' },
          now,
        });
      }).toThrow(ValidationError);
    });

    it('sets first contact point of a channel as primary', () => {
      const cp1: ContactPoint = {
        channel: 'MOBILE',
        valueEnc: 'enc1',
        valueHash: 'hash1',
        masked: 'masked1',
        isPrimary: false,
      };
      const cp2: ContactPoint = {
        channel: 'MOBILE',
        valueEnc: 'enc2',
        valueHash: 'hash2',
        masked: 'masked2',
        isPrimary: false,
      };

      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [cp1, cp2],
        source: { kind: 'MANUAL' },
        now,
      });

      const mobiles = party.props.contactPoints.filter((c) => c.channel === 'MOBILE');
      const primary = mobiles.filter((c) => c.isPrimary);
      expect(primary).toHaveLength(1);
      expect(primary[0].valueHash).toBe('hash1');
    });

    it('ensures only one primary per channel', () => {
      const cp1: ContactPoint = {
        channel: 'MOBILE',
        valueEnc: 'enc1',
        valueHash: 'hash1',
        masked: 'masked1',
        isPrimary: true,
      };
      const cp2: ContactPoint = {
        channel: 'MOBILE',
        valueEnc: 'enc2',
        valueHash: 'hash2',
        masked: 'masked2',
        isPrimary: true,
      };

      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [cp1, cp2],
        source: { kind: 'MANUAL' },
        now,
      });

      const mobiles = party.props.contactPoints.filter((c) => c.channel === 'MOBILE');
      const primaries = mobiles.filter((c) => c.isPrimary);
      expect(primaries).toHaveLength(1);
    });

    it('sets default preferredLanguage to en', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });

      expect(party.props.preferredLanguage).toBe('en');
    });

    it('preserves encrypted contact values but never exposes plaintext', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });

      expect(party.props.contactPoints[0].valueEnc).toBeDefined();
      expect(party.props.contactPoints[0].valueHash).toBeDefined();
      expect(party.props.contactPoints[0].masked).toBeDefined();
      // Plaintext should never be stored
      expect((party.props.contactPoints[0] as unknown as Record<string, unknown>).value).toBeUndefined();
    });
  });

  describe('rename', () => {
    it('changes displayName to a valid value', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });

      party.rename('Jane Doe', now);

      expect(party.props.displayName).toBe('Jane Doe');
      expect(party.props.updatedAt).toBe(now.toISOString());
    });

    it('validates renamed displayName', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });

      expect(() => {
        party.rename('A', now);
      }).toThrow(ValidationError);
    });
  });

  describe('addContactPoint', () => {
    it('adds a new contact point', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });

      party.addContactPoint(emailCP);

      expect(party.props.contactPoints).toHaveLength(2);
    });

    it('rejects duplicate contact hash on the same party', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });

      expect(() => {
        party.addContactPoint({
          ...mobileCP,
          masked: 'different_mask',
        });
      }).toThrow(ConflictError);
    });
  });

  describe('removeContactPoint', () => {
    it('removes a contact point', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP, emailCP],
        source: { kind: 'MANUAL' },
        now,
      });

      party.removeContactPoint(mobileCP.valueHash);

      expect(party.props.contactPoints).toHaveLength(1);
      expect(party.props.contactPoints[0].valueHash).toBe(emailCP.valueHash);
    });

    it('refuses to remove the last contact point', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });

      expect(() => {
        party.removeContactPoint(mobileCP.valueHash);
      }).toThrow(BusinessRuleError);
    });
  });

  describe('setSensitive', () => {
    it('sets P3 fields (encrypted DOB and PAN)', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });

      party.setSensitive({
        dateOfBirthEnc: 'enc_dob',
        dobYear: 1990,
        panEnc: 'enc_pan',
        panHash: 'hash_pan',
        panLast4: '1234',
      });

      expect(party.props.dateOfBirthEnc).toBe('enc_dob');
      expect(party.props.dobYear).toBe(1990);
      expect(party.props.panEnc).toBe('enc_pan');
      expect(party.props.panHash).toBe('hash_pan');
      expect(party.props.panLast4).toBe('1234');
    });
  });

  describe('markMerged', () => {
    it('marks an ACTIVE party as MERGED', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });

      party.markMerged('party_2', now);

      expect(party.props.status).toBe('MERGED');
      expect(party.props.mergedIntoId).toBe('party_2');
    });

    it('refuses to mark non-ACTIVE party as MERGED', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });

      party.markMerged('party_2', now);

      expect(() => {
        party.markMerged('party_3', now);
      }).toThrow(BusinessRuleError);
    });
  });

  describe('restoreFromMerge', () => {
    it('restores a MERGED party to ACTIVE', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });

      party.markMerged('party_2', now);
      party.restoreFromMerge(now);

      expect(party.props.status).toBe('ACTIVE');
      expect(party.props.mergedIntoId).toBeUndefined();
    });
  });

  describe('erase', () => {
    it('erases P2/P3 fields and marks status ERASED', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });

      party.setSensitive({
        dateOfBirthEnc: 'enc_dob',
        dobYear: 1990,
        panEnc: 'enc_pan',
        panHash: 'hash_pan',
        panLast4: '1234',
      });

      party.erase(now);

      expect(party.props.status).toBe('ERASED');
      expect(party.props.displayName).toBe('[erased]');
      expect(party.props.contactPoints).toHaveLength(0);
      expect(party.props.dateOfBirthEnc).toBeUndefined();
      expect(party.props.panEnc).toBeUndefined();
    });
  });

  describe('primary', () => {
    it('returns the primary contact point for a channel', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP, emailCP],
        source: { kind: 'MANUAL' },
        now,
      });

      const primaryMobile = party.primary('MOBILE');
      expect(primaryMobile).toBeDefined();
      expect(primaryMobile?.channel).toBe('MOBILE');
      expect(primaryMobile?.isPrimary).toBe(true);
    });

    it('returns undefined if no contact point for channel', () => {
      const party = Party.create({
        id: 'party_1',
        kind: 'PERSON',
        displayName: 'John Doe',
        contactPoints: [mobileCP],
        source: { kind: 'MANUAL' },
        now,
      });

      const primaryEmail = party.primary('EMAIL');
      expect(primaryEmail).toBeUndefined();
    });
  });
});

describe('AC-CR001-08 Party custom fields', () => {
  const now = new Date('2026-10-03T00:00:00Z');
  const later = new Date('2026-10-04T00:00:00Z');
  const cp: ContactPoint = { channel: 'MOBILE', valueEnc: 'enc', valueHash: 'hash_cf', masked: '+91-XXXXXX1234', isPrimary: true };
  const make = (customFields?: Record<string, string | number | boolean>) =>
    Party.create({ id: 'pty_cf', kind: 'PERSON', displayName: 'Meera Nair', contactPoints: [cp], source: { kind: 'MANUAL' }, customFields, now });

  it('AC-CR001-08 defaults customFields to {} and stores a copy of the given values', () => {
    expect(make().props.customFields).toEqual({});
    const values = { occupation: 'Architect' };
    const party = make(values);
    expect(party.props.customFields).toEqual({ occupation: 'Architect' });
    values.occupation = 'changed';
    expect(party.props.customFields).toEqual({ occupation: 'Architect' });
  });

  it('AC-CR001-08 replaceCustomFields replaces the whole set and bumps updatedAt', () => {
    const party = make({ occupation: 'Architect', nri: false });
    party.replaceCustomFields({ occupation: 'Doctor' }, later);
    expect(party.props.customFields).toEqual({ occupation: 'Doctor' });
    expect(party.props.updatedAt).toBe(later.toISOString());
  });

  it('AC-CR001-08 merge copies only the keys the survivor lacks and reversal removes exactly those', () => {
    const survivor = make({ occupation: 'Architect' });
    const copied = survivor.absorbCustomFields({ occupation: 'Clerk', income_paise: 5_000_000 }, later);
    expect(copied).toEqual(['income_paise']);
    expect(survivor.props.customFields).toEqual({ occupation: 'Architect', income_paise: 5_000_000 });
    survivor.releaseCustomFields(copied, later);
    expect(survivor.props.customFields).toEqual({ occupation: 'Architect' });
  });

  it('AC-CR001-08 restore of a legacy row without customFields yields {}', () => {
    const { customFields: _dropped, ...rest } = make({ a: 'b' }).props;
    expect(_dropped).toEqual({ a: 'b' });
    expect(Party.restore(rest as never).props.customFields).toEqual({});
  });

  it('AC-CR001-08 erase clears custom fields', () => {
    const party = make({ occupation: 'Architect' });
    party.erase(later);
    expect(party.props.customFields).toEqual({});
  });
});
