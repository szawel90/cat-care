'use client';
import { useEffect, useState } from 'react';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

export function InstallApp() {
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
      <summary>Add Cat Care to your home screen</summary>
      <p className="hint">
        On iPhone, open this page in Safari, choose Share, then Add to Home Screen. On Android, use
        Install app or Add to Home screen in your browser menu. An internet connection is needed to
        use your account.
      </p>
      {prompt && (
        <button
          className="primary"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
          }}
        >
          Install Cat Care
        </button>
      )}
    </details>
  );
}
