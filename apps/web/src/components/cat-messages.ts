'use client';
import { useMessages } from 'next-intl';
export function useCatMessages() {
  return useMessages().Cats as (typeof import('../../messages/en.json'))['Cats'];
}
