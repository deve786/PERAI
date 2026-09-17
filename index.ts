import 'expo-router/entry';
import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widget/widgetSync';

// Registered at the entry point, not inside a screen: Android wakes the widget
// handler headless, without mounting any of the app's UI.
if (Platform.OS === 'android') registerWidgetTaskHandler(widgetTaskHandler);
