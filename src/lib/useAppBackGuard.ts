import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/** Keeps Android/browser back gestures inside an authenticated app screen. */
export function useAppBackGuard(onBack: () => void, enabled = true) {
  const location = useLocation();
  const onBackRef = useRef(onBack);
  const lastBackAt = useRef(0);
  onBackRef.current = onBack;

  const runBack = useCallback(() => {
    const now = Date.now();
    if (now - lastBackAt.current < 450) return;
    lastBackAt.current = now;
    onBackRef.current();
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const guardedUrl = `${window.location.origin}${location.pathname}${location.search}${location.hash}`;
    const guardedState = { ...(window.history.state ?? {}), __bufMobileBackGuard: true };
    window.history.pushState(guardedState, '', guardedUrl);

    const handlePopState = (event: PopStateEvent) => {
      // Run in capture phase before BrowserRouter can navigate out of the dashboard.
      event.stopImmediatePropagation();
      window.history.pushState(guardedState, '', guardedUrl);
      runBack();
    };

    window.addEventListener('popstate', handlePopState, true);
    return () => window.removeEventListener('popstate', handlePopState, true);
  }, [enabled, location.hash, location.pathname, location.search, runBack]);

  return runBack;
}
