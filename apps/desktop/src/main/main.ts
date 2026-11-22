import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, net, protocol, session, shell } from 'electron';
import { APP_BASE, APP_ORIGIN, appFile, isExternalLink } from './app-origin';
import { watchCaptions } from './captions';
import { AD_CHANNEL, CAPTION_CHANNEL, OPEN_EXTERNAL_CHANNEL } from '../shared/ipc';

const RENDERER = join(__dirname, '..', 'renderer');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/** Strict CSP for our own pages: no remote scripts; only the YouTube embed as a frame. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://i.ytimg.com",
  "font-src 'self'",
  "media-src 'self' blob:",
  "connect-src 'self'",
  'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function serveApp(): void {
  // App pages live at the project's https address; every other https request goes out as usual.
  protocol.handle('https', async (request) => {
    // Tests (Playwright, from the main process only) may answer requests themselves.
    const fake = (
      globalThis as { __shadowLingoTestFetch?: (url: string) => Response | undefined }
    ).__shadowLingoTestFetch?.(request.url);
    if (fake) return fake;
    const file = appFile(request.url, RENDERER);
    if (!request.url.startsWith(APP_BASE)) {
      return net.fetch(request, { bypassCustomProtocolHandlers: true });
    }
    if (!file) return new Response('Not found', { status: 404 });
    try {
      const body = await readFile(file);
      return new Response(body, {
        headers: {
          'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
          'content-security-policy': CSP,
          'x-content-type-options': 'nosniff',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function guardSession(): void {
  const s = session.defaultSession;
  // Only fullscreen (the player's own button); no other permission prompts for now.
  s.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(permission === 'fullscreen'),
  );
  // YouTube's own requests (player, ads) are never blocked. Embedded players must send a
  // Referer that names the app (YouTube API terms; without it the embed shows error 153).
  s.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube.com/*', 'https://www.youtube-nocookie.com/*'] },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      if (!headers.Referer && !headers.referer) headers.Referer = `${APP_ORIGIN}/`;
      callback({ requestHeaders: headers });
    },
  );
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'ShadowLingo',
    backgroundColor: '#171a20',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      preload: join(__dirname, '..', 'preload', 'preload.js'),
    },
  });

  // Never navigate away from the app; links open in the system browser when allowed.
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(APP_BASE)) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalLink(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  const stop = watchCaptions(
    win.webContents.debugger,
    (caption) => {
      if (!win.isDestroyed()) win.webContents.send(CAPTION_CHANNEL, caption);
    },
    (showing) => {
      if (!win.isDestroyed()) win.webContents.send(AD_CHANNEL, showing);
    },
  );
  win.on('closed', stop);

  void win.loadURL(APP_BASE);
  return win;
}

// Tests run with their own profile so they never touch the learner's data.
if (process.env.SHADOWLINGO_USER_DATA) app.setPath('userData', process.env.SHADOWLINGO_USER_DATA);

app.enableSandbox();
/**
 * No default menu (it offers developer tools). macOS keeps the app and Edit menus, which
 * its copy/paste shortcuts need.
 */
function setMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
  );
}

app.whenReady().then(() => {
  setMenu();
  serveApp();
  guardSession();
  ipcMain.handle(OPEN_EXTERNAL_CHANNEL, (_e, url: unknown) => {
    if (typeof url === 'string' && isExternalLink(url)) void shell.openExternal(url);
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Refuse webviews and any attempt to attach one.
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault());
});
