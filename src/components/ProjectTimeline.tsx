import { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  CheckCircle2,
  Clock,
  Camera,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import type { Booking, BookingNotification, NotificationType, WorkStatus } from '@/lib/types';
import { WORK_STATUS_LABELS } from '@/lib/types';
import { fetchNotifications, shouldShowShootReminder } from '@/lib/notifications';
import { formatINR, formatDate } from '@/lib/format';

const TYPE_CONFIG: Record<NotificationType, { icon: typeof Wallet; color: string; bg: string; ring: string }> = {
  payment: { icon: Wallet, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' },
  work_status: { icon: CheckCircle2, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/20' },
  reminder: { icon: Clock, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10', ring: 'ring-rose-500/20' },
};

const WORK_STATUS_ORDER: WorkStatus[] = ['pending', 'shoot_completed', 'editing_in_progress', 'album_design_ready', 'delivered'];
const WORK_STATUS_ICONS: Record<WorkStatus, typeof Camera> = {
  pending: Clock,
  shoot_completed: Camera,
  editing_in_progress: Sparkles,
  album_design_ready: CheckCircle2,
  delivered: CheckCircle2,
};

export function ProjectTimeline({ booking }: { booking: Booking }) {
  const [notifications, setNotifications] = useState<BookingNotification[]>([]);

  const load = useCallback(async () => {
    const data = await fetchNotifications(booking.id);
    setNotifications(data);
  }, [booking.id]);

  useEffect(() => { load(); }, [load]);

  const currentWorkStatus = booking.work_status ?? 'pending';
  const currentStatusIndex = WORK_STATUS_ORDER.indexOf(currentWorkStatus);
  const showReminder = booking.booking_status === 'CONFIRMED' && shouldShowShootReminder(booking.shoot_date);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
        <Clock className="h-4 w-4 text-amber-500" /> Project Status Timeline
      </h2>

      {/* Shoot Reminder Alert */}
      {showReminder && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/20 dark:bg-rose-500/10">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/10">
            <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Shoot Tomorrow!</p>
            <p className="mt-0.5 text-xs text-rose-600 dark:text-rose-400">
              Your event is scheduled for {formatDate(booking.shoot_date)} at {booking.shoot_time || '—'}. Please arrive on time at {booking.venue || 'the venue'}.
            </p>
          </div>
        </div>
      )}

      {/* Work Progress Tracker */}
      <div className="mb-5">
        <div className="flex items-center justify-between">
          {WORK_STATUS_ORDER.map((ws, i) => {
            const Icon = WORK_STATUS_ICONS[ws];
            const isCompleted = i <= currentStatusIndex;
            const isCurrent = i === currentStatusIndex;
            return (
              <div key={ws} className="flex flex-1 flex-col items-center">
                <div className="flex w-full items-center">
                  {i > 0 && <div className={`h-0.5 flex-1 ${i <= currentStatusIndex ? 'bg-amber-500' : 'bg-slate-200 dark:bg-white/10'}`} />}
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
                      isCompleted
                        ? 'border-amber-500 bg-amber-500 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-400 dark:border-white/10 dark:bg-slate-800'
                    } ${isCurrent ? 'ring-2 ring-amber-500/30 ring-offset-1 dark:ring-offset-slate-900' : ''}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  {i < WORK_STATUS_ORDER.length - 1 && <div className={`h-0.5 flex-1 ${i < currentStatusIndex ? 'bg-amber-500' : 'bg-slate-200 dark:bg-white/10'}`} />}
                </div>
                <span className={`mt-2 text-center text-[10px] font-medium leading-tight ${isCompleted ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                  {WORK_STATUS_LABELS[ws]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Notification Feed */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">Activity Feed</h3>
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 py-6 dark:border-white/5 dark:bg-white/5">
            <Clock className="h-5 w-5 text-slate-300 dark:text-slate-600" />
            <p className="text-xs text-slate-400">No activity yet. Updates will appear here as your project progresses.</p>
          </div>
        ) : (
          <div className="relative space-y-3 border-l-2 border-slate-100 pl-4 dark:border-white/10">
            {notifications.map((n) => {
              const cfg = TYPE_CONFIG[n.type];
              const Icon = cfg.icon;
              return (
                <div key={n.id} className="relative">
                  <div className={`absolute -left-[21px] flex h-6 w-6 items-center justify-center rounded-full ${cfg.bg} ring-2 ring-white dark:ring-slate-900`}>
                    <Icon className={`h-3 w-3 ${cfg.color}`} />
                  </div>
                  <div className="ml-2 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{n.title}</p>
                      <span className="text-[10px] text-slate-400">{formatDate(n.created_at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{n.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
