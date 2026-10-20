import 'expo-router/entry';
import { createElement } from 'react';
import { Platform } from 'react-native';
import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { SingleRoot } from './src/singleRoot';
import { widgetTaskHandler } from './src/widget/widgetSync';

if (Platform.OS === 'android') {
  // Re-registers the router's own root, wrapped so only one copy of the app
  // draws at a time — see src/singleRoot.tsx. Android only: it's the only
  // platform where a share starts a second copy, and on web registering
  // again would start the app twice.
  renderRootComponent(function PeraiRoot() {
    return createElement(SingleRoot, null, createElement(App));
  });

  // Registered at the entry point, not inside a screen: Android wakes the widget
  // handler headless, without mounting any of the app's UI.
  registerWidgetTaskHandler(widgetTaskHandler);
}
