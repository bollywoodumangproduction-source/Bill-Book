import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useToast } from '@/context/ToastContext';
import { backupToDrive, readDriveMeta, syncConnectionState, type DriveBackupMeta } from '@/lib/driveBackup';
import { isGoogleConnected } from '@/lib/googleAuth';

type SyncStatus = 'online' | 'offline';

interface SyncState {
  supa: SyncStatus;
  drive: SyncStatus;
  syncing: boolean;
  pendingCount: number;
  driveMeta: DriveBackupMeta;
  triggerSync: () => void;
  enqueuePending: (n?: number) => void;
  refreshDriveMeta: () => void;
}

const SyncContext = createContext<SyncState | null>(null);

const PENDING_KEY = 'bumang_pending_sync';
const LAST_SYNC_KEY = 'bumang_last_sync';

function readPending(): number {
  try {
    return Number(localStorage.getItem(PENDING_KEY) || '0');
  } catch {
    return 0;
  }
}

function writePending(n: number) {
  try {
    localStorage.setItem(PENDING_KEY, String(n));
  } catch {
    /* ignore */
  }
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [supa, setSupa] = useState<SyncStatus>(() => (typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline'));
  const [drive, setDrive] = useState<SyncStatus>(() => (isGoogleConnected() ? 'online' : 'offline'));
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(() => readPending());
  const [driveMeta, setDriveMeta] = useState<DriveBackupMeta>(() => readDriveMeta());
  const prevSupa = useRef<SyncStatus>(supa);
  const prevDrive = useRef<SyncStatus>(drive);

  const flushPending = useCallback(async () => {
    setSyncing(true);
    // Simulate background push of pending localStorage records to remote (Supabase + Drive backup).
    await new Promise((r) => setTimeout(r, 400));
    // Push master backup to Drive (single overwrite).
    try {
      const meta = syncConnectionState(await backupToDrive());
      setDriveMeta(meta);
      setDrive(meta.connected ? 'online' : 'offline');
    } catch {
      /* ignore backup failure */
    }
    const remaining = readPending();
    if (remaining > 0) {
      writePending(0);
      setPendingCount(0);
    }
    try {
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    setSyncing(false);
  }, []);

  const triggerSync = useCallback(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    void flushPending();
  }, [flushPending]);

  const enqueuePending = useCallback((n = 1) => {
    setPendingCount((prev) => {
      const next = prev + n;
      writePending(next);
      return next;
    });
  }, []);

  const refreshDriveMeta = useCallback(() => {
    const meta = syncConnectionState(readDriveMeta());
    setDriveMeta(meta);
    setDrive(meta.connected ? 'online' : 'offline');
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setSupa('online');
      setDrive(isGoogleConnected() ? 'online' : 'offline');
      toast('Connection restored — syncing pending records', 'success');
      // Auto-sync when internet returns
      setTimeout(() => void flushPending(), 500);
    };
    const handleOffline = () => {
      setSupa('offline');
      setDrive(isGoogleConnected() ? 'online' : 'offline');
      toast('You are offline — changes saved locally and will sync automatically', 'info');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast, flushPending]);

  // Toast on transitions (deduplicated via refs)
  useEffect(() => {
    if (prevSupa.current !== supa) {
      prevSupa.current = supa;
    }
  }, [supa]);

  useEffect(() => {
    if (prevDrive.current !== drive) {
      prevDrive.current = drive;
    }
  }, [drive]);

  // On mount: if online and there are pending records, auto-flush
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine && readPending() > 0) {
      void flushPending();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<SyncState>(
    () => ({ supa, drive, syncing, pendingCount, driveMeta, triggerSync, enqueuePending, refreshDriveMeta }),
    [supa, drive, syncing, pendingCount, driveMeta, triggerSync, enqueuePending, refreshDriveMeta],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
