import Svg, { Circle, Path } from 'react-native-svg';
import { sparkPoints } from '../../charts/chartLogic';
import { useTheme } from '../../ThemeContext';

interface Props {
  values: number[];
  width?: number;
  height?: number;
}

/**
 * A word-sized trend: is this rising or falling, without opening anything.
 *
 * Drawn in the quiet grey so it never competes with the figure beside it,
 * with only the latest point in the accent — the one the eye should land on.
 * It has no axis, deliberately: it answers "which way", and the figure next
 * to it answers "how much".
 */
export function Sparkline({ values, width = 48, height = 18 }: Props) {
  const { colors } = useTheme();
  if (values.length < 2 || values.every((v) => v === 0)) return null;

  const points = sparkPoints(values, width, height);
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = points[points.length - 1];

  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={d} stroke={colors.mist} strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={lastX} cy={lastY} r={3} fill={colors.moss} stroke={colors.surface} strokeWidth={1.5} />
    </Svg>
  );
}
