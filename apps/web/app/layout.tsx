import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource/be-vietnam-pro/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/vietnamese-600.css';
import '@fontsource/be-vietnam-pro/vietnamese-700.css';
import '@fontsource/be-vietnam-pro/latin-400.css';
import '@fontsource/be-vietnam-pro/latin-600.css';
import '@fontsource/be-vietnam-pro/latin-700.css';
import './globals.css';
import { HERO } from './content';

const SITE = 'https://hoangtularva.github.io/shadow-lingo/';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: 'ShadowLingo · Luyện nói tiếng Anh theo video cho người Việt',
  description: HERO.text,
  openGraph: {
    title: 'ShadowLingo',
    description: HERO.title,
    url: SITE,
    locale: 'vi_VN',
    type: 'website',
  },
  icons: { icon: '/shadow-lingo/icon.png' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0F1115' },
    { media: '(prefers-color-scheme: light)', color: '#F9F9F9' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
