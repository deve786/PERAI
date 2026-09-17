import type { TextStyle } from 'react-native';

export type ColorScheme = 'light' | 'dark';

/**
 * Design tokens, one palette per scheme.
 *
 * Paper-and-ink with a single accent, in both directions. Moss is the only
 * colour in the app and it marks exactly one thing: the live, active element
 * — the send control, the selected filter, the current tab. Everything else
 * earns hierarchy from type and space, not hue. Dark mode is not an inverted
 * filter over the same numbers — text, hairlines and the accent wash are each
 * given their own value so contrast holds up against a dark ground the same
 * way it does against paper.
 */
const LIGHT = {
  /** Page ground. Near-white, a hair warm — paper, not cream. */
  paper: '#FAFAF8',
  /** Slightly raised surfaces (input wells, cards). */
  surface: '#FFFFFF',
  /** Primary text. Near-black, faintly cool, never pure #000. */
  ink: '#16181A',
  /** Secondary text. */
  graphite: '#5A5F63',
  /** Metadata, gutter values, placeholders. */
  mist: '#9AA0A4',
  /** Hairlines. The only border weight in the app. */
  rule: '#E6E7E4',
  /** The one accent. */
  moss: '#2F5D45',
  /** Accent wash, for the selected-chip fill and the "you said" block. */
  mossSoft: '#EDF2EF',
  /** Muted brick — errors state facts, they do not alarm. */
  alert: '#8C2F1F',
  alertSoft: '#FBF2F0',
  /**
   * Text and icons placed on a solid moss fill (buttons, selected chips).
   * Deliberately the same value in both palettes: moss is always a saturated
   * enough green in either scheme for near-white to read clearly on top of
   * it, whereas `paper` — the page ground — flips per scheme and would go
   * near-black on a moss button in dark mode.
   */
  onAccent: '#FAFAF8',
};

const DARK = {
  /** Page ground. Near-black, faintly warm — soot, not blue-black. */
  paper: '#151614',
  /** Slightly raised surfaces (input wells, cards). */
  surface: '#1D1F1C',
  /** Primary text. Near-white, faintly warm, never pure #FFF. */
  ink: '#F1F0EC',
  /** Secondary text — lightened for dark-ground contrast, same role as light mode's graphite. */
  graphite: '#A9AFAA',
  /** Metadata, gutter values, placeholders — dimmer than graphite, still legible. */
  mist: '#6E736E',
  /** Hairlines: a shade lighter than the ground, mirroring light mode's shade darker. */
  rule: '#2B2D29',
  /** The one accent, brightened so it holds the same weight against a dark ground. */
  moss: '#5A9C79',
  /** Accent wash: a dark moss tint rather than a light mint tint. */
  mossSoft: '#1B2620',
  /** Muted brick, brightened for dark-ground contrast. */
  alert: '#D08469',
  alertSoft: '#2A1D17',
  /** Same value as light mode — see the comment on the light palette. */
  onAccent: '#FAFAF8',
};

export const PALETTES: Record<ColorScheme, typeof LIGHT> = { light: LIGHT, dark: DARK };

export type Colors = typeof LIGHT;

export const FONTS = {
  sans: 'IBMPlexSans_400Regular',
  sansMedium: 'IBMPlexSans_500Medium',
  sansSemi: 'IBMPlexSans_600SemiBold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
};

/**
 * One rule governs every piece of text in the app:
 *
 *   mono  = data      (times, dates, amounts, categories, counts, labels)
 *   sans  = language  (titles, answers, prose, controls)
 *
 * It is the whole type system, and it means the eye can tell a recorded fact
 * from a written sentence before reading either. Built per-scheme because
 * every size below carries a `color` from that scheme's palette.
 */
function buildType(colors: Colors) {
  return {
    /** Screen titles. */
    display: {
      fontFamily: FONTS.sansSemi,
      fontSize: 26,
      lineHeight: 32,
      color: colors.ink,
      letterSpacing: -0.4,
    } satisfies TextStyle,

    /** The Ask answer — the largest sentence in the app. */
    answer: {
      fontFamily: FONTS.sans,
      fontSize: 21,
      lineHeight: 30,
      color: colors.ink,
      letterSpacing: -0.2,
    } satisfies TextStyle,

    /** Entry titles in the record. */
    entry: {
      fontFamily: FONTS.sansMedium,
      fontSize: 15,
      lineHeight: 21,
      color: colors.ink,
    } satisfies TextStyle,

    /** Running prose. */
    body: {
      fontFamily: FONTS.sans,
      fontSize: 14,
      lineHeight: 20,
      color: colors.graphite,
    } satisfies TextStyle,

    /** Small print. */
    fine: {
      fontFamily: FONTS.sans,
      fontSize: 12,
      lineHeight: 17,
      color: colors.mist,
    } satisfies TextStyle,

    /** The time/date gutter. */
    gutter: {
      fontFamily: FONTS.mono,
      fontSize: 12,
      color: colors.mist,
      letterSpacing: 0,
    } satisfies TextStyle,

    /** Section eyebrows: TODAY, FROM YOUR RECORD, TRY. */
    label: {
      fontFamily: FONTS.monoMedium,
      fontSize: 10,
      color: colors.graphite,
      letterSpacing: 1.4,
    } satisfies TextStyle,

    /** Category/type stamps under an entry. */
    stamp: {
      fontFamily: FONTS.mono,
      fontSize: 10,
      color: colors.mist,
      letterSpacing: 0.9,
    } satisfies TextStyle,

    /** Amounts — mono so digits align down the column. */
    figure: {
      fontFamily: FONTS.monoMedium,
      fontSize: 13,
      color: colors.ink,
    } satisfies TextStyle,
  };
}

export type TypeScale = ReturnType<typeof buildType>;

/** Computed once per scheme at module load — never recomputed per render. */
export const TYPE_SCALES: Record<ColorScheme, TypeScale> = {
  light: buildType(LIGHT),
  dark: buildType(DARK),
};

/**
 * Static light-mode tokens, for the handful of call sites that run before
 * `ThemeProvider` mounts (there are none left in app code, but this keeps the
 * module importable standalone — e.g. from scripts/test-logic.ts). Screens
 * and components should use `useTheme()` from `ThemeContext`, never these.
 */
export const COLORS = LIGHT;
export const TYPE = TYPE_SCALES.light;

/** Fixed width of the time gutter. Every row aligns to it. */
export const GUTTER = 62;

export const SPACE = {
  page: 20,
  row: 18,
  tight: 8,
};
