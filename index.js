import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';
import notifee from '@notifee/react-native';

// Handle notification action buttons when app is in background / killed
notifee.onBackgroundEvent(async ({ type, detail }) => {
  // EventType.PRESS = 1, EventType.ACTION_PRESS = 2
  if (detail.pressAction && detail.pressAction.id === 'yt_stop') {
    await notifee.cancelNotification('yt_media');
  }
});

AppRegistry.registerComponent(appName, () => App);
