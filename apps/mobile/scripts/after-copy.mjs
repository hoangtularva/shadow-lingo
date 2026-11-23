// Capacitor hook (capacitor:copy:after): runs after the web build is copied into a platform.
// iOS cannot read text from the player picture yet, so Tesseract's files (about 8 MB) are
// left out of its app.
import { rmSync } from 'node:fs';
import { join } from 'node:path';

if (process.env.CAPACITOR_PLATFORM_NAME === 'ios') {
  const root = process.env.CAPACITOR_ROOT_DIR ?? process.cwd();
  rmSync(join(root, 'ios/App/App/public/ocr'), { recursive: true, force: true });
}
