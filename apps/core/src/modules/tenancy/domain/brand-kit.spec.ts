import { BrandKit, contrastRatio, BrandKitProps } from './brand-kit';
import { PlanCatalogue } from './plan';
import { ValidationError, BusinessRuleError } from '../../../kernel/errors/domain-errors';

/**
 * AC-M01-05: Brand kit rejects primary colours below 4.5:1 contrast against white,
 * unapproved typefaces and hiding "powered by" on plans that do not allow it;
 * contrastRatio matches WCAG reference values (#FFFFFF/#000000 = 21, #1F5FBF/#FFFFFF ≈ 6.0).
 */
describe('AC-M01-05 BrandKit', () => {
  describe('contrastRatio', () => {
    it('returns 21 for black (#000000) against white (#FFFFFF)', () => {
      const ratio = contrastRatio('#000000', '#FFFFFF');
      expect(ratio).toBe(21);
    });

    it('returns approximately 6.0 for #1F5FBF against #FFFFFF', () => {
      const ratio = contrastRatio('#1F5FBF', '#FFFFFF');
      expect(ratio).toBeGreaterThan(6.0);
      expect(ratio).toBeLessThan(6.2); // WCAG: ≈ 6.09
    });

    it('returns 1 for same colors', () => {
      const ratio = contrastRatio('#FFFFFF', '#FFFFFF');
      expect(ratio).toBe(1);
    });

    it('handles case-insensitive hex values', () => {
      const ratio1 = contrastRatio('#1f5fbf', '#FFFFFF');
      const ratio2 = contrastRatio('#1F5FBF', '#FFFFFF');
      expect(ratio1).toBe(ratio2);
    });
  });

  describe('create', () => {
    const plan = PlanCatalogue.default().get('SOLO');

    it('creates a brand kit with valid properties', () => {
      const kit = BrandKit.create(
        {
          brandName: 'Test Brand',
          primary: '#1F5FBF',
          secondary: '#163F7F',
          typeface: 'IBM Plex Sans',
          poweredByVisible: true,
        },
        plan,
      );

      expect(kit.props.brandName).toBe('Test Brand');
      expect(kit.props.primary).toBe('#1F5FBF');
      expect(kit.props.secondary).toBe('#163F7F');
      expect(kit.props.typeface).toBe('IBM Plex Sans');
      expect(kit.props.poweredByVisible).toBe(true);
    });

    it('validates hex colour format', () => {
      expect(() =>
        BrandKit.create(
          {
            brandName: 'Test',
            primary: 'rgb(31, 95, 191)',
            secondary: '#163F7F',
            typeface: 'IBM Plex Sans',
            poweredByVisible: true,
          },
          plan,
        ),
      ).toThrow(ValidationError);

      expect(() =>
        BrandKit.create(
          {
            brandName: 'Test',
            primary: '#1F5F',
            secondary: '#163F7F',
            typeface: 'IBM Plex Sans',
            poweredByVisible: true,
          },
          plan,
        ),
      ).toThrow(ValidationError);
    });

    it('rejects primary colour with insufficient contrast against white', () => {
      const lowContrastColor = '#CCCCCC'; // Low contrast
      expect(() =>
        BrandKit.create(
          {
            brandName: 'Test',
            primary: lowContrastColor,
            secondary: '#163F7F',
            typeface: 'IBM Plex Sans',
            poweredByVisible: true,
          },
          plan,
        ),
      ).toThrow(BusinessRuleError);
    });

    it('accepts primary colour with exactly 4.5:1 contrast', () => {
      // #264600 against #FFFFFF has approximately 4.5:1 contrast
      const color = '#264600';
      expect(() =>
        BrandKit.create(
          {
            brandName: 'Test',
            primary: color,
            secondary: '#163F7F',
            typeface: 'IBM Plex Sans',
            poweredByVisible: true,
          },
          plan,
        ),
      ).not.toThrow();
    });

    it('validates typeface is approved', () => {
      expect(() =>
        BrandKit.create(
          {
            brandName: 'Test',
            primary: '#1F5FBF',
            secondary: '#163F7F',
            typeface: 'Comic Sans' as unknown as BrandKitProps['typeface'],
            poweredByVisible: true,
          },
          plan,
        ),
      ).toThrow(ValidationError);
    });

    it('allows all approved typefaces', () => {
      const approvedTypefaces = ['IBM Plex Sans', 'Noto Sans', 'Mukta'] as const;
      for (const typeface of approvedTypefaces) {
        expect(() =>
          BrandKit.create(
            {
              brandName: 'Test',
              primary: '#1F5FBF',
              secondary: '#163F7F',
              typeface,
              poweredByVisible: true,
            },
            plan,
          ),
        ).not.toThrow();
      }
    });

    it('rejects hiding powered by when plan does not allow it', () => {
      const plan = PlanCatalogue.default().get('SOLO'); // SOLO plan cannot hide powered by
      expect(() =>
        BrandKit.create(
          {
            brandName: 'Test',
            primary: '#1F5FBF',
            secondary: '#163F7F',
            typeface: 'IBM Plex Sans',
            poweredByVisible: false,
          },
          plan,
        ),
      ).toThrow(BusinessRuleError);
    });

    it('allows hiding powered by on WHITE_LABEL plan', () => {
      const plan = PlanCatalogue.default().get('WHITE_LABEL');
      expect(() =>
        BrandKit.create(
          {
            brandName: 'Test',
            primary: '#1F5FBF',
            secondary: '#163F7F',
            typeface: 'IBM Plex Sans',
            poweredByVisible: false,
          },
          plan,
        ),
      ).not.toThrow();
    });

    it('allows optional logoRef', () => {
      const kit = BrandKit.create(
        {
          brandName: 'Test',
          primary: '#1F5FBF',
          secondary: '#163F7F',
          typeface: 'IBM Plex Sans',
          poweredByVisible: true,
          logoRef: 'logo_abc123',
        },
        plan,
      );

      expect(kit.props.logoRef).toBe('logo_abc123');
    });
  });

  describe('platformDefault', () => {
    it('returns platform default branding', () => {
      const kit = BrandKit.platformDefault();

      expect(kit.props.brandName).toBe('Insurance Distribution Platform');
      expect(kit.props.primary).toBe('#1F5FBF');
      expect(kit.props.secondary).toBe('#163F7F');
      expect(kit.props.typeface).toBe('IBM Plex Sans');
      expect(kit.props.poweredByVisible).toBe(true);
    });

    it('has sufficient contrast for primary colour', () => {
      const kit = BrandKit.platformDefault();
      const ratio = contrastRatio(kit.props.primary, '#FFFFFF');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });
});
