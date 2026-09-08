import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Cat Care',
  description: 'A thoughtful space for you and your cat.',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Cat Care', statusBarStyle: 'default' },
  icons: { apple: '/apple-touch-icon.png', icon: '/icon-192.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#264d3a' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
