import { Platform } from 'react-native';
import {
  requestWidgetUpdate,
  type WidgetRepresentation,
  type WidgetTaskHandler,
} from 'react-native-android-widget';
import { initDatabase, onDatabaseChange } from '../db/client';
import { getAllMemories } from '../db/queries';
import { PALETTES } from '../theme';
import { PriorityWidget, WIDGET_NAME } from './PriorityWidget';
import { widgetItems, type WidgetData } from './widgetItems';

async function loadData(): Promise<WidgetData> {
  try {
    await initDatabase();
    return widgetItems(await getAllMemories());
  } catch {
    // An empty widget that opens the app beats a blank or broken one.
    return { items: [], total: 0 };
  }
}

/** Light and dark both, so the launcher can follow the phone's own setting. */
export async function renderPriorityWidget(): Promise<WidgetRepresentation> {
  const data = await loadData();
  return {
    light: <PriorityWidget data={data} colors={PALETTES.light} />,
    dark: <PriorityWidget data={data} colors={PALETTES.dark} />,
  };
}

/**
 * Runs headless when Android asks: the widget was just placed, resized, or its
 * 30-minute refresh came due (which keeps "Today"/"Tomorrow" labels true even
 * when the app isn't opened).
 */
export const widgetTaskHandler: WidgetTaskHandler = async ({ widgetAction, renderWidget }) => {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  renderWidget(await renderPriorityWidget());
};

/** Redraw placed widgets at launch and shortly after every write. */
export function startWidgetSync(): () => void {
  if (Platform.OS !== 'android') return () => {};

  const refresh = () =>
    void requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: renderPriorityWidget }).catch(
      () => {}
    );
  refresh();

  let pending: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = onDatabaseChange(() => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(refresh, 400);
  });

  return () => {
    if (pending) clearTimeout(pending);
    unsubscribe();
  };
}
