'use client';

import { useState } from 'react';
import { Monitor, Sun, Moon, Check, CircleAlert } from 'lucide-react';
import { useAppearance } from './theme-provider';
import type { ThemePreference } from '@/lib/theme';
import { Button } from './ui/button';

const choices = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const;

export function AppearanceSettings({
  disabled,
  onSavingChange,
}: {
  disabled: boolean;
  onSavingChange: (saving: boolean) => void;
}) {
  const { preference, ready, loadError, save, refresh } = useAppearance();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function choose(next: ThemePreference) {
    if (next === preference) return;
    setSaving(true);
    onSavingChange(true);
    setMessage('');
    setError('');
    try {
      await save(next);
      setMessage('Appearance saved.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Please try again.');
    } finally {
      setSaving(false);
      onSavingChange(false);
    }
  }

  return (
    <section className="appearance" aria-labelledby="appearance-title">
      <h2 id="appearance-title" className="section-title">
        Appearance
      </h2>
      <p className="hint" id="appearance-help">
        System follows this device. Light or Dark applies to your account on every device.
      </p>
      <fieldset
        className="theme-choices"
        disabled={disabled || !ready || saving}
        aria-describedby="appearance-help"
        onChange={(event) => event.stopPropagation()}
      >
        <legend className="sr-only">Color theme</legend>
        {choices.map(({ value, label, Icon }) => (
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
              {label}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="appearance-feedback">
        {error ? (
          <p role="alert" className="appearance-error">
            <CircleAlert aria-hidden="true" />
            {error}
          </p>
        ) : loadError ? (
          <div>
            <p role="alert">Could not load your appearance settings.</p>
            <Button type="button" variant="outline" onClick={refresh}>
              Try again
            </Button>
          </div>
        ) : saving || message ? (
          <p role="status">
            {!saving && <Check aria-hidden="true" />}
            {saving ? 'Saving appearance…' : message}
          </p>
        ) : !ready ? (
          <p role="status">Loading appearance…</p>
        ) : null}
      </div>
    </section>
  );
}
