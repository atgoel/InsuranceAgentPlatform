// Design tokens for the application
export const colors = {
  // Semantic
  ink: '#1B1F27',
  secondary: '#4A5262',
  caption: '#5F6776',
  line: '#D5D9E0',
  ground: '#F4F5F7',
  accent: 'var(--accent, #1F5FBF)', // tenant token, can be overridden via CSS var

  // Tones
  ok: { fg: '#1D5F3A', bg: '#E8F4EC' },
  warn: { fg: '#7A3E06', bg: '#FFF4E5' },
  bad: { fg: '#8A1F1F', bg: '#FDECEC' },
  info: { fg: '#163F7F', bg: '#E8F0FB' },
  neutral: { fg: '#4A5262', bg: '#F4F5F7' },
} as const;

export const spacing = {
  0: '0',
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
} as const;

export const radius = {
  sm: '8px',
  md: '12px',
} as const;

export const typography = {
  // Font families
  sans: '"IBM Plex Sans", "IBM Plex Sans Devanagari", system-ui, -apple-system, sans-serif',
  mono: '"IBM Plex Mono", monospace',

  // Font sizes and line heights
  size: {
    xs: { fontSize: '12px', lineHeight: '16px' },
    sm: { fontSize: '13px', lineHeight: '18px' },
    base: { fontSize: '14px', lineHeight: '20px' },
    lg: { fontSize: '16px', lineHeight: '24px' },
    xl: { fontSize: '18px', lineHeight: '28px' },
    '2xl': { fontSize: '20px', lineHeight: '32px' },
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
  },
} as const;

export const touch = {
  minHeight: '44px',
  minWidth: '44px',
} as const;

export const shadow = {
  sm: '0 1px 2px rgba(27, 31, 39, 0.08)',
  md: '0 4px 6px rgba(27, 31, 39, 0.08)',
} as const;
