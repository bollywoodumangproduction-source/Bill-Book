import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useToast } from '@/context/ToastContext';
import { supabasePublic, supabaseConfigured } from '@/lib/supabase';

type SyncStatus = 'online' | 'offline';

interface SyncState {
  supa: SyncStatus;
  syncing: boolean;
  triggerSync: () => void;
}

const SyncContext = createContext<SyncState | null>(null);

// Share the check across provider remounts (including React Strict Mode) so a
// mount/reconnect burst cannot send duplicate REST requests.
const MIN_CHECK_INTERVAL_MS = 5_000;
const FAILURE_COOLDOWN_MS = 30_000;
let connectionCheckPromise: Promise<boolean> | null = null;
let lastConnectionCheckAt = 0;
let lastConnectionCheckResult = false;
let retryAfter = 0;
let lastFailureToastAt = 0;

async function checkSupabaseConnection(): Promise<boolean> {
  // The clients use placeholders when env vars are absent so the app can render.
  // Never send a request until both the project URL and public API key exist.
  if (!supabaseConfigured || typeof navigator === 'undefined' || !navigator.onLine) return false;
  if (connectionCheckPromise) return connectionCheckPromise;

  const now = Date.now();
  if (now < retryAfter || now - lastConnectionCheckAt < MIN_CHECK_INTERVAL_MS) {
    return lastConnectionCheckResult;
  }

  lastConnectionCheckAt = now;
  connectionCheckPromise = (async () => {
    try {
      const { error } = await supabasePublic
        .from('public_studio_settings')
        .select('id')
        .limit(1);

      if (error) {
        // Auth/configuration and permission failures are not fixed by retrying.
        // Cool down all failures to avoid repeated 401/403 requests and logs.
        retryAfter = Date.now() + FAILURE_COOLDOWN_MS;
        lastConnectionCheckResult = false;
      } else {
        retryAfter = 0;
        lastConnectionCheckResult = true;
      }
      return lastConnectionCheckResult;
    } catch {
      retryAfter = Date.now() + FAILURE_COOLDOWN_MS;
      lastConnectionCheckResult = false;
      return false;
    } finally {
      connectionCheckPromise = null;
    }
  })();

  return connectionCheckPromise;
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [supa, setSupa] = useState<SyncStatus>('offline');
  const [syncing, setSyncing] = useState(false);
  const mountedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkSupabase = useCallback(async () => {
    const connected = await checkSupabaseConnection();
    if (mountedRef.current) setSupa(connected ? 'online' : 'offline');
    return connected;
  }, []);

  const triggerSync = useCallback(() => {
    setSyncing(true);
    void checkSupabase().then((connected) => {
      if (!connected && Date.now() - lastFailureToastAt >= FAILURE_COOLDOWN_MS) {
        lastFailureToastAt = Date.now();
        toast('Could not connect to Supabase. Check project setup and access policies.', 'error');
      }
    }).finally(() => {
      if (mountedRef.current) setSyncing(false);
    });
  }, [checkSupabase, toast]);

  useEffect(() => {
    mountedRef.current = true;
    void checkSupabase();

    const handleOnline = () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        void checkSupabase();
      }, 500);
    };
    const handleOffline = () => setSupa('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkSupabase]);

  const value = useMemo<SyncState>(() => ({ supa, syncing, triggerSync }), [supa, syncing, triggerSync]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
