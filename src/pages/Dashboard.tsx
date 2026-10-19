import { useEffect, useState } from 'react';
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Clapperboard,
  Wallet,
  TrendingDown,
  ArrowRight,
  Sparkles,
  Home,
  Users,
  Camera,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getWorkStatusLabel } from '@/lib/types';
import type { Booking, StudioLabOrder } from '@/lib/types';
import { formatINR, formatDate, todayISO, isToday, isUpcoming } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { useRefresh } from '@/context/RefreshContext';
import type { PageKey } from '@/lib/types';
import { PortalModal } from '@/components/PortalModal';
import { bookingBillingSnapshot, labOrderBillingSnapshot } from '@/lib/billing';

interface OutstandingDueItem {
  id: string;
  targetId: string;
  name: string;
  reference: string;
  date: string;
  type: 'Booking' | 'Lab order';
  lifecycle: 'Active' | 'Delivered' | 'Archived' | 'Recycle Bin';
  amount: number;
}

interface DashboardProps {
  onNavigate: (page: PageKey) => void;
  onOpenBooking?: (bookingId: string) => void;
  onOpenLabOrder?: (orderId: string) => void;
}

export function Dashboard({ onNavigate, onOpenBooking, onOpenLabOrder }: DashboardProps) {
  const { refreshToken } = useRefresh();
  const [loading, setLoading] = useState(true);
  const [todaysBookings, setTodaysBookings] = useState<Booking[]>([]);
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [activeWorkBookings, setActiveWorkBookings] = useState<Booking[]>([]);
  const [activeLabOrders, setActiveLabOrders] = useState<StudioLabOrder[]>([]);
  const [labOrdersError, setLabOrdersError] = useState('');
  const [bookingsError, setBookingsError] = useState('');
  const [totalDue, setTotalDue] = useState(0);
  const [outstandingDueItems, setOutstandingDueItems] = useState<OutstandingDueItem[]>([]);
  const [showAllDues, setShowAllDues] = useState(false);
  const [showClientPortal, setShowClientPortal] = useState(false);
  const [showPartnerPortal, setShowPartnerPortal] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadDashboard = async () => {
      try {
        const [{ data: bookings, error: bookingError }, { data: lab, error: labError }] = await Promise.all([
          supabase.from('bookings').select('*').order('shoot_date'),
          supabase.from('studio_lab_orders').select('*').order('created_at', { ascending: false }),
        ]);

        if (!mounted) return;
        setBookingsError(bookingError?.message ?? '');
        setLabOrdersError(labError?.message ?? '');
        const allBookings = Array.isArray(bookings) ? bookings as Booking[] : [];
        const activeBookings = allBookings.filter((b) => !b.archived_at && !b.deleted_at && (b.booking_status ?? '').toUpperCase() !== 'CANCELLED');
        setTodaysBookings(activeBookings.filter((b) => isToday(b.shoot_date)));
        setUpcomingBookings(activeBookings.filter((b) => isUpcoming(b.shoot_date)).slice(0, 5));
        setActiveWorkBookings(activeBookings.filter((b) =>
          b.work_status !== 'delivered' &&
          !b.isDemo && !b.is_demo &&
          !String(b.booking_no ?? '').startsWith('DEMO-') &&
          !String(b.id ?? '').startsWith('demo-')
        ));
        const allLabOrders = Array.isArray(lab) ? lab as StudioLabOrder[] : [];
        setActiveLabOrders(allLabOrders.filter((order) =>
          order.order_status !== 'Delivered' &&
          !order.archived_at &&
          !order.deleted_at &&
          !order.isDemo &&
          !order.is_demo &&
          !String(order.order_no ?? '').startsWith('DEMO-') &&
          !String(order.id ?? '').startsWith('demo-')
        ));

        const bookingDues: OutstandingDueItem[] = allBookings.flatMap((booking) => {
          if ((booking.booking_status ?? '').toUpperCase() === 'CANCELLED' || booking.isDemo || booking.is_demo || String(booking.booking_no ?? '').startsWith('DEMO-')) return [];
          const amount = Math.max(0, Number(booking.net_due ?? bookingBillingSnapshot(booking).balanceDue));
          return amount > 0 ? [{
            id: `booking-${booking.id}`,
            targetId: booking.id,
            name: booking.client_name || 'Booking',
            reference: booking.booking_no || '',
            date: booking.shoot_date || '',
            type: 'Booking',
            lifecycle: booking.deleted_at ? 'Recycle Bin' : booking.archived_at ? 'Archived' : booking.work_status === 'delivered' ? 'Delivered' : 'Active',
            amount,
          }] : [];
        });
        const labDues: OutstandingDueItem[] = allLabOrders.flatMap((order) => {
          const status = String(order.order_status ?? '').toLowerCase();
          if (order.isDemo || order.is_demo || status === 'cancelled' || status === 'canceled' || String(order.order_no ?? '').startsWith('DEMO-') || String(order.id ?? '').startsWith('demo-')) return [];
          const amount = labOrderBillingSnapshot(order, order.advance_paid).balanceDue;
          return amount > 0 ? [{
            id: `lab-${order.id}`,
            targetId: order.id,
            name: order.project_name || order.studio_name || 'Lab order',
            reference: order.order_no || '',
            date: order.created_at || '',
            type: 'Lab order',
            lifecycle: order.deleted_at ? 'Recycle Bin' : order.archived_at ? 'Archived' : order.order_status === 'Delivered' ? 'Delivered' : 'Active',
            amount,
          }] : [];
        });
        const dueItems = [...bookingDues, ...labDues].sort((a, b) => b.amount - a.amount);
        setOutstandingDueItems(dueItems);
        setTotalDue(dueItems.reduce((sum, item) => sum + item.amount, 0));
      } catch (error) {
        console.error('Failed to load dashboard:', error);
        if (mounted) {
          setTodaysBookings([]);
          setUpcomingBookings([]);
          setActiveWorkBookings([]);
          setActiveLabOrders([]);
          setLabOrdersError(error instanceof Error ? error.message : 'Could not load lab orders.');
          setBookingsError(error instanceof Error ? error.message : 'Could not load bookings.');
          setOutstandingDueItems([]);
          setTotalDue(0);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadDashboard();
    return () => { mounted = false; };
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

      {/* Portal Buttons */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <button
          onClick={() => setShowClientPortal(true)}
          className="flex min-w-0 items-center gap-2 rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-2 text-left transition-all hover:border-amber-400 hover:shadow-lg hover:shadow-amber-500/10 sm:gap-3 sm:rounded-xl sm:p-4 dark:border-amber-500/20 dark:from-amber-500/10 dark:to-orange-500/5 dark:hover:border-amber-500/40"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 sm:h-11 sm:w-11">
            <Camera className="h-4 w-4 text-slate-900 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold leading-tight text-slate-900 sm:text-sm dark:text-white">Client Portal</p>
            <p className="hidden text-xs text-slate-500 sm:block dark:text-slate-400">View booking details &amp; dues</p>
          </div>
        </button>
        <button
          onClick={() => setShowPartnerPortal(true)}
          className="flex min-w-0 items-center gap-2 rounded-lg border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50 p-2 text-left transition-all hover:border-sky-400 hover:shadow-lg hover:shadow-sky-500/10 sm:gap-3 sm:rounded-xl sm:p-4 dark:border-sky-500/20 dark:from-sky-500/10 dark:to-blue-500/5 dark:hover:border-sky-500/40"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 sm:h-11 sm:w-11">
            <Users className="h-4 w-4 text-white sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold leading-tight text-slate-900 sm:text-sm dark:text-white">Lab / Partner Portal</p>
            <p className="hidden text-xs text-slate-500 sm:block dark:text-slate-400">View jobs &amp; ledger balance</p>
          </div>
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryCard icon={CalendarCheck} label="Today's Shoots" value={String(todaysBookings.length)} color="amber" />
        <SummaryCard icon={CalendarClock} label="Upcoming" value={String(upcomingBookings.length)} color="sky" />
        <SummaryCard icon={CalendarDays} label="Active Bookings" value={String(activeWorkBookings.length)} color="emerald" />
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

        {/* Active bookings */}
        <Card title="Active Bookings" onMore={() => onNavigate('bookings')}>
          {bookingsError ? (
            <p className="py-8 text-center text-sm text-rose-400">Could not load bookings: {bookingsError}</p>
          ) : activeWorkBookings.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No active bookings</p>
          ) : (
            <div className="space-y-2">
              {activeWorkBookings.slice(0, 5).map((booking) => (
                <button type="button" key={booking.id} onClick={() => onOpenBooking ? onOpenBooking(booking.id) : onNavigate('bookings')} className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:border-amber-400/50 hover:bg-amber-50/50 dark:border-white/5 dark:bg-white/5 dark:hover:bg-white/[.08]">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{booking.client_name || 'Booking'}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{booking.booking_no} · {booking.event_function || 'Wedding'} · {formatDate(booking.shoot_date)}</p>
                  </div>
                  <Badge color={booking.work_status === 'pending' ? 'slate' : booking.work_status === 'ready_for_delivery' ? 'emerald' : 'amber'}>{getWorkStatusLabel(booking.work_status)}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Active lab orders */}
        <Card title="Active Lab Orders" onMore={() => onNavigate('lab')}>
          {labOrdersError ? (
            <p className="py-8 text-center text-sm text-rose-400">Could not load lab orders: {labOrdersError}</p>
          ) : activeLabOrders.length === 0 ? (
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
        <Card title="Outstanding Dues" onMore={() => setShowAllDues((current) => !current)} moreLabel={showAllDues ? 'Show less' : 'View all'}>
          <div className="space-y-2">
            {(bookingsError || labOrdersError) && <p role="status" className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2 text-xs text-rose-500 dark:text-rose-300">Some due records could not load: {[bookingsError, labOrdersError].filter(Boolean).join(' · ')}</p>}
            {outstandingDueItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No outstanding dues</p>
            ) : (
              outstandingDueItems.slice(0, showAllDues ? undefined : 5).map((item) => (
                <button type="button" key={item.id} onClick={() => item.type === 'Booking' ? (onOpenBooking ? onOpenBooking(item.targetId) : onNavigate('bookings')) : (onOpenLabOrder ? onOpenLabOrder(item.targetId) : onNavigate('lab'))} className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:border-amber-400/50 hover:bg-amber-50/50 dark:border-white/5 dark:bg-white/5 dark:hover:bg-white/[.08]">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{item.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.type} · {item.reference}{item.date ? ` · ${formatDate(item.date)}` : ''} · {item.lifecycle}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-rose-500 dark:text-rose-400">
                    {formatINR(item.amount)}
                  </span>
                </button>
              ))
            )}
          </div>
        </Card>
      </div>

      <PortalModal open={showClientPortal} onClose={() => setShowClientPortal(false)} portalType="client" adminPreview />
      <PortalModal open={showPartnerPortal} onClose={() => setShowPartnerPortal(false)} portalType="partner" adminPreview />
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
  color: 'amber' | 'sky' | 'emerald' | 'violet' | 'rose';
}) {
  const colors = {
    amber: 'from-amber-500/10 to-amber-500/5 text-amber-600 border-amber-500/10 dark:text-amber-400',
    sky: 'from-sky-500/10 to-sky-500/5 text-sky-600 border-sky-500/10 dark:text-sky-400',
    emerald: 'from-emerald-500/10 to-emerald-500/5 text-emerald-600 border-emerald-500/10 dark:text-emerald-400',
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

function Card({ title, children, onMore, moreLabel = 'View all' }: { title: string; children: React.ReactNode; onMore: () => void; moreLabel?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/50">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
        <button onClick={onMore} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300">
          {moreLabel} {moreLabel === 'View all' && <ArrowRight className="h-3 w-3" />}
        </button>
      </div>
      {children}
    </div>
  );
}
