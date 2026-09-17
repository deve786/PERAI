import { FlexWidget, ListWidget, TextWidget } from 'react-native-android-widget';
import type { Colors } from '../theme';
import type { Priority } from '../types';
import type { WidgetData } from './widgetItems';

export const WIDGET_NAME = 'Priority';

type Hex = `#${string}`;
const hex = (color: string) => color as Hex;

const SANS = 'IBMPlexSans_400Regular';
const SANS_MEDIUM = 'IBMPlexSans_500Medium';
const MONO = 'IBMPlexMono_500Medium';

function markColor(priority: Priority | null, colors: Colors): Hex {
  if (priority === 'high') return hex(colors.alert);
  if (priority === 'medium') return hex(colors.moss);
  if (priority === 'low') return hex(colors.mist);
  return hex(colors.rule);
}

/**
 * Open items, most important first. Every part of it opens the app: a widget
 * is for glancing, and anything more than that belongs in the app itself.
 */
export function PriorityWidget({ data, colors }: { data: WidgetData; colors: Colors }) {
  const { items, total } = data;

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: hex(colors.paper),
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <TextWidget text="PERAI" style={{ fontFamily: MONO, fontSize: 11, color: hex(colors.moss) }} />
        <TextWidget
          text={total === 0 ? 'ALL CLEAR' : `${total} OPEN`}
          style={{ fontFamily: MONO, fontSize: 11, color: hex(colors.mist) }}
        />
      </FlexWidget>

      {items.length === 0 ? (
        <FlexWidget
          clickAction="OPEN_APP"
          style={{ width: 'match_parent', height: 'match_parent', justifyContent: 'center' }}
        >
          <TextWidget
            text="Nothing to do. Tap to add something."
            style={{ fontFamily: SANS, fontSize: 14, color: hex(colors.graphite) }}
          />
        </FlexWidget>
      ) : (
        <ListWidget style={{ height: 'match_parent', width: 'match_parent' }}>
          {items.map((item) => (
            <FlexWidget
              key={item.id}
              clickAction="OPEN_APP"
              style={{
                width: 'match_parent',
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 6,
              }}
            >
              <FlexWidget
                style={{
                  width: 3,
                  height: 30,
                  borderRadius: 2,
                  marginRight: 10,
                  backgroundColor: markColor(item.priority, colors),
                }}
              />
              <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
                <TextWidget
                  text={item.title}
                  maxLines={1}
                  truncate="END"
                  style={{ fontFamily: SANS_MEDIUM, fontSize: 14, color: hex(colors.ink) }}
                />
                <TextWidget
                  text={[item.priority?.toUpperCase(), item.when?.toUpperCase()]
                    .filter(Boolean)
                    .join(' · ') || 'NO DATE'}
                  maxLines={1}
                  truncate="END"
                  style={{ fontFamily: MONO, fontSize: 10, color: hex(colors.graphite) }}
                />
              </FlexWidget>
            </FlexWidget>
          ))}
        </ListWidget>
      )}
    </FlexWidget>
  );
}
