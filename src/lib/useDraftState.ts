import { useEffect, useRef, useState } from 'react';

const PREFIX = 'form-draft:';

/**
 * Persists a piece of form state to localStorage so a page refresh
 * does not erase entered data. The draft is automatically cleared
 * once `persist` is called (typically on successful save).
 *
 * Returns the persisted value (or `initial` when nothing is stored),
 * a setter that mirrors `useState`, and a `clear` function.
 */
export function useDraftState<T>(key: string, initial: T) {
  const storageKey = `${PREFIX}${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw) as T;
    } catch { /* ignore */ }
    return initial;
  });

  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch { /* ignore quota errors */ }
  }, [storageKey, value]);

  const clear = () => {
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    setValue(initial);
  };

  return [value, setValue, clear] as const;
}

/**
 * Tracks whether a form modal is open and persists the open-state
 * to localStorage so that a page refresh re-opens the form with its
 * draft data intact.
 *
 * Returns `[open, setOpen, clear]` where `clear` should be called
 * after a successful save or explicit close to remove the draft.
 */
export function useDraftOpen(key: string) {
  const storageKey = `${PREFIX}open:${key}`;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch { return false; }
  });

  useEffect(() => {
    try {
      if (open) localStorage.setItem(storageKey, '1');
      else localStorage.removeItem(storageKey);
    } catch { /* ignore */ }
  }, [storageKey, open]);

  const clear = () => {
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    setOpen(false);
  };

  return [open, setOpen, clear] as const;
}
