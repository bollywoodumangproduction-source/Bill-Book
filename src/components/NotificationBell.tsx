import { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, X, CheckCircle2, Wallet, Camera, Clock, Info } from 'lucide-react';
import type { BookingNotification, NotificationType } from '@/lib/types';
import { fetchNotifications, markAllNotificationsRead } from '@/lib/notifications';

const TYPE_ICONS: Record<NotificationType, { icon: typeof Bell; color: string; bg: string }> = {
  payment: { icon: Wallet, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  work_status: { icon: CheckCircle2, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
  reminder: { icon: Clock, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell({ bookingId }: { bookingId: string }) {
  const [notifications, setNotifications] = useState<BookingNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchNotifications(bookingId);
    setNotifications(data);
    setLoading(false);
  }, [bookingId]);

  useEffect(() => { load(); }, [load]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead(bookingId);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  return (
    <>
      <button
        onClick={() => { setOpen(!open); if (!open && unreadCount > 0) handleMarkAllRead(); }}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 sm:absolute" onClick={() => setOpen(false)}>
          <div className="absolute right-0 top-14 z-50 w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900 sm:right-4 sm:top-auto sm:mt-2">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <Bell className="h-4 w-4 text-amber-500" /> Notifications
              </h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllRead} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-500 dark:text-amber-400" title="Mark all as read">
                    <CheckCheck className="h-3.5 w-3.5" />
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Bell className="h-5 w-5 animate-pulse text-amber-500" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Info className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-400">No notifications yet</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-white/5">
                  {notifications.map((n) => {
                    const cfg = TYPE_ICONS[n.type];
                    const Icon = cfg.icon;
                    return (
                      <div key={n.id} className={`flex gap-3 px-4 py-3 ${n.is_read ? 'opacity-60' : ''}`}>
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
                          <Icon className={`h-4 w-4 ${cfg.color}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{n.title}</p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{n.message}</p>
                          <p className="mt-1 text-[11px] text-slate-400">{timeAgo(n.created_at)}</p>
                        </div>
                        {!n.is_read && <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
