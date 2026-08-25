import { useEffect, useState } from 'react';
import {
  CalendarCheck,
  CalendarClock,
  Clapperboard,
  Wallet,
  TrendingDown,
  ArrowRight,
  Sparkles,
  Home,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Booking, StudioLabOrder } from '@/lib/types';
import { formatINR, formatDate, todayISO, isToday, isUpcoming } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { useRefresh } from '@/context/RefreshContext';
import type { PageKey } from '@/lib/types';

interface DashboardProps {
  onNavigate: (page: PageKey) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { refreshToken } = useRefresh();
  const [loading, setLoading] = useState(true);
  const [todaysBookings, setTodaysBookings] = useState<Booking[]>([]);
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [activeLabOrders, setActiveLabOrders] = useState<StudioLabOrder[]>([]);
  const [totalDue, setTotalDue] = useState(0);

  useEffect(() => {
    (async () => {
      const [{ data: bookings }, { data: lab }] = await Promise.all([
        supabase.from('bookings').select('*').order('shoot_date'),
        supabase.from('studio_lab_orders').select('*').in('order_status', ['Processing']).order('created_at'),
      ]);

      const allBookings = (bookings ?? []) as Booking[];
      setTodaysBookings(allBookings.filter((b) => isToday(b.shoot_date)));
      setUpcomingBookings(allBookings.filter((b) => isUpcoming(b.shoot_date)).slice(0, 5));
      setActiveLabOrders((lab ?? []) as StudioLabOrder[]);
      setTotalDue(allBookings.reduce((s, b) => s + Number(b.net_due ?? 0), 0));
      setLoading(false);
    })();
  }, [refreshToken]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Sparkles className="h-6 w-6 animate-pulse text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{formatDate(todayISO())}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard icon={CalendarCheck} label="Today's Shoots" value={String(todaysBookings.length)} color="amber" />
        <SummaryCard icon={CalendarClock} label="Upcoming" value={String(upcomingBookings.length)} color="sky" />
        <SummaryCard icon={Clapperboard} label="Active Lab Orders" value={String(activeLabOrders.length)} color="violet" />
        <SummaryCard icon={TrendingDown} label="Total Due" value={formatINR(totalDue)} color="rose" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Today's bookings */}
        <Card title="Today's Shoots" onMore={() => onNavigate('bookings')}>
          {todaysBookings.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No shoots today</p>
          ) : (
            <div className="space-y-2">
              {todaysBookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/5 dark:bg-white/5">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{b.client_name ?? ''}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{b.event_function ?? ''} · {b.venue || 'No venue'}</p>
                  </div>
                  <Badge color="amber">{b.booking_status ?? ''}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Upcoming bookings */}
        <Card title="Upcoming Shoots" onMore={() => onNavigate('bookings')}>
          {upcomingBookings.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No upcoming shoots</p>
          ) : (
            <div className="space-y-2">
              {upcomingBookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/5 dark:bg-white/5">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{b.client_name ?? ''}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(b.shoot_date)} · {b.event_function ?? ''}</p>
                  </div>
                  <Badge color="sky">{formatINR(Number(b.net_due ?? 0))}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Active lab orders */}
        <Card title="Active Lab Orders" onMore={() => onNavigate('lab')}>
          {activeLabOrders.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No active lab orders</p>
          ) : (
            <div className="space-y-2">
              {activeLabOrders.slice(0, 5).map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/5 dark:bg-white/5">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{o.project_name ?? ''}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{o.studio_name ?? ''} · {o.work_type ?? ''}</p>
                  </div>
                  <Badge color="violet">{o.order_status ?? ''}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Total due summary */}
        <Card title="Outstanding Dues" onMore={() => onNavigate('bookings')}>
          <div className="space-y-2">
            {todaysBookings.length === 0 && upcomingBookings.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No bookings</p>
            ) : (
              [...todaysBookings, ...upcomingBookings].slice(0, 5).map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/5 dark:bg-white/5">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{b.client_name ?? ''}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{b.booking_no ?? ''} · {formatDate(b.shoot_date)}</p>
                  </div>
                  <span className={`text-sm font-bold ${Number(b.net_due ?? 0) > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                    {formatINR(Number(b.net_due ?? 0))}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Home;
  label: string;
  value: string;
  color: 'amber' | 'sky' | 'violet' | 'rose';
}) {
  const colors = {
    amber: 'from-amber-500/10 to-amber-500/5 text-amber-600 border-amber-500/10 dark:text-amber-400',
    sky: 'from-sky-500/10 to-sky-500/5 text-sky-600 border-sky-500/10 dark:text-sky-400',
    violet: 'from-violet-500/10 to-violet-500/5 text-violet-600 border-violet-500/10 dark:text-violet-400',
    rose: 'from-rose-500/10 to-rose-500/5 text-rose-600 border-rose-500/10 dark:text-rose-400',
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-3.5 ${colors[color]}`}>
      <Icon className="mb-2 h-5 w-5" />
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function Card({ title, children, onMore }: { title: string; children: React.ReactNode; onMore: () => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/50">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
        <button onClick={onMore} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300">
          View all <ArrowRight className="h-3 w-3" />
        </button>
      </div>
      {children}
    </div>
  );
}
