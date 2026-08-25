import { useSync } from '@/context/SyncContext';
import { Zap, Cloud, RefreshCw } from 'lucide-react';

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

export function SyncBadges() {
  const { supa, drive, syncing, pendingCount, triggerSync } = useSync();

  const supaLabel = supa === 'online' ? 'Supabase connected' : 'Supabase offline — local mode';
  const driveLabel = drive === 'online' ? 'Drive backup connected' : 'Drive backup pending — local mode';
  const pendingLabel = pendingCount > 0 ? `${pendingCount} pending` : 'All synced';

  return (
    <div className="flex items-center gap-2">
      {/* SUPA badge */}
      <div
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-white/10 dark:bg-slate-800/60"
        title={supaLabel}
      >
        <Zap className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-[10px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">SUPA</span>
        <Dot status={supa} />
      </div>

      {/* DRIVE badge */}
      <div
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-white/10 dark:bg-slate-800/60"
        title={driveLabel}
      >
        <Cloud className="h-3.5 w-3.5 text-sky-500" />
        <span className="text-[10px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">DRIVE</span>
        <Dot status={drive} />
      </div>

      {/* Sync / pending indicator */}
      <button
        onClick={triggerSync}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800/60 dark:hover:bg-white/5"
        title={syncing ? 'Syncing…' : pendingLabel}
      >
        <RefreshCw className={`h-3.5 w-3.5 text-slate-500 dark:text-slate-400 ${syncing ? 'animate-spin' : ''}`} />
        <span className="hidden text-[10px] font-medium text-slate-500 dark:text-slate-400 sm:inline">
          {syncing ? 'Syncing…' : pendingCount > 0 ? `${pendingCount} pending` : 'Synced'}
        </span>
      </button>
    </div>
  );
}
