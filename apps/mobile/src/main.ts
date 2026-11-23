import { Capacitor } from '@capacitor/core';
import { startApp, type AppBridge } from '@shadow-lingo/shell';
import { createAndroidBridge, nativePlugin } from './bridge';
import './styles.css';

(window as unknown as { shadowLingo: AppBridge }).shadowLingo = createAndroidBridge(
  nativePlugin(),
  Capacitor.getPlatform(),
);
startApp();
