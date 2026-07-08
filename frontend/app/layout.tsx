import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Thai } from 'next/font/google';
import './globals.css';

const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-sans-thai',
});

export const metadata: Metadata = {
  title: 'ระบบควบคุมโรงเพาะเห็ดฟาง',
  description: 'Dashboard ตรวจสอบและควบคุมโรงเพาะเห็ดฟาง',
};

// colorScheme: 'light' -> <meta name="color-scheme" content="light"> กัน dark mode มือถือทำพื้นดำ (ตาม CLAUDE.md)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  colorScheme: 'light',
  themeColor: '#2FA96A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={ibmPlexSansThai.variable} style={{ colorScheme: 'light' }}>
      <body className="min-h-screen bg-bg font-sans text-gray-800 antialiased">{children}</body>
    </html>
  );
}
