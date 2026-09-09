'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';

export function AccountSettingsTabs({
  value,
  onValueChange,
  disabled = false,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('Account');
  return (
    <Tabs value={value} onValueChange={onValueChange} activationMode="manual">
      <TabsList className="account-nav" aria-label={t('accountSettings')} variant="line">
        <TabsTrigger value="profile" disabled={disabled}>
          {t('profile')}
        </TabsTrigger>
        <TabsTrigger value="security" disabled={disabled}>
          {t('security')}
        </TabsTrigger>
        <TabsTrigger value="data" disabled={disabled}>
          {t('privacy')}
        </TabsTrigger>
      </TabsList>
      {children}
    </Tabs>
  );
}
