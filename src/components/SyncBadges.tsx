import { useSync } from '@/context/SyncContext';
import { Database, RefreshCw } from 'lucide-react';

function Dot({ status }: { status: 'online' | 'offline' }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full transition-colors ${
        status === 'online'
          ? 'bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]'
          : 'bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.6)]'
      }`}
    />
  );
}

export function SyncBadges({ compact = false }: { compact?: boolean }) {
  let syncState = null as ReturnType<typeof useSync> | null;
  try {
    syncState = useSync();
  } catch {
    syncState = null;
  }

  const supa = syncState?.supa ?? 'offline';
  const syncing = syncState?.syncing ?? false;
  const triggerSync = syncState?.triggerSync ?? (() => {});

  const statusLabel = supa === 'online' ? 'Supabase connected' : 'Supabase not connected';

  return (
    <div className={`flex items-center ${compact ? 'gap-1' : 'gap-2'}`}>
      <div
        className={`flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white py-1 dark:border-white/10 dark:bg-slate-800/60 ${compact ? 'px-1.5' : 'px-2'}`}
        title={statusLabel}
      >
        <Database className="h-3.5 w-3.5 text-sky-500" />
        {!compact && <span className="text-[10px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">SUPABASE</span>}
        <Dot status={supa} />
      </div>

      <button
        onClick={triggerSync}
        className={`flex items-center rounded-lg border border-slate-200 bg-white py-1 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800/60 dark:hover:bg-white/5 ${compact ? 'px-1.5' : 'gap-1.5 px-2'}`}
        title={syncing ? 'Checking Supabase…' : statusLabel}
      >
        <RefreshCw className={`h-3.5 w-3.5 text-slate-500 dark:text-slate-400 ${syncing ? 'animate-spin' : ''}`} />
        <span className={`${compact ? 'hidden' : 'hidden text-[10px] font-medium text-slate-500 dark:text-slate-400 sm:inline'}`}>
          {syncing ? 'Checking…' : supa === 'online' ? 'Connected' : 'Offline'}
        </span>
      </button>
    </div>
  );
}
