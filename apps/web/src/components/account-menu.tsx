'use client';
import { useTranslations } from 'next-intl';

import Link from 'next/link';
import type { MouseEventHandler } from 'react';
import { ChevronDown, Settings, LogOut } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';

export function AccountMenu({
  user,
  busy,
  onProfileClick,
  onSettings,
  onSignOut,
}: {
  user: { name: string; email: string };
  busy: boolean;
  onProfileClick?: MouseEventHandler<HTMLAnchorElement>;
  onSettings: () => void;
  onSignOut: () => void;
}) {
  const t = useTranslations('Common');
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="user-menu-trigger"
          aria-label={t('accountMenu', { name: user.name })}
          disabled={busy}
        >
          <span className="avatar user-avatar" aria-hidden="true">
            {user.name.charAt(0).toUpperCase()}
          </span>
          <span className="user-menu-name">{user.name}</span>
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={16} className="user-menu-content">
        <DropdownMenuItem asChild className="user-menu-profile">
          <Link
            href="/account"
            aria-label={t('viewProfile', { name: user.name })}
            onClick={onProfileClick}
          >
            <strong>{user.name}</strong>
            <span className="user-menu-email">{user.email}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSettings}>
          <Settings aria-hidden="true" />
          {t('settings')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut}>
          <LogOut aria-hidden="true" />
          {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
