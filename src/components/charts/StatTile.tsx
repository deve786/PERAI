import { StyleSheet, Text, View } from 'react-native';
import type { Delta } from '../../charts/chartLogic';
import { useTheme } from '../../ThemeContext';
import { FONTS, type Colors } from '../../theme';
import { Sparkline } from './Sparkline';

interface Props {
  label: string;
  value: string;
  /** The change against a named period, worked out by `delta()`. */
  change?: Delta | null;
  /** The period it is compared with, in a word: "Sep", "last week". */
  against?: string;
  /** Recent values, oldest first, for a sparkline under the figure. */
  trend?: number[];
  /** Colour the value itself, e.g. a negative net. */
  tone?: string;
}

/**
 * A figure, and whether it is good news.
 *
 * "₹12,400" cannot be read on its own: it is a lot or a little only next to
 * something. The tile says what it is compared with, which way it moved, and
 * whether that way is good — an arrow and words as well as colour, so the
 * meaning survives without the colour.
 */
export function StatTile({ label, value, change, against, trend, tone }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const changeColor =
    !change || change.good === null ? colors.graphite : change.good ? colors.moss : colors.alert;
  const arrow = !change ? '' : change.direction === 'up' ? '▲' : change.direction === 'down' ? '▼' : '•';

  const spoken =
    change && change.pct !== null
      ? `${label} ${value}, ${change.direction === 'flat' ? 'no change' : `${change.direction} ${Math.abs(change.pct)} percent`}${against ? ` against ${against}` : ''}`
      : `${label} ${value}`;

  return (
    <View style={styles.tile} accessible accessibilityLabel={spoken}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.value, tone ? { color: tone } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {change && change.pct !== null ? (
        <Text style={[styles.change, { color: changeColor }]} numberOfLines={1}>
          {arrow} {Math.abs(change.pct)}%{against ? <Text style={styles.against}> vs {against}</Text> : null}
        </Text>
      ) : against ? (
        <Text style={styles.against} numberOfLines={1}>
          nothing in {against}
        </Text>
      ) : null}
      {trend ? (
        <View style={styles.trend}>
          <Sparkline values={trend} width={64} height={18} />
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    tile: { flex: 1, gap: 2, minWidth: 0 },
    label: { fontFamily: FONTS.sans, fontSize: 12, color: colors.graphite },
    // Proportional figures at this size; tabular digits look loose on a single number.
    value: { fontFamily: FONTS.monoMedium, fontSize: 16, color: colors.ink },
    change: { fontFamily: FONTS.sansSemi, fontSize: 12 },
    against: { fontFamily: FONTS.sans, fontSize: 12, color: colors.mist },
    trend: { marginTop: 4 },
  });
}
