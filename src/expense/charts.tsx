import React from 'react';
import { View } from 'react-native';
import Svg, { G, Line, Path, Text as SvgText } from 'react-native-svg';
import type { CatTotal, DayTotal } from './stats';
import { useTheme } from './theme';
import { Meter, Money, Row, T } from './ui';

/** Bar with a rounded free end and a square end on the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

export function Bars({ data, width, height = 140 }: { data: DayTotal[]; width: number; height?: number }) {
  const { c } = useTheme();
  const max = Math.max(...data.map((d) => d.total), 1);
  const padB = 18;
  const chartH = height - padB;
  const n = Math.max(data.length, 1);
  const slot = width / n;
  // 2px of surface between neighbouring bars keeps them readable when dense.
  const barW = Math.max(Math.min(slot - 2, 26), 1.5);
  const labelEvery = n > 24 ? 5 : n > 12 ? 2 : 1;

  return (
    <Svg width={width} height={height}>
      <Line x1={0} y1={chartH} x2={width} y2={chartH} stroke={c.line} strokeWidth={1} />
      {data.map((d, i) => {
        const h = d.total > 0 ? Math.max((d.total / max) * (chartH - 8), 2) : 0;
        const x = i * slot + (slot - barW) / 2;
        return (
          <G key={d.date}>
            {h > 0 && <Path d={barPath(x, chartH - h, barW, h)} fill={c.text} opacity={0.85} />}
            {i % labelEvery === 0 && (
              <SvgText x={x + barW / 2} y={height - 4} fontSize={10} fill={c.faint} textAnchor="middle">
                {d.label}
              </SvgText>
            )}
          </G>
        );
      })}
    </Svg>
  );
}

/**
 * Ranked magnitude comparison. Every row is directly labelled, so the colour is
 * identity only — never the sole carrier of meaning.
 */
export function RankedCategories({ data, total }: { data: CatTotal[]; total: number }) {
  const { c } = useTheme();
  const max = Math.max(...data.map((d) => d.total), 1);

  return (
    <View>
      {data.map((k) => (
        <View key={k.name} style={{ paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <Row style={{ gap: 9, flex: 1 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: k.color }} />
              <T size={15} weight="600" numberOfLines={1}>{k.name}</T>
            </Row>
            <Row style={{ gap: 10 }}>
              <T size={13} sub tabular>{total > 0 ? Math.round((k.total / total) * 100) : 0}%</T>
              <Money value={k.total} size={15} weight="600" />
            </Row>
          </Row>
          <Meter fraction={k.total / max} tone={k.color} height={4} />
        </View>
      ))}
    </View>
  );
}
