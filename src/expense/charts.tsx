import React from 'react';
import { View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { monthName } from './dates';
import type { CatTotal, DayTotal } from './stats';
import { useTheme } from './theme';
import { Meter, Row, T } from './ui';
import { fmtMoney } from './stats';

/** Bar with a rounded free end and a square end on the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(3, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

/**
 * Axis label for a bucket: "1 Oct" for days and weeks, "Oct 2026" for a
 * month bucket (whose label is the two-digit month).
 */
function tick(d: DayTotal) {
  const [y, m, day] = d.date.split('-');
  if (!y || !m) return d.label;
  const mi = Number(m) - 1;
  if (d.label === m) return `${monthName(mi)} ${y}`;
  return `${Number(day)} ${monthName(mi)}`;
}

/** Bars over time. Empty slots show as a short grey stub so gaps read as "nothing", not "missing". */
export function Bars({ data, width, height = 96 }: { data: DayTotal[]; width: number; height?: number }) {
  const { c } = useTheme();
  const max = Math.max(...data.map((d) => d.total), 1);
  const n = Math.max(data.length, 1);
  const gap = n > 60 ? 1 : n > 24 ? 2 : 3;
  const slot = width / n;
  const barW = Math.max(Math.min(slot - gap, 26), 1.5);

  return (
    <View>
      <Svg width={width} height={height}>
        {data.map((d, i) => {
          const h = d.total > 0 ? Math.max((d.total / max) * (height - 4), 3) : 0;
          const x = i * slot + (slot - barW) / 2;
          return (
            <G key={d.date + i}>
              {h > 0 ? (
                <Path d={barPath(x, height - h, barW, h)} fill={c.accent} />
              ) : (
                <Rect x={x} y={height - 2} width={barW} height={2} fill={c.line} />
              )}
            </G>
          );
        })}
      </Svg>
      {data.length > 0 ? (
        <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
          <T size={12} sub>{tick(data[0])}</T>
          {data.length > 1 ? <T size={12} sub>{tick(data[data.length - 1])}</T> : null}
        </Row>
      ) : null}
    </View>
  );
}

/**
 * Ranked magnitude comparison. Every row is directly labelled, so the colour is
 * identity only — never the sole carrier of meaning.
 */
export function RankedCategories({
  data,
  total,
  budgets,
}: {
  data: CatTotal[];
  total: number;
  /** Monthly budget per category name, for the ones that have one. */
  budgets?: Map<string, number>;
}) {
  const { c, symbol } = useTheme();
  const max = Math.max(...data.map((d) => d.total), 1);

  return (
    <View style={{ gap: 12 }}>
      {data.map((k) => {
        const budget = budgets?.get(k.name);
        // Where the budget falls on the same scale as the bars. Past the end
        // of the track means the budget is larger than the biggest category,
        // and there is nowhere honest to draw it.
        const mark = budget && budget > 0 ? budget / max : null;
        const pct = total > 0 ? Math.round((k.total / total) * 100) : 0;
        return (
          <View key={k.name} style={{ gap: 6 }}>
            <Row style={{ justifyContent: 'space-between', gap: 10 }}>
              <T size={15} numberOfLines={1} style={{ flex: 1 }}>{k.name}</T>
              <T size={14} tabular>{fmtMoney(k.total, symbol)} · {pct}%</T>
            </Row>
            <View>
              <Meter fraction={k.total / max} tone={k.color} height={6} />
              {mark !== null && mark <= 1 && (
                <View
                  pointerEvents="none"
                  accessibilityLabel={`Budget mark for ${k.name}`}
                  style={{
                    position: 'absolute',
                    left: `${mark * 100}%`,
                    top: -2,
                    width: 2,
                    height: 10,
                    borderRadius: 1,
                    backgroundColor: c.text,
                  }}
                />
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
