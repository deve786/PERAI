import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../ThemeContext';
import { type Colors } from '../theme';

/** Bar with a rounded free end and a square end on the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(3, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

/**
 * A single proportion, read at a glance — how much of the whole is finished.
 * The figure sits in the middle because the ring alone is only ever an
 * impression, and the number is the thing being claimed.
 */
export function Donut({
  fraction,
  figure,
  caption,
  size = 104,
}: {
  fraction: number;
  figure: string;
  caption: string;
  size?: number;
}) {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);

  const stroke = 9;
  const radius = (size - stroke) / 2;
  const centre = size / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(fraction, 1)) * circumference;

  return (
    <View style={styles.donutWrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={centre}
            cy={centre}
            r={radius}
            stroke={colors.rule}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={centre}
            cy={centre}
            r={radius}
            stroke={colors.moss}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            transform={`rotate(-90 ${centre} ${centre})`}
          />
        </Svg>
        <View style={[styles.donutCentre, { width: size, height: size }]}>
          <Text style={[type.figure, styles.donutFigure]}>{figure}</Text>
        </View>
      </View>
      <Text style={[type.stamp, styles.donutCaption]}>{caption.toUpperCase()}</Text>
    </View>
  );
}

/**
 * Two series over the same buckets, side by side. Used for money in against
 * money out, where the comparison is the whole point and two separate charts
 * would make the reader do the work.
 */
export function DualBars({
  data,
  width,
  height = 132,
  labels,
}: {
  data: { label: string; a: number; b: number }[];
  width: number;
  height?: number;
  labels: [string, string];
}) {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);

  const max = Math.max(...data.flatMap((d) => [d.a, d.b]), 1);
  const padB = 18;
  const chartH = height - padB;
  const n = Math.max(data.length, 1);
  const slot = width / n;
  const barW = Math.max(Math.min((slot - 4) / 2, 12), 1.5);
  const labelEvery = n > 24 ? 5 : n > 12 ? 2 : 1;

  return (
    <View>
      <View style={styles.legend}>
        {([[labels[0], colors.moss], [labels[1], colors.ink]] as const).map(([label, tone]) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: tone }]} />
            <Text style={[type.stamp, styles.legendText]}>{label.toUpperCase()}</Text>
          </View>
        ))}
      </View>
      <Svg width={width} height={height}>
        <Line x1={0} y1={chartH} x2={width} y2={chartH} stroke={colors.rule} strokeWidth={1} />
        {data.map((d, i) => {
          const base = i * slot + (slot - barW * 2 - 2) / 2;
          const hA = d.a > 0 ? Math.max((d.a / max) * (chartH - 8), 2) : 0;
          const hB = d.b > 0 ? Math.max((d.b / max) * (chartH - 8), 2) : 0;
          return (
            <G key={d.label + i}>
              {hA > 0 && <Path d={barPath(base, chartH - hA, barW, hA)} fill={colors.moss} />}
              {hB > 0 && (
                <Path d={barPath(base + barW + 2, chartH - hB, barW, hB)} fill={colors.ink} opacity={0.85} />
              )}
              {i % labelEvery === 0 && (
                <SvgText
                  x={base + barW}
                  y={height - 4}
                  fontSize={10}
                  fill={colors.mist}
                  textAnchor="middle"
                >
                  {d.label}
                </SvgText>
              )}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

/**
 * A ranked list of counts, each row directly labelled with its figure. The bar
 * is there to compare at a glance; the number is there to be read exactly.
 */
export function RankedCounts({
  data,
  unit,
  limit = 8,
}: {
  data: { name: string; count: number }[];
  unit?: string;
  limit?: number;
}) {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);

  const shown = data.slice(0, limit);
  const max = Math.max(...shown.map((d) => d.count), 1);

  return (
    <View>
      {shown.map((row) => (
        <View key={row.name} style={styles.rankRow}>
          <View style={styles.rankHead}>
            <Text style={[type.body, styles.rankName]} numberOfLines={1}>
              {row.name}
            </Text>
            <Text style={[type.figure, styles.rankCount]}>
              {row.count}
              {unit ? ` ${unit}` : ''}
            </Text>
          </View>
          <Svg width="100%" height={4}>
            <Rect x={0} y={0} width="100%" height={4} fill={colors.rule} />
            <Rect x={0} y={0} width={`${(row.count / max) * 100}%`} height={4} fill={colors.moss} />
          </Svg>
        </View>
      ))}
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    donutWrap: { alignItems: 'center', gap: 8 },
    donutCentre: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    donutFigure: { fontSize: 22, color: colors.ink },
    donutCaption: { color: colors.mist, textAlign: 'center' },
    legend: { flexDirection: 'row', gap: 14, marginBottom: 8 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendSwatch: { width: 8, height: 8, borderRadius: 2 },
    legendText: { color: colors.mist },
    rankRow: { paddingVertical: 9, gap: 7 },
    rankHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
    rankName: { flex: 1, color: colors.ink },
    rankCount: { fontSize: 14, color: colors.graphite },
  });
}
