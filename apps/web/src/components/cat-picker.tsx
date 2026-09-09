'use client';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Cat, Check, ChevronDown, Plus, RefreshCw } from 'lucide-react';
import type { CatRecord } from '@cat-care/shared';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

export function CatAvatar({
  cat,
  large = false,
  preview,
}: {
  cat?: Pick<CatRecord, 'id' | 'hasPhoto' | 'photoVersion'>;
  large?: boolean;
  preview?: string | null;
}) {
  const source =
    preview !== undefined
      ? preview
      : cat?.hasPhoto
        ? `/api/cats/${cat.id}/photo?v=${cat.photoVersion}`
        : null;
  return (
    <span className={'cat-avatar' + (large ? ' cat-avatar-large' : '')} aria-hidden="true">
      {source ? (
        <Image unoptimized src={source} alt="" width={large ? 112 : 56} height={large ? 112 : 56} />
      ) : (
        <Cat />
      )}
    </span>
  );
}

export function CatPicker({
  cats,
  selectedId,
  status,
  onSelect,
  onAdd,
  onRetry,
  disabled = false,
}: {
  cats: CatRecord[];
  selectedId: string | null;
  status: 'ready' | 'loading' | 'error';
  disabled?: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations('Cats');
  if (status === 'loading')
    return (
      <div className="cat-picker-slot" role="status">
        <Button className="cat-picker" variant="outline" disabled>
          <Cat aria-hidden="true" />
          {t('loading')}
        </Button>
      </div>
    );
  if (status === 'error')
    return (
      <div className="cat-picker-slot">
        <Button
          className="cat-picker"
          variant="outline"
          onClick={onRetry}
          aria-label={t('errors.load') + ' ' + t('retry')}
        >
          <RefreshCw aria-hidden="true" />
          {t('retry')}
        </Button>
      </div>
    );
  if (!cats.length)
    return (
      <div className="cat-picker-slot">
        <Button className="cat-picker cat-picker-first" onClick={onAdd} disabled={disabled}>
          <Plus aria-hidden="true" />
          {t('addFirst')}
        </Button>
      </div>
    );
  const selected = cats.find((cat) => cat.id === selectedId) ?? cats[0]!;
  return (
    <div className="cat-picker-slot">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="cat-picker"
            disabled={disabled}
            aria-label={`${t('chooseCat')}: ${selected.name}`}
          >
            <CatAvatar cat={selected} />
            <span className="cat-picker-text">
              <small>{t('selectedCat')}</small>
              <strong>{selected.name}</strong>
            </span>
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" collisionPadding={12} className="cat-picker-menu">
          {cats.map((cat) => (
            <DropdownMenuItem key={cat.id} onSelect={() => onSelect(cat.id)} aria-label={cat.name}>
              <CatAvatar cat={cat} />
              <span>{cat.name}</span>
              {cat.id === selected.id && (
                <Check className="cat-check" aria-label={t('selectedCat')} />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onAdd}>
            <Plus aria-hidden="true" />
            {t('addAnother')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
