import { useEffect, useState } from 'react';
import { Animated, Text, type StyleProp, type TextStyle } from 'react-native';
import { getSetting, setSetting } from '../../db/queries';

interface Props {
  value: number;
  format: (value: number) => string;
  style?: StyleProp<TextStyle>;
  /**
   * Names this figure for the once-a-day rule. Counting up is a small moment
   * the first time you open a screen in a day; on every visit it would only be
   * a delay between you and the number.
   */
  onceADayKey: string;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * A figure that counts up to its value — once a day, then it simply shows.
 *
 * Runs in about two thirds of a second and eases out, so it lands rather than
 * stops. Outside that one animation it always shows the current value, so a
 * figure that changes afterwards (a new expense) is right at once.
 */
export function CountUp({ value, format, style, onceADayKey }: Props) {
  const [progress] = useState(() => new Animated.Value(1));
  const [animating, setAnimating] = useState(false);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let active = true;
    const key = `countup:${onceADayKey}`;
    void getSetting(key)
      .then((last) => {
        if (!active || last === today()) return;
        void setSetting(key, today());
        progress.setValue(0);
        setAnimating(true);
        Animated.timing(progress, { toValue: 1, duration: 650, useNativeDriver: false }).start(() => {
          if (active) setAnimating(false);
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [onceADayKey, progress]);

  useEffect(() => {
    const id = progress.addListener(({ value: p }) => {
      setShown(value * (1 - Math.pow(1 - p, 3)));
    });
    return () => progress.removeListener(id);
  }, [progress, value]);

  return (
    <Text style={style} accessibilityLabel={format(value)}>
      {format(animating ? shown : value)}
    </Text>
  );
}
