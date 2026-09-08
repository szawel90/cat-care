'use client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

export function InstallApp() {
  const t = useTranslations('Install');
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    const display = window.matchMedia('(display-mode: standalone)');
    if (display.matches) done();
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', done);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', done);
    };
  }, []);
  if (installed) return null;
  return (
    <details className="install">
      <summary>{t('title')}</summary>
      <p className="hint">{t('help')}</p>
      {prompt && (
        <button
          className="primary"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
          }}
        >
          {t('button')}
        </button>
      )}
    </details>
  );
}
