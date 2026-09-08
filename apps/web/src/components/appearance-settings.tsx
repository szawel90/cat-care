'use client';
import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { Monitor, Sun, Moon, Check, CircleAlert } from 'lucide-react';
import { useAppearance } from './theme-provider';
import type { ThemePreference } from '@/lib/theme';
import { Button } from './ui/button';

const choices = [
  { value: 'system', Icon: Monitor },
  { value: 'light', Icon: Sun },
  { value: 'dark', Icon: Moon },
] as const;

export function AppearanceSettings({
  disabled,
  onSavingChange,
}: {
  disabled: boolean;
  onSavingChange: (saving: boolean) => void;
}) {
  const t = useTranslations('Appearance');
  const { preference, ready, loadError, save, refresh } = useAppearance();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<'' | 'saveError' | 'signInAgain'>('');

  async function choose(next: ThemePreference) {
    if (next === preference) return;
    setSaving(true);
    onSavingChange(true);
    setSaved(false);
    setError('');
    try {
      await save(next);
      setSaved(true);
    } catch (failure) {
      setError(
        failure instanceof Error && failure.message === 'signInAgain' ? 'signInAgain' : 'saveError',
      );
    } finally {
      setSaving(false);
      onSavingChange(false);
    }
  }

  return (
    <section className="appearance" aria-labelledby="appearance-title">
      <h2 id="appearance-title" className="section-title">
        {t('title')}
      </h2>
      <p className="hint" id="appearance-help">
        {t('help')}
      </p>
      <fieldset
        className="theme-choices"
        disabled={disabled || !ready || saving}
        aria-describedby="appearance-help"
        onChange={(event) => event.stopPropagation()}
      >
        <legend className="sr-only">{t('legend')}</legend>
        {choices.map(({ value, Icon }) => (
          <label className="theme-choice" key={value}>
            <input
              type="radio"
              name="themePreference"
              value={value}
              checked={preference === value}
              onChange={() => void choose(value)}
            />
            <span>
              <Icon aria-hidden="true" />
              {t(value)}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="appearance-feedback">
        {error ? (
          <p role="alert" className="appearance-error">
            <CircleAlert aria-hidden="true" />
            {t(error)}
          </p>
        ) : loadError ? (
          <div>
            <p role="alert">{t('loadError')}</p>
            <Button type="button" variant="outline" onClick={refresh}>
              {t('retry')}
            </Button>
          </div>
        ) : saving || saved ? (
          <p role="status">
            {!saving && <Check aria-hidden="true" />}
            {t(saving ? 'saving' : 'saved')}
          </p>
        ) : !ready ? (
          <p role="status">{t('loading')}</p>
        ) : null}
      </div>
    </section>
  );
}
