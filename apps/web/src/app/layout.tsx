import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { initialPreferences } from '@/lib/initial-preferences';
import { LocaleProvider } from '@/components/locale-provider';
import { getLocale, getTranslations } from 'next-intl/server';
const baseMetadata: Metadata = {
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
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Common');
  return { ...baseMetadata, description: t('description') };
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f62fe' };
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const preference = await initialPreferences();
  const locale = await getLocale();
  return (
    <html lang={locale} data-theme={preference.theme}>
      <body>
        <LocaleProvider
          initialLocale={locale}
          initialPreference={preference.language}
          initialSignedIn={preference.signedIn}
        >
          <ThemeProvider initialPreference={preference.theme}>{children}</ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
