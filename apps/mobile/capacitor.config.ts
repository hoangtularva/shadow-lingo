import type { CapacitorConfig } from '@capacitor/cli';

// The app pages are served by the WebView itself at the project's address, so the YouTube
// embed gets a Referer naming the app (YouTube API terms; same as the desktop app).
const config: CapacitorConfig = {
  appId: 'io.github.hoangtularva.shadowlingo',
  appName: 'ShadowLingo',
  webDir: 'dist',
  // No bridge logging: it would print caption text to the system log.
  loggingBehavior: 'none',
  server: {
    androidScheme: 'https',
    hostname: 'hoangtularva.github.io',
  },
  android: {
    allowMixedContent: false,
    captureInput: false,
  },
};

export default config;
