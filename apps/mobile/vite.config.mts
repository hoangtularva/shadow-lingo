import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The app pages for the Android WebView. Data files are copied by scripts/build.mjs.
export default defineConfig({
  root: fileURLToPath(new URL('./src', import.meta.url)),
  base: './',
  plugins: [tailwindcss()],
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    // Android System WebView updates with Chrome; 120+ covers supported devices.
    target: 'chrome120',
    sourcemap: false,
  },
});
