'use client';
import { useTranslations } from 'next-intl';

import { useRef, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

export function useUnsavedChangesDialog() {
  const t = useTranslations('Unsaved');
  const [open, setOpen] = useState(false);
  const resolve = useRef<((discard: boolean) => void) | null>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  function finish(discard: boolean) {
    setOpen(false);
    resolve.current?.(discard);
    resolve.current = null;
  }

  function confirmDiscard(): Promise<boolean> {
    if (resolve.current) return Promise.resolve(false);
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
    return new Promise((answer) => {
      resolve.current = answer;
    });
  }

  const dialog = (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) finish(false);
      }}
    >
      <DialogContent
        className="unsaved-dialog"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          keepEditing.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocus.current?.isConnected) returnFocus.current.focus();
        }}
      >
        <div className="dialog-heading">
          <span className="dialog-symbol">
            <CircleAlert aria-hidden="true" />
          </span>
          <div>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </div>
        </div>
        <div className="dialog-actions">
          <Button ref={keepEditing} type="button" onClick={() => finish(false)}>
            {t('keep')}
          </Button>
          <Button
            variant="outline"
            className="discard-button"
            type="button"
            onClick={() => finish(true)}
          >
            {t('discard')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
  return { confirmDiscard, dialog };
}
