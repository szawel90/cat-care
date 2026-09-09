import type { Preview } from '@storybook/nextjs-vite';
import { useLayoutEffect } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { messagesFor } from '../src/i18n/messages';
import '../src/app/globals.css';
import './preview.css';

const preview: Preview = {
  tags: ['autodocs'],
  globalTypes: {
    theme: {
      description: 'Cat Care color theme',
      toolbar: {
        icon: 'paintbrush',
        dynamicTitle: true,
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
          { value: 'system', title: 'System' },
        ],
      },
    },
    locale: {
      description: 'Interface language',
      toolbar: {
        icon: 'globe',
        dynamicTitle: true,
        items: [
          { value: 'en', title: 'English' },
          { value: 'pl', title: 'Polski' },
        ],
      },
    },
  },
  initialGlobals: { theme: 'light', locale: 'en' },
  parameters: {
    layout: 'fullscreen',
    docs: { story: { inline: false, height: 400 } },
    nextjs: { appDirectory: true },
    backgrounds: { disable: true },
    controls: { expanded: true },
    viewport: {
      options: {
        phone: { name: 'Phone', styles: { width: '390px', height: '844px' } },
        narrow: { name: 'Narrow phone', styles: { width: '320px', height: '740px' } },
        tablet: { name: 'Tablet', styles: { width: '768px', height: '1024px' } },
        desktop: { name: 'Desktop', styles: { width: '1366px', height: '900px' } },
      },
    },
    a11y: {
      test: 'error',
      options: { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    },
  },
  decorators: [
    function Workbench(Story, context) {
      const locale = context.globals.locale === 'pl' ? 'pl' : 'en';
      const theme = ['light', 'dark', 'system'].includes(context.globals.theme)
        ? context.globals.theme
        : 'light';
      useLayoutEffect(() => {
        document.documentElement.lang = locale;
        document.documentElement.dataset.theme = theme;
      }, [locale, theme]);
      return (
        <NextIntlClientProvider locale={locale} messages={messagesFor(locale)} timeZone="UTC">
          <main className="workbench-stage">
            <Story />
          </main>
        </NextIntlClientProvider>
      );
    },
  ],
};

export default preview;
