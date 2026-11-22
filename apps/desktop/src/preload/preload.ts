import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  AD_CHANNEL,
  CAPTION_CHANNEL,
  OPEN_EXTERNAL_CHANNEL,
  type DesktopBridge,
} from '../shared/ipc';

function isCaption(v: unknown): v is Parameters<Parameters<DesktopBridge['onCaption']>[0]>[0] {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return ['videoId', 'lang', 'kind', 'tlang', 'body'].every((k) => typeof r[k] === 'string');
}

/** The only API the page gets: no Node, no Electron objects. */
const bridge: DesktopBridge = {
  onCaption(listener) {
    const wrapped = (_e: IpcRendererEvent, c: unknown) => {
      if (isCaption(c)) listener(c);
    };
    ipcRenderer.on(CAPTION_CHANNEL, wrapped);
    return () => {
      ipcRenderer.removeListener(CAPTION_CHANNEL, wrapped);
    };
  },
  onAd(listener) {
    const wrapped = (_e: IpcRendererEvent, showing: unknown) => {
      if (typeof showing === 'boolean') listener(showing);
    };
    ipcRenderer.on(AD_CHANNEL, wrapped);
    return () => {
      ipcRenderer.removeListener(AD_CHANNEL, wrapped);
    };
  },
  openExternal(url) {
    void ipcRenderer.invoke(OPEN_EXTERNAL_CHANNEL, String(url));
  },
};

contextBridge.exposeInMainWorld('shadowLingo', bridge);
