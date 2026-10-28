import { useEffect, useMemo, useState } from 'react';
import { Animated, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { G, Line, Path, Rect } from 'react-native-svg';
import { blend } from '../../charts/chartLogic';
import { useTheme } from '../../ThemeContext';
import { FONTS, type Colors } from '../../theme';

export interface TrendPoint {
  /** YYYY-MM-DD (or YYYY-MM-01 for a month bucket). */
  date: string;
  /** Short axis label for the bucket. */
  label: string;
  total: number;
}

interface Props {
  data: TrendPoint[];
  /** The period before, bucket for bucket. Drawn as a pale bar behind each one. */
  previous?: number[];
  width: number;
  height?: number;
  /** How a value is written: "₹2,400", "5 entries". */
  format: (value: number) => string;
  /** Names for the two series in the legend, when `previous` is given. */
  legend?: [string, string];
  /** How a bucket is named in the callout: "Fri 16 Oct", "Week of 5 Oct". */
  describe?: (point: TrendPoint) => string;
}

/** Bars are never wider than this, so a short period does not turn into blocks. */
const MAX_BAR = 24;
/** Room above the bars for the peak's label, so it never sits on a bar. */
const LABEL_ROOM = 16;

/** Bar with a rounded free end and a square end on the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

/**
 * Totals over time, against the same span before it.
 *
 * Alone, a bar says what happened; next to the period before, it says whether
 * that was normal. The previous period sits behind each bar as a pale shape
 * a little wider than it, so a spike reads as a spike at a glance and a quiet
 * week reads as quiet without reading a single number.
 *
 * Touch anywhere along the chart and the bucket under your finger is picked
 * out, with its figure and the one before it written above. The peak is
 * labelled on the chart itself, so no value is only reachable by touch.
 */
export function TrendBars({ data, previous, width, height = 110, format, legend, describe }: Props) {
  const { colors, scheme } = useTheme();
  const styles = makeStyles(colors);
  const [picked, setPicked] = useState<number | null>(null);
  const [grow] = useState(() => new Animated.Value(0));

  // Grow from the baseline when the data first arrives or changes. Once per
  // dataset, so scrolling past does not replay it.
  const signature = data.map((d) => `${d.date}:${d.total}`).join('|');
  useEffect(() => {
    grow.setValue(0);
    Animated.timing(grow, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [signature, grow]);

  const n = Math.max(data.length, 1);
  const slot = width / n;
  const barW = Math.max(Math.min(slot * 0.62, MAX_BAR), 1.5);
  const ghostW = Math.min(barW + 4, slot - 1);
  const hasPrevious = !!previous && previous.some((v) => v > 0);
  const max = Math.max(...data.map((d) => d.total), ...(hasPrevious ? previous! : [0]), 1);
  const peakIndex = data.reduce((best, d, i) => (d.total > data[best].total ? i : best), 0);
  const ghostFill = blend(colors.graphite, colors.surface, scheme === 'dark' ? 0.32 : 0.2);

  const indexAt = (x: number) => Math.max(0, Math.min(data.length - 1, Math.floor(x / slot)));
  const onTouch = (event: GestureResponderEvent) => setPicked(indexAt(event.nativeEvent.locationX));

  const pickedPoint = picked !== null ? data[picked] : null;
  const pickedPrev = picked !== null && hasPrevious ? previous![picked] ?? 0 : null;

  const yOf = (v: number) => height - Math.max((v / max) * (height - 6), v > 0 ? 3 : 0);

  const peak = data[peakIndex];
  const peakLabelX = useMemo(() => {
    const centre = peakIndex * slot + slot / 2;
    return Math.max(0, Math.min(width - 80, centre - 40));
  }, [peakIndex, slot, width]);

  return (
    <View>
      {/* The callout: what the finger is on, against the period before. */}
      <View style={styles.callout}>
        {pickedPoint ? (
          <>
            <Text style={styles.calloutWhen}>
              {describe ? describe(pickedPoint) : pickedPoint.label}
            </Text>
            <Text style={styles.calloutValue}>{format(pickedPoint.total)}</Text>
            {pickedPrev !== null ? (
              <Text style={styles.calloutPrev}>was {format(pickedPrev)}</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.calloutHint}>Touch a bar to see it</Text>
        )}
      </View>

      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onTouch}
        onResponderMove={onTouch}
        onResponderTerminationRequest={() => true}
        accessibilityRole="adjustable"
        accessibilityLabel={`Chart. Highest ${format(peak?.total ?? 0)}${describe && peak ? ` on ${describe(peak)}` : ''}.`}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          const step = event.nativeEvent.actionName === 'increment' ? 1 : -1;
          setPicked((current) => Math.max(0, Math.min(data.length - 1, (current ?? -1) + step)));
        }}
        // The whole width answers a touch, and the bucket is worked out from
        // where the finger is — so even a thin day in a 31-day month is easy
        // to land on. Children take no touches, which keeps the touch position
        // measured from this view and not from whichever bar was under it.
        style={{ width, height: height + LABEL_ROOM, paddingTop: LABEL_ROOM }}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            width,
            height,
            transformOrigin: 'bottom',
            transform: [{ scaleY: grow }],
          }}
        >
          <Svg width={width} height={height}>
            {/* One hairline baseline; no gridlines, the peak label carries the scale. */}
            <Line x1={0} y1={height - 0.5} x2={width} y2={height - 0.5} stroke={colors.rule} strokeWidth={1} />
            {data.map((d, i) => {
              const centre = i * slot + slot / 2;
              const prev = hasPrevious ? previous![i] ?? 0 : 0;
              const prevTop = yOf(prev);
              const top = yOf(d.total);
              const isPicked = picked === i;
              const dim = picked !== null && !isPicked;
              return (
                <G key={`${d.date}-${i}`}>
                  {hasPrevious && prev > 0 ? (
                    <Path d={barPath(centre - ghostW / 2, prevTop, ghostW, height - prevTop)} fill={ghostFill} />
                  ) : null}
                  {d.total > 0 ? (
                    <Path
                      d={barPath(centre - barW / 2, top, barW, height - top)}
                      fill={colors.moss}
                      opacity={dim ? 0.45 : 1}
                    />
                  ) : (
                    // Nothing that day: a short stub, so a gap reads as "nothing", not "missing".
                    <Rect x={centre - barW / 2} y={height - 2} width={barW} height={2} fill={colors.rule} />
                  )}
                </G>
              );
            })}
          </Svg>
        </Animated.View>

        {/* The peak, labelled on the chart so its figure never needs a touch. */}
        {peak && peak.total > 0 && picked === null ? (
          <Text pointerEvents="none" style={[styles.peak, { left: peakLabelX }]} numberOfLines={1}>
            {format(peak.total)}
          </Text>
        ) : null}

      </View>

      {data.length > 0 ? (
        <View style={styles.axis}>
          <Text style={styles.tick}>{data[0].label}</Text>
          {data.length > 1 ? <Text style={styles.tick}>{data[data.length - 1].label}</Text> : null}
        </View>
      ) : null}

      {hasPrevious && legend ? (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: colors.moss }]} />
            <Text style={styles.legendText}>{legend[0]}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: ghostFill }]} />
            <Text style={styles.legendText}>{legend[1]}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    callout: { flexDirection: 'row', alignItems: 'baseline', gap: 8, minHeight: 24, marginBottom: 6, flexWrap: 'wrap' },
    calloutWhen: { fontFamily: FONTS.sans, fontSize: 13, color: colors.graphite },
    calloutValue: { fontFamily: FONTS.monoMedium, fontSize: 16, color: colors.ink },
    calloutPrev: { fontFamily: FONTS.mono, fontSize: 12, color: colors.mist },
    calloutHint: { fontFamily: FONTS.sans, fontSize: 12, color: colors.mist },
    peak: {
      position: 'absolute',
      top: 0,
      width: 80,
      textAlign: 'center',
      fontFamily: FONTS.mono,
      fontSize: 11,
      color: colors.graphite,
    },
    axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    tick: { fontFamily: FONTS.mono, fontSize: 11, color: colors.graphite },
    legend: { flexDirection: 'row', gap: 16, marginTop: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    swatch: { width: 10, height: 10, borderRadius: 3 },
    legendText: { fontFamily: FONTS.sans, fontSize: 12, color: colors.graphite },
  });
}
