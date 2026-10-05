import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useToast } from '@/context/ToastContext';
import { supabase, supabaseConfigured } from '@/lib/supabase';

type SyncStatus = 'online' | 'offline';

interface SyncState {
  supa: SyncStatus;
  syncing: boolean;
  triggerSync: () => void;
}

const SyncContext = createContext<SyncState | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [supa, setSupa] = useState<SyncStatus>('offline');
  const [syncing, setSyncing] = useState(false);

  const checkSupabase = useCallback(async () => {
    if (!supabaseConfigured || !navigator.onLine) {
      setSupa('offline');
      return false;
    }
    // This view is readable by anon and portal users, so the status means the
    // project is reachable without weakening private studio_settings RLS.
    const { error } = await supabase.from('public_studio_settings').select('id').limit(1);
    const connected = !error;
    setSupa(connected ? 'online' : 'offline');
    return connected;
  }, []);

  const triggerSync = useCallback(() => {
    setSyncing(true);
    void checkSupabase().then((connected) => {
      if (!connected) toast('Could not connect to Supabase. Check project setup and access policies.', 'error');
      setSyncing(false);
    }).catch(() => {
      setSupa('offline');
      setSyncing(false);
      toast('Could not connect to Supabase.', 'error');
    });
  }, [checkSupabase, toast]);

  useEffect(() => {
    void checkSupabase();
    const handleOnline = () => { void checkSupabase(); };
    const handleOffline = () => setSupa('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
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
