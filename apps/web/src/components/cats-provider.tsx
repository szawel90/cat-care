'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  startTransition,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { CatRecord } from '@cat-care/shared';
import { authClient } from '@/lib/auth-client';
import { catRequest } from '@/lib/cats-api';
import { CatPicker } from './cat-picker';

type CatsContextValue = {
  cats: CatRecord[];
  status: 'loading' | 'ready' | 'error';
  selectedId: string | null;
  ownerId: string | null;
  refresh: () => Promise<void>;
  select: (id: string) => void;
  getDraft: (key: string) => unknown;
  setDraft: (key: string, value: unknown) => void;
  clearDraft: (key: string) => void;
};
const emptyCats: CatRecord[] = [];
const CatsContext = createContext<CatsContextValue | null>(null);

export function CatsProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending, error } = authClient.useSession();
  const ownerId = session && !error ? session.user.id : null;
  const pathname = usePathname();
  const [state, setState] = useState<{
    ownerId: string | null;
    cats: CatRecord[];
    status: CatsContextValue['status'];
  }>({ ownerId: null, cats: [], status: 'loading' });
  const [selection, setSelection] = useState<{ ownerId: string; id: string } | null>(null);
  const revision = useRef(0);
  const drafts = useRef(new Map<string, unknown>());
  const refresh = useCallback(async () => {
    const requestRevision = ++revision.current;
    if (!ownerId) {
      drafts.current.clear();
      return;
    }
    try {
      const cats = await catRequest<CatRecord[]>('');
      if (requestRevision !== revision.current) return;
      setState({ ownerId, cats, status: 'ready' });
      try {
        const saved = sessionStorage.getItem('cat-care-selected:' + ownerId);
        if (saved && cats.some((cat) => cat.id === saved)) setSelection({ ownerId, id: saved });
      } catch {
        /* Selection still works when browser storage is unavailable. */
      }
    } catch {
      if (requestRevision === revision.current) setState({ ownerId, cats: [], status: 'error' });
    }
  }, [ownerId]);
  useEffect(() => {
    if (!isPending) startTransition(() => refresh());
  }, [refresh, isPending]);
  const cats = state.ownerId === ownerId && ownerId && !isPending ? state.cats : emptyCats;
  const routeId = /^\/cats\/([^/]+)/.exec(pathname)?.[1];
  const selectedId =
    cats.find((cat) => cat.id === routeId)?.id ??
    cats.find((cat) => selection?.ownerId === ownerId && cat.id === selection.id)?.id ??
    cats[0]?.id ??
    null;
  const select = useCallback(
    (id: string) => {
      if (!ownerId) return;
      setSelection({ ownerId, id });
      try {
        sessionStorage.setItem('cat-care-selected:' + ownerId, id);
      } catch {
        /* Optional per-tab preference. */
      }
    },
    [ownerId],
  );
  useEffect(() => {
    if (routeId && cats.some((cat) => cat.id === routeId)) startTransition(() => select(routeId));
  }, [routeId, cats, select]);
  const keyFor = (key: string) => `${ownerId}:${key}`;
  return (
    <CatsContext.Provider
      value={{
        cats,
        ownerId,
        selectedId,
        select,
        refresh,
        status:
          !ownerId && !isPending
            ? 'ready'
            : isPending || state.ownerId !== ownerId
              ? 'loading'
              : state.status,
        getDraft: (key) => drafts.current.get(keyFor(key)),
        setDraft: (key, value) => {
          drafts.current.set(keyFor(key), value);
        },
        clearDraft: (key) => {
          drafts.current.delete(keyFor(key));
        },
      }}
    >
      {children}
    </CatsContext.Provider>
  );
}
export function useCats() {
  const value = useContext(CatsContext);
  if (!value) throw new Error('CatsProvider is missing');
  return value;
}
export function ActiveCatPicker({
  beforeNavigate,
  disabled = false,
}: {
  beforeNavigate?: () => Promise<boolean>;
  disabled?: boolean;
}) {
  const cats = useCats();
  const router = useRouter();
  async function navigate(id?: string) {
    if (disabled || (beforeNavigate && !(await beforeNavigate()))) return;
    if (id) cats.select(id);
    router.push(id ? '/cats/' + encodeURIComponent(id) : '/cats/new');
  }
  return (
    <CatPicker
      cats={cats.cats}
      selectedId={cats.selectedId}
      status={cats.status}
      disabled={disabled}
      onSelect={(id) => void navigate(id)}
      onAdd={() => void navigate()}
      onRetry={() => void cats.refresh()}
    />
  );
}
