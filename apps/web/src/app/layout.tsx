import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { initialTheme } from '@/lib/initial-theme';
export const metadata: Metadata = {
  title: 'Cat Care',
  description: 'A thoughtful space for you and your cat.',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Cat Care', statusBarStyle: 'default' },
  icons: {
    apple: '/apple-touch-icon.png',
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f62fe' };
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const preference = await initialTheme();
  return (
    <html lang="en" data-theme={preference}>
      <body>
        <ThemeProvider initialPreference={preference}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
