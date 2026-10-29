import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { heatRamp, heatWeeks, type HeatCell } from '../../charts/chartLogic';
import { useTheme } from '../../ThemeContext';
import { FONTS, type Colors } from '../../theme';

interface Props {
  from: string;
  to: string;
  /** Per day: the figure the shade is drawn from, and how many entries made it. */
  totals: Map<string, { value: number; count: number }>;
  width: number;
  /** How the figure is written in the callout: "₹3,273", "4 entries". */
  format: (value: number) => string;
  /** What one entry is called, and several: { one: "expense", many: "expenses" }. */
  noun: { one: string; many: string };
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Up to this many weeks, the grid is a calendar you read across; past it, weeks run left to right. */
const CALENDAR_WEEKS = 6;
const GAP = 4;
const SMALL_CELL = 14;
const SMALL_GAP = 3;

function longDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAY_NAMES[date.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

/**
 * Every day of the period as a square, shaded by how much happened on it.
 *
 * The one chart that shows a habit: the Friday that is always dark, the
 * fortnight that went quiet, the first of the month that always spikes. A bar
 * chart shows the same numbers, but as a row you read; this lays them out the
 * way a week is lived, so the pattern is seen rather than worked out.
 *
 * A month is drawn as a calendar with its dates in it. Longer periods run
 * week by week from left to right, scrolled to the most recent, with the
 * months marked above.
 *
 * Tap a day for its figure. The shade is never the only way to get one.
 */
export function CalendarHeatmap({ from, to, totals, width, format, noun }: Props) {
  const { colors, scheme } = useTheme();
  const styles = makeStyles(colors);
  const [picked, setPicked] = useState<HeatCell | null>(null);
  const scroller = useRef<ScrollView>(null);

  const weeks = useMemo(() => heatWeeks(from, to, totals), [from, to, totals]);
  const ramp = useMemo(() => heatRamp(colors.moss, colors.surface), [colors.moss, colors.surface]);
  const fillFor = (cell: HeatCell) => (cell.level === 0 ? colors.well : ramp[cell.level - 1]);
  // Words on the two darkest steps need the opposite ink to stay legible.
  const textFor = (cell: HeatCell) =>
    cell.level >= 3 ? (scheme === 'dark' ? colors.paper : '#FFFFFF') : colors.graphite;

  if (weeks.length === 0) return null;

  const calendar = weeks.length <= CALENDAR_WEEKS;
  const cell = calendar ? Math.floor((width - GAP * 6) / 7) : SMALL_CELL;

  const select = (c: HeatCell) => setPicked((current) => (current?.date === c.date ? null : c));
  const label = (c: HeatCell) =>
    `${longDate(c.date)}: ${c.value > 0 ? `${format(c.value)}, ${c.count} ${c.count === 1 ? noun.one : noun.many}` : 'nothing'}`;

  const callout = (
    <View style={styles.callout}>
      {picked ? (
        <>
          <Text style={styles.calloutWhen}>{longDate(picked.date)}</Text>
          <Text style={styles.calloutValue}>{picked.value > 0 ? format(picked.value) : 'Nothing'}</Text>
          {picked.count > 0 ? (
            <Text style={styles.calloutCount}>
              {picked.count} {picked.count === 1 ? noun.one : noun.many}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.calloutHint}>Tap a day to see it</Text>
      )}
    </View>
  );

  const legend = (
    <View style={styles.legend}>
      <Text style={styles.legendText}>Less</Text>
      {[colors.well, ...ramp].map((fill) => (
        <View key={fill} style={[styles.legendSwatch, { backgroundColor: fill }]} />
      ))}
      <Text style={styles.legendText}>More</Text>
    </View>
  );

  if (calendar) {
    return (
      <View>
        {callout}
        <View style={styles.headRow}>
          {WEEKDAYS.map((day, i) => (
            <Text key={`${day}-${i}`} style={[styles.head, { width: cell }]}>
              {day}
            </Text>
          ))}
        </View>
        <View style={{ gap: GAP }}>
          {weeks.map((week) => (
            <View key={week[0].date} style={{ flexDirection: 'row', gap: GAP }}>
              {week.map((c) =>
                c.outside ? (
                  <View key={c.date} style={{ width: cell, height: cell }} />
                ) : (
                  <Pressable
                    key={c.date}
                    onPress={() => select(c)}
                    accessibilityRole="button"
                    accessibilityLabel={label(c)}
                    style={[
                      styles.day,
                      {
                        width: cell,
                        height: cell,
                        backgroundColor: fillFor(c),
                        borderColor: picked?.date === c.date ? colors.ink : 'transparent',
                      },
                    ]}
                  >
                    <Text style={[styles.dayNumber, { color: textFor(c) }]}>{Number(c.date.slice(8))}</Text>
                  </Pressable>
                )
              )}
            </View>
          ))}
        </View>
        {legend}
      </View>
    );
  }

  // Longer than a month: weeks as columns, newest on the right.
  const monthMarks = weeks.map((week, i) => {
    const firstInside = week.find((c) => !c.outside && Number(c.date.slice(8)) <= 7);
    const prev = weeks[i - 1];
    const changed = !prev || prev[0].date.slice(5, 7) !== week[6].date.slice(5, 7);
    return firstInside && changed ? MONTHS[Number(week[6].date.slice(5, 7)) - 1] : '';
  });

  return (
    <View>
      {callout}
      <View style={{ flexDirection: 'row' }}>
        <View style={{ marginTop: 16, gap: SMALL_GAP, marginRight: 6 }}>
          {WEEKDAYS.map((day, i) => (
            <Text key={`${day}-${i}`} style={[styles.sideHead, { height: SMALL_CELL }]}>
              {i % 2 === 0 ? day : ''}
            </Text>
          ))}
        </View>
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
        >
          <View style={{ gap: SMALL_GAP }}>
            {/* Month names sit over the week they start in, free to run past it. */}
            <View style={{ height: 13, width: weeks.length * (SMALL_CELL + SMALL_GAP) }}>
              {monthMarks.map((mark, i) =>
                mark ? (
                  <Text
                    key={`${weeks[i][0].date}-m`}
                    style={[styles.monthMark, { left: i * (SMALL_CELL + SMALL_GAP) }]}
                    numberOfLines={1}
                  >
                    {mark}
                  </Text>
                ) : null
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: SMALL_GAP }}>
              {weeks.map((week) => (
                <View key={week[0].date} style={{ gap: SMALL_GAP }}>
                  {week.map((c) =>
                    c.outside ? (
                      <View key={c.date} style={{ width: SMALL_CELL, height: SMALL_CELL }} />
                    ) : (
                      <Pressable
                        key={c.date}
                        onPress={() => select(c)}
                        hitSlop={4}
                        accessibilityRole="button"
                        accessibilityLabel={label(c)}
                        style={{
                          width: SMALL_CELL,
                          height: SMALL_CELL,
                          borderRadius: 3,
                          backgroundColor: fillFor(c),
                          borderWidth: picked?.date === c.date ? 1.5 : 0,
                          borderColor: colors.ink,
                        }}
                      />
                    )
                  )}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
      {legend}
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    callout: { flexDirection: 'row', alignItems: 'baseline', gap: 8, minHeight: 24, marginBottom: 8, flexWrap: 'wrap' },
    calloutWhen: { fontFamily: FONTS.sans, fontSize: 13, color: colors.graphite },
    calloutValue: { fontFamily: FONTS.monoMedium, fontSize: 16, color: colors.ink },
    calloutCount: { fontFamily: FONTS.mono, fontSize: 12, color: colors.mist },
    calloutHint: { fontFamily: FONTS.sans, fontSize: 12, color: colors.mist },
    headRow: { flexDirection: 'row', gap: GAP, marginBottom: 6 },
    head: { textAlign: 'center', fontFamily: FONTS.mono, fontSize: 11, color: colors.mist },
    day: { borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    dayNumber: { fontFamily: FONTS.mono, fontSize: 12 },
    sideHead: { fontFamily: FONTS.mono, fontSize: 10, lineHeight: 14, color: colors.mist },
    monthMark: { position: 'absolute', top: 0, width: 32, fontFamily: FONTS.mono, fontSize: 10, color: colors.graphite },
    legend: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 4, marginTop: 10 },
    legendSwatch: { width: 12, height: 12, borderRadius: 3 },
    legendText: { fontFamily: FONTS.sans, fontSize: 11, color: colors.graphite, marginHorizontal: 2 },
  });
}
