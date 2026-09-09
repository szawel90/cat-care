'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, CircleAlert, Languages, Monitor } from 'lucide-react';
import { useLanguage } from './locale-provider';
import type { LanguagePreference } from '@/lib/locale';
import { Button } from './ui/button';

function useLanguageSelection() {
  const language = useLanguage();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<'' | 'saveError' | 'signInAgain' | 'wait'>('');
  async function choose(next: LanguagePreference, onSavingChange?: (saving: boolean) => void) {
    if (next === language.preference) return;
    setSaving(true);
    onSavingChange?.(true);
    setSaved(false);
    setError('');
    try {
      await language.save(next);
      setSaved(true);
    } catch (failure) {
      setError(
        failure instanceof Error && failure.message === 'signInAgain' ? 'signInAgain' : 'saveError',
      );
    } finally {
      setSaving(false);
      onSavingChange?.(false);
    }
  }
  return { ...language, saving, saved, error, choose };
}

export function LanguageSettings({
  disabled,
  onSavingChange,
}: {
  disabled: boolean;
  onSavingChange: (saving: boolean) => void;
}) {
  const t = useTranslations('Language');
  const state = useLanguageSelection();
  return (
    <section className="appearance language-settings" aria-labelledby="language-title">
      <h2 id="language-title" className="section-title">
        {t('title')}
      </h2>
      <p className="hint" id="language-help">
        {t('help')}
      </p>
      <fieldset
        className="theme-choices"
        disabled={disabled || !state.ready || state.saving}
        aria-describedby="language-help"
        onChange={(event) => event.stopPropagation()}
      >
        <legend className="sr-only">{t('legend')}</legend>
        {(['system', 'en', 'pl'] as const).map((value) => (
          <label className="theme-choice" key={value}>
            <input
              type="radio"
              name="languagePreference"
              value={value}
              checked={state.preference === value}
              onChange={() => void state.choose(value, onSavingChange)}
            />
            <span>
              {value === 'system' ? (
                <Monitor aria-hidden="true" />
              ) : (
                <Languages aria-hidden="true" />
              )}
              <span lang={value === 'system' ? undefined : value}>
                {value === 'system' ? t('system') : value === 'en' ? 'English' : 'Polski'}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="appearance-feedback">
        {state.error ? (
          <p role="alert" className="appearance-error">
            <CircleAlert aria-hidden="true" />
            {t(state.error)}
          </p>
        ) : state.loadError ? (
          <div>
            <p role="alert">{t('loadError')}</p>
            <Button type="button" variant="outline" onClick={state.refresh}>
              {t('retry')}
            </Button>
          </div>
        ) : state.saving || state.saved ? (
          <p role="status">
            {!state.saving && <Check aria-hidden="true" />}
            {t(state.saving ? 'saving' : 'saved')}
          </p>
        ) : !state.ready ? (
          <p role="status">{t('loading')}</p>
        ) : null}
      </div>
    </section>
  );
}

export function GuestLanguageSwitcher() {
  const t = useTranslations('Language');
  const state = useLanguageSelection();
  return (
    <div className="guest-language">
      <label>
        <Languages aria-hidden="true" />
        <span className="sr-only">{t('legend')}</span>
        <select
          value={state.preference}
          disabled={!state.ready || state.saving}
          onChange={(event) => void state.choose(event.target.value as LanguagePreference)}
        >
          <option value="system">{t('system')}</option>
          <option value="en" lang="en">
            English
          </option>
          <option value="pl" lang="pl">
            Polski
          </option>
        </select>
      </label>
      {state.error || state.loadError ? (
        <p role="alert">
          {t(state.error || 'loadError')}{' '}
          <button type="button" onClick={state.refresh}>
            {t('retry')}
          </button>
        </p>
      ) : null}
      {state.saving && (
        <span className="sr-only" role="status">
          {t('saving')}
        </span>
      )}
    </div>
  );
}
