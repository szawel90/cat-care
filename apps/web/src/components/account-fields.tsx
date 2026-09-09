'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

export function PasswordField({
  id,
  label,
  newPassword = false,
}: {
  id: string;
  label?: string;
  newPassword?: boolean;
}) {
  const t = useTranslations('Account');
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <Label htmlFor={id}>{label ?? t('password')}</Label>
      <div className="password-wrap">
        <Input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          autoComplete={newPassword ? 'new-password' : 'current-password'}
          minLength={newPassword ? 12 : undefined}
          maxLength={128}
          required
        />
        <Button
          type="button"
          className="eye"
          aria-label={visible ? t('hidePassword') : t('showPassword')}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
      {newPassword && <p className="hint">{t('passwordHint')}</p>}
    </div>
  );
}

export function EmailField({ id = 'email', label }: { id?: string; label?: string }) {
  const t = useTranslations('Account');
  return (
    <div className="field">
      <Label htmlFor={id}>{label ?? t('email')}</Label>
      <Input
        id={id}
        name={id}
        type="email"
        autoComplete="email"
        placeholder={t('emailPlaceholder')}
        required
        maxLength={254}
      />
    </div>
  );
}
