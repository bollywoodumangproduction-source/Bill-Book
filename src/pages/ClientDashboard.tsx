import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Calendar,
  MapPin,
  Clock,
  Camera,
  Video,
  Wallet,
  LogOut,
  KeyRound,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
  Phone,
  Package,
  Truck,
  FileText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Booking, PromoAd, StudioLabOrder, LabClientRow } from '@/lib/types';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { formatINR, formatDate, formatPhone } from '@/lib/format';
import { formatDeliverablesList } from '@/components/BillInvoice';
import { getClientSession, clearClientSession, isLabSession, getLabSessionId } from '@/pages/ClientLogin';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { PinInput } from '@/components/ui/PinInput';
import { Badge } from '@/components/ui/Badge';
import { NotificationBell } from '@/components/NotificationBell';
import { ProjectTimeline } from '@/components/ProjectTimeline';
import { Megaphone, ExternalLink } from 'lucide-react';

const DEFAULT_DELIVERABLES = {
  raw_video: false,
  raw_selected_photos: false,
  raw_all_photos: false,
  raw_edited_photos: false,
};

const LAB_STATUS_COLORS: Record<string, 'amber' | 'emerald' | 'sky' | 'slate'> = {
  Pending: 'slate',
  'In Design': 'amber',
  'Printed/Ready': 'sky',
  Processing: 'amber',
  Ready: 'sky',
  Delivered: 'emerald',
};

const LAB_DELIVERY_STATUS_COLORS: Record<string, 'amber' | 'emerald' | 'sky'> = {
  'In Design': 'amber',
  Ready: 'sky',
  Delivered: 'emerald',
};

export function ClientDashboard() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [labOrder, setLabOrder] = useState<StudioLabOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPinModal, setShowPinModal] = useState(false);
  const [promoAds, setPromoAds] = useState<PromoAd[]>([]);

  const load = useCallback(async () => {
    const session = getClientSession();
    if (!session) { navigate('/client/login'); return; }

    const sessionId = typeof session.id === 'string' ? session.id : null;
    if (!sessionId) { clearClientSession(); navigate('/client/login'); return; }

    if (isLabSession(session)) {
      const labId = getLabSessionId(session);
      if (!labId) { clearClientSession(); navigate('/client/login'); return; }
      const { data } = await supabase.from('studio_lab_orders').select('*').eq('id', labId).maybeSingle();
      if (data) {
        setLabOrder(data as StudioLabOrder);
      } else {
        clearClientSession();
        navigate('/client/login');
      }
      setLoading(false);
      return;
    }

    const { data } = await supabase.from('bookings').select('*').eq('id', sessionId).maybeSingle();
    if (data) {
      setBooking(data as Booking);
      const { data: ads } = await supabase.from('promo_ads').select('*').eq('is_active', true).eq('audience', 'clients').order('sort_order');
      setPromoAds((ads ?? []) as PromoAd[]);
    } else {
      clearClientSession();
      navigate('/client/login');
    }
    setLoading(false);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const handleLogout = () => {
    clearClientSession();
    navigate('/client/login');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Sparkles className="h-6 w-6 animate-pulse text-amber-500" />
      </div>
    );
  }

  if (labOrder) {
    return <LabOrderDashboard order={labOrder} settings={settings} onLogout={handleLogout} onUpdated={setLabOrder} showPinModal={showPinModal} setShowPinModal={setShowPinModal} />;
  }

  if (!booking) return null;

  const safeEvents = booking.events ?? [];
  const safeDeliverables = booking.deliverables_data ?? DEFAULT_DELIVERABLES;
  const delivList = formatDeliverablesList(safeDeliverables);
  const netDue = Number(booking.net_due ?? 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            {settings?.films_logo_url ? (
              <img src={settings.films_logo_url} alt="logo" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
                <Sparkles className="h-4 w-4 text-slate-900" />
              </div>
            )}
            <span className="text-sm font-bold text-slate-900 dark:text-white">{settings?.films_title ?? 'Bollywood Umang Films'}</span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell bookingId={booking.id} />
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        {/* Welcome header */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Welcome back</p>
              <h1 className="mt-0.5 text-xl font-bold text-slate-900 dark:text-white">{booking.client_name}</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Booking {booking.booking_no}</p>
            </div>
            <Badge color={booking.booking_status === 'CONFIRMED' ? 'amber' : booking.booking_status === 'COMPLETED' ? 'emerald' : 'sky'}>
              {booking.booking_status}
            </Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1.5"><Phone className="h-4 w-4 text-slate-400" /> +91 {formatPhone(booking.client_mobile)}</span>
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-slate-400" /> {booking.venue || '—'}</span>
          </div>
          <button
            onClick={() => setShowPinModal(true)}
            className="mt-4 flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20"
          >
            <KeyRound className="h-3.5 w-3.5" /> Change PIN
          </button>
        </div>

        {/* Event Details & Function Schedule */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Calendar className="h-4 w-4 text-amber-500" /> Event Details &amp; Function Schedule
          </h2>
          {safeEvents.length > 0 ? (
            <div className="space-y-2">
              {safeEvents.map((e, i) => {
                const label = e.name === 'Custom' && e.customName ? e.customName : e.name;
                return (
                  <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <Camera className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
                      <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(e.date)}</span>
                        {e.time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {e.time}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-center dark:border-white/5 dark:bg-white/5">
              <p className="text-sm text-slate-600 dark:text-slate-300">{booking.event_function}</p>
              <p className="mt-1 text-xs text-slate-400">{formatDate(booking.shoot_date)} {booking.shoot_time && `· ${booking.shoot_time}`}</p>
            </div>
          )}
        </div>

        {/* Deliverables Status */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Video className="h-4 w-4 text-amber-500" /> Deliverables
          </h2>
          {delivList.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {delivList.map((d, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {d}
                </div>
              ))}
            </div>
          ) : (
            <p className="py-3 text-center text-sm text-slate-400">No deliverables listed yet.</p>
          )}
        </div>

        {/* Payment Summary */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Wallet className="h-4 w-4 text-amber-500" /> Payment Summary
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center dark:border-white/10 dark:bg-white/5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Package</p>
              <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">{formatINR(Number(booking.total_amount))}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center dark:border-emerald-500/20 dark:bg-emerald-500/5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Advance Paid</p>
              <p className="mt-0.5 text-base font-bold text-emerald-600 dark:text-emerald-400">{formatINR(Number(booking.advance_paid))}</p>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-center dark:border-sky-500/20 dark:bg-sky-500/5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Discount</p>
              <p className="mt-0.5 text-base font-bold text-sky-600 dark:text-sky-400">{formatINR(Number(booking.discount))}</p>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-center dark:border-rose-500/20 dark:bg-rose-500/5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Balance Due</p>
              <p className="mt-0.5 text-base font-bold text-rose-600 dark:text-rose-400">{formatINR(netDue)}</p>
            </div>
          </div>
        </div>

        {/* Project Status Timeline — only for confirmed/completed bookings */}
        {booking.booking_status !== 'TENTATIVE' && (
          <ProjectTimeline booking={booking} />
        )}

        {/* Promo & Marketing — strictly separated from booked client timeline */}
        {booking.booking_status === 'TENTATIVE' && promoAds.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-500/20 dark:bg-amber-500/5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Megaphone className="h-4 w-4 text-amber-500" /> Offers &amp; Add-Ons
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {promoAds.map((ad) => (
                <div key={ad.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
                  {ad.image_url && (
                    <img src={ad.image_url} alt={ad.title} className="h-32 w-full object-cover" />
                  )}
                  <div className="p-3">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{ad.title}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{ad.description}</p>
                    {ad.action_link && (
                      <a
                        href={ad.action_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-500 dark:text-amber-400"
                      >
                        Learn more <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-center gap-1.5 pt-2 text-xs text-slate-400">
          <Link to="/client-login" className="flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-300">
            <ArrowLeft className="h-3 w-3" /> Back to login
          </Link>
        </div>
      </div>

      {/* Change PIN Modal */}
      <ChangePinModal
        open={showPinModal}
        onClose={() => setShowPinModal(false)}
        booking={booking}
        onUpdated={(updated) => setBooking(updated)}
      />
    </div>
  );
}

/* ---------- Lab Order Dashboard ---------- */

function LabOrderDashboard({
  order,
  settings,
  onLogout,
  onUpdated,
  showPinModal,
  setShowPinModal,
}: {
  order: StudioLabOrder;
  settings: { films_logo_url?: string; films_title?: string; production_title?: string; production_subtitle?: string; address?: string } | null;
  onLogout: () => void;
  onUpdated: (o: StudioLabOrder) => void;
  showPinModal: boolean;
  setShowPinModal: (v: boolean) => void;
}) {
  const totalPaid = Number(order.advance_paid ?? 0);
  const masterTotal = Number(order.master_total ?? 0);
  const netDue = Number(order.net_final_due ?? 0);
  const safeClients: LabClientRow[] = order.clients ?? [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            {settings?.films_logo_url ? (
              <img src={settings.films_logo_url} alt="logo" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
                <Sparkles className="h-4 w-4 text-slate-900" />
              </div>
            )}
            <span className="text-sm font-bold text-slate-900 dark:text-white">{settings?.production_title ?? 'Bollywood Umang Production'}</span>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        {/* Welcome header */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Lab Order</p>
              <h1 className="mt-0.5 text-xl font-bold text-slate-900 dark:text-white">{order.project_name || order.studio_name}</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Order {order.order_no}</p>
            </div>
            <Badge color={LAB_STATUS_COLORS[order.order_status] ?? 'slate'}>
              {order.order_status}
            </Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1.5"><Phone className="h-4 w-4 text-slate-400" /> +91 {formatPhone(order.studio_mobile)}</span>
            {order.partner_name && <span className="flex items-center gap-1.5"><FileText className="h-4 w-4 text-slate-400" /> Partner: {order.partner_name}</span>}
            {order.studio_address && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-slate-400" /> {order.studio_address}</span>}
          </div>
          <button
            onClick={() => setShowPinModal(true)}
            className="mt-4 flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20"
          >
            <KeyRound className="h-3.5 w-3.5" /> Change PIN
          </button>
        </div>

        {/* Delivery & Tracking */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Truck className="h-4 w-4 text-amber-500" /> Delivery &amp; Tracking
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Delivery Mode</p>
              <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">{order.delivery_mode || '—'}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Promised Delivery</p>
              <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">{formatDate(order.promised_delivery_date ?? null)}</p>
            </div>
            {order.parcel_tracking_details && (
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 sm:col-span-2 dark:border-white/5 dark:bg-white/5">
                <p className="text-xs text-slate-500 dark:text-slate-400">Tracking Details</p>
                <p className="mt-0.5 break-all text-sm font-medium text-slate-900 dark:text-white">{order.parcel_tracking_details}</p>
              </div>
            )}
          </div>
        </div>

        {/* Per-client delivery status */}
        {safeClients.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Package className="h-4 w-4 text-amber-500" /> Client Delivery Status
            </h2>
            <div className="space-y-3">
              {safeClients.map((c, i) => (
                <div key={c.id || i} className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{c.client_name || `Client ${i + 1}`}</p>
                      {c.event_address && <p className="mt-0.5 text-xs text-slate-400">{c.event_address}</p>}
                    </div>
                    <Badge color={LAB_DELIVERY_STATUS_COLORS[c.delivery_status] ?? 'slate'}>
                      {c.delivery_status}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>Dispatch: {c.dispatch_mode || '—'}</span>
                    {c.delivered_at && <span>Delivered: {formatDate(c.delivered_at)}</span>}
                    {c.video_rows.length > 0 && <span>Videos: {c.video_rows.length}</span>}
                    {c.album_rows.length > 0 && <span>Albums: {c.album_rows.length}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bill Summary */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Wallet className="h-4 w-4 text-amber-500" /> Bill Summary
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center dark:border-white/10 dark:bg-white/5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Order Total</p>
              <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">{formatINR(Number(order.current_order_total))}</p>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-center dark:border-rose-500/20 dark:bg-rose-500/5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Back Due</p>
              <p className="mt-0.5 text-base font-bold text-rose-600 dark:text-rose-400">{formatINR(Number(order.previous_back_due))}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center dark:border-emerald-500/20 dark:bg-emerald-500/5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Advance Paid</p>
              <p className="mt-0.5 text-base font-bold text-emerald-600 dark:text-emerald-400">{formatINR(totalPaid)}</p>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-center dark:border-rose-500/20 dark:bg-rose-500/5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Balance Due</p>
              <p className="mt-0.5 text-base font-bold text-rose-600 dark:text-rose-400">{formatINR(netDue)}</p>
            </div>
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Master Total</span><span className="font-semibold text-slate-900 dark:text-white">{formatINR(masterTotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Total Video Bill</span><span className="text-slate-700 dark:text-slate-300">{formatINR(Number(order.total_video_bill))}</span></div>
            <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Total Album Bill</span><span className="text-slate-700 dark:text-slate-300">{formatINR(Number(order.total_album_bill))}</span></div>
          </div>
        </div>

        {/* Payment History */}
        {(order.payment_history ?? []).length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Wallet className="h-4 w-4 text-amber-500" /> Payment History
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-400 dark:border-white/10">
                    <th className="px-2 py-1">Date</th>
                    <th className="px-2 py-1">Mode</th>
                    <th className="px-2 py-1">Note</th>
                    <th className="px-2 py-1 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.payment_history ?? []).map((p, i) => (
                    <tr key={p.id || i} className="border-b border-slate-100 dark:border-white/5">
                      <td className="px-2 py-1 text-slate-600 dark:text-slate-300">{formatDate(p.payment_date)}</td>
                      <td className="px-2 py-1 text-slate-600 dark:text-slate-300">{p.payment_mode}</td>
                      <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{p.note || '—'}</td>
                      <td className="px-2 py-1 text-right font-medium text-emerald-600 dark:text-emerald-400">{formatINR(Number(p.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-center gap-1.5 pt-2 text-xs text-slate-400">
          <Link to="/client-login" className="flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-300">
            <ArrowLeft className="h-3 w-3" /> Back to login
          </Link>
        </div>
      </div>

      {/* Change PIN Modal for lab orders */}
      <ChangeLabPinModal
        open={showPinModal}
        onClose={() => setShowPinModal(false)}
        order={order}
        onUpdated={onUpdated}
      />
    </div>
  );
}

/* ---------- Change PIN Modal (Bookings) ---------- */

function ChangePinModal({ open, onClose, booking, onUpdated }: { open: boolean; onClose: () => void; booking: Booking; onUpdated: (b: Booking) => void }) {
  const { toast } = useToast();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCurrentPin(''); setNewPin(''); setConfirmPin(''); setSaving(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (currentPin.length !== 4) { toast('Current PIN must be 4 digits', 'error'); return; }
    if (newPin.length !== 4) { toast('New PIN must be 4 digits', 'error'); return; }
    if (confirmPin.length !== 4) { toast('Confirm PIN must be 4 digits', 'error'); return; }
    const storedPin = booking.access_pin ?? '';
    if (currentPin !== storedPin) { toast('Current PIN is incorrect', 'error'); return; }
    if (newPin !== confirmPin) { toast('New PIN and Confirm PIN do not match', 'error'); return; }
    setSaving(true);
    const { data, error } = await supabase.from('bookings').update({ access_pin: newPin, pin_changed: true }).eq('id', booking.id).select().single();
    setSaving(false);
    if (error || !data) {
      toast('Failed to update PIN. Please try again.', 'error');
      return;
    }
    onUpdated(data as Booking);
    toast('Access PIN updated successfully', 'success');
    reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Change Access PIN" size="sm" dismissible={false}>
      <div className="space-y-4">
        <Field label="Current PIN">
          <PinInput value={currentPin} onChange={setCurrentPin} placeholder="Enter current 4-digit PIN" autoFocus />
        </Field>
        <Field label="New PIN">
          <PinInput value={newPin} onChange={setNewPin} placeholder="Enter new 4-digit PIN" />
        </Field>
        <Field label="Confirm PIN">
          <PinInput value={confirmPin} onChange={setConfirmPin} placeholder="Confirm new 4-digit PIN" onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }} />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={handleClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:from-amber-400 hover:to-orange-400 disabled:opacity-50"
          >
            {saving ? <Sparkles className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Update PIN'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Change PIN Modal (Lab Orders) ---------- */

function ChangeLabPinModal({ open, onClose, order, onUpdated }: { open: boolean; onClose: () => void; order: StudioLabOrder; onUpdated: (o: StudioLabOrder) => void }) {
  const { toast } = useToast();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCurrentPin(''); setNewPin(''); setConfirmPin(''); setSaving(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (currentPin.length !== 4) { toast('Current PIN must be 4 digits', 'error'); return; }
    if (newPin.length !== 4) { toast('New PIN must be 4 digits', 'error'); return; }
    if (confirmPin.length !== 4) { toast('Confirm PIN must be 4 digits', 'error'); return; }
    const storedPin = (order.access_pin ?? '').replace(/\D/g, '');
    if (currentPin !== storedPin) { toast('Current PIN is incorrect', 'error'); return; }
    if (newPin !== confirmPin) { toast('New PIN and Confirm PIN do not match', 'error'); return; }
    setSaving(true);
    const { data, error } = await supabase.from('studio_lab_orders').update({ access_pin: newPin, pin_changed: true }).eq('id', order.id).select().single();
    setSaving(false);
    if (error || !data) {
      toast('Failed to update PIN. Please try again.', 'error');
      return;
    }
    onUpdated(data as StudioLabOrder);
    toast('Access PIN updated successfully', 'success');
    reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Change Access PIN" size="sm" dismissible={false}>
      <div className="space-y-4">
        <Field label="Current PIN">
          <PinInput value={currentPin} onChange={setCurrentPin} placeholder="Enter current 4-digit PIN" autoFocus />
        </Field>
        <Field label="New PIN">
          <PinInput value={newPin} onChange={setNewPin} placeholder="Enter new 4-digit PIN" />
        </Field>
        <Field label="Confirm PIN">
          <PinInput value={confirmPin} onChange={setConfirmPin} placeholder="Confirm new 4-digit PIN" onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }} />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={handleClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:from-amber-400 hover:to-orange-400 disabled:opacity-50"
          >
            {saving ? <Sparkles className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Update PIN'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
