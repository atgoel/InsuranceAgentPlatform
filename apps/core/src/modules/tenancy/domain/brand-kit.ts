import { ValidationError, BusinessRuleError } from '../../../kernel/errors/domain-errors';
import { Plan } from './plan';

export const APPROVED_TYPEFACES = ['IBM Plex Sans', 'Noto Sans', 'Mukta'] as const;

export interface BrandKitProps {
  brandName: string;
  primary: string;
  secondary: string;
  typeface: typeof APPROVED_TYPEFACES[number];
  logoRef?: string;
  poweredByVisible: boolean;
}

export function contrastRatio(hexA: string, hexB: string): number {
  // Convert hex to RGB and calculate relative luminance per WCAG 2.1
  const getLuminance = (hex: string): number => {
    const hex6 = hex.replace('#', '').toLowerCase();
    const r = parseInt(hex6.substring(0, 2), 16) / 255;
    const g = parseInt(hex6.substring(2, 4), 16) / 255;
    const b = parseInt(hex6.substring(4, 6), 16) / 255;

    // Apply gamma correction
    const adjust = (c: number): number => {
      if (c <= 0.03928) {
        return c / 12.92;
      }
      return Math.pow((c + 0.055) / 1.055, 2.4);
    };

    return 0.2126 * adjust(r) + 0.7152 * adjust(g) + 0.0722 * adjust(b);
  };

  const l1 = getLuminance(hexA);
  const l2 = getLuminance(hexB);

  // Contrast ratio formula: (L1 + 0.05) / (L2 + 0.05) where L1 > L2
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

export class BrandKit {
  private state: BrandKitProps;

  private constructor(props: BrandKitProps) {
    this.state = props;
  }

  /** Rehydrates a persisted kit (plan checks ran when it was saved). */
  static restore(props: BrandKitProps): BrandKit {
    return new BrandKit({ ...props });
  }

  static create(props: BrandKitProps, plan: Plan): BrandKit {
    // Validate hex colours
    const hexRegex = /^#[0-9A-Fa-f]{6}$/;
    if (!hexRegex.test(props.primary)) {
      throw new ValidationError('invalid_colour', 'Primary colour must be a valid hex colour');
    }
    if (!hexRegex.test(props.secondary)) {
      throw new ValidationError('invalid_colour', 'Secondary colour must be a valid hex colour');
    }

    // Validate contrast ratio for primary against white
    const contrast = contrastRatio(props.primary, '#FFFFFF');
    if (contrast < 4.5) {
      throw new BusinessRuleError(
        'brand_contrast_insufficient',
        'Primary colour must have at least 4.5:1 contrast against white',
        { ratio: contrast }
      );
    }

    // Validate typeface is approved
    if (!APPROVED_TYPEFACES.includes(props.typeface)) {
      throw new ValidationError(
        'typeface_not_approved',
        `Typeface must be one of: ${APPROVED_TYPEFACES.join(', ')}`
      );
    }

    // Validate powered by visibility
    if (!props.poweredByVisible && !plan.canHidePoweredBy) {
      throw new BusinessRuleError(
        'powered_by_required',
        'This plan requires the "powered by" attribution to be visible'
      );
    }

    return new BrandKit(props);
  }

  static platformDefault(): BrandKit {
    const props: BrandKitProps = {
      brandName: 'Insurance Distribution Platform',
      primary: '#1F5FBF',
      secondary: '#163F7F',
      typeface: 'IBM Plex Sans',
      poweredByVisible: true,
    };
    return new BrandKit(props);
  }

  get props(): Readonly<BrandKitProps> {
    return { ...this.state };
  }
}
