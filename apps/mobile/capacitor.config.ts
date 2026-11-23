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
    // Older WebViews make Capacitor fall back to a bridge that every frame (YouTube's too)
    // could call; refuse them instead (WebMessageListener needs WebView 82+).
    minWebViewVersion: 100,
    allowMixedContent: false,
    captureInput: false,
  },
};

export default config;
