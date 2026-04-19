/**
 * Design tokens. Single source of truth — screens must import from
 * here and never hardcode colors, spacing, or typography values.
 */
export const colors = {
  bg: '#0B1020',
  bgElevated: '#151B30',
  bgCard: '#1B2340',
  border: '#263056',
  text: '#F2F4FA',
  textDim: '#9AA3C2',
  textMuted: '#6B7497',
  accent: '#4DA3FF',
  accentMuted: '#2A4D7A',
  good: '#4ADE80',
  warn: '#FACC15',
  bad: '#F87171',
  holdStart: '#4ADE80',
  holdIntermediate: '#FACC15',
  holdFinish: '#F472B6',
  holdFoot: '#94A3B8',
  boneLeft: '#60A5FA',
  boneRight: '#F472B6',
  boneSpine: '#E2E8F0',
} as const;

export const spacing = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  s: 6,
  m: 10,
  l: 16,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  subtitle: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 14, fontWeight: '400' as const, color: colors.text },
  label: { fontSize: 12, fontWeight: '500' as const, color: colors.textDim },
  mono: { fontSize: 12, fontWeight: '400' as const, color: colors.textMuted, fontFamily: 'Menlo' },
} as const;

export function scoreColor(score: number): string {
  if (score >= 80) return colors.good;
  if (score >= 60) return colors.warn;
  return colors.bad;
}

export function holdRoleColor(role: string): string {
  switch (role) {
    case 'start':
      return colors.holdStart;
    case 'finish':
      return colors.holdFinish;
    case 'foot_only':
      return colors.holdFoot;
    default:
      return colors.holdIntermediate;
  }
}
