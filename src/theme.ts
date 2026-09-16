import type { TextStyle } from 'react-native';

/**
 * Design tokens.
 *
 * The palette is paper-and-ink with a single accent. Moss is the only colour
 * in the app and it marks exactly one thing: the live, active element — the
 * send control, the selected filter, the current tab. Everything else earns
 * hierarchy from type and space, not hue.
 */
export const COLORS = {
  /** Page ground. Near-white, a hair warm — paper, not cream. */
  paper: '#FAFAF8',
  /** Slightly raised surfaces (input wells). */
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
};

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
 * from a written sentence before reading either.
 */
export const TYPE = {
  /** Screen titles. */
  display: {
    fontFamily: FONTS.sansSemi,
    fontSize: 26,
    lineHeight: 32,
    color: COLORS.ink,
    letterSpacing: -0.4,
  } satisfies TextStyle,

  /** The Ask answer — the largest sentence in the app. */
  answer: {
    fontFamily: FONTS.sans,
    fontSize: 21,
    lineHeight: 30,
    color: COLORS.ink,
    letterSpacing: -0.2,
  } satisfies TextStyle,

  /** Entry titles in the record. */
  entry: {
    fontFamily: FONTS.sansMedium,
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.ink,
  } satisfies TextStyle,

  /** Running prose. */
  body: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.graphite,
  } satisfies TextStyle,

  /** Small print. */
  fine: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.mist,
  } satisfies TextStyle,

  /** The time/date gutter. */
  gutter: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.mist,
    letterSpacing: 0,
  } satisfies TextStyle,

  /** Section eyebrows: TODAY, FROM YOUR RECORD, TRY. */
  label: {
    fontFamily: FONTS.monoMedium,
    fontSize: 10,
    color: COLORS.graphite,
    letterSpacing: 1.4,
  } satisfies TextStyle,

  /** Category/type stamps under an entry. */
  stamp: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.mist,
    letterSpacing: 0.9,
  } satisfies TextStyle,

  /** Amounts — mono so digits align down the column. */
  figure: {
    fontFamily: FONTS.monoMedium,
    fontSize: 13,
    color: COLORS.ink,
  } satisfies TextStyle,
};

/** Fixed width of the time gutter. Every row aligns to it. */
export const GUTTER = 62;

export const SPACE = {
  page: 20,
  row: 18,
  tight: 8,
};
