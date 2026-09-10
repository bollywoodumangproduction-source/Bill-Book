import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Calendar,
  MapPin,
  Clock,
  Camera,
  Video,
  Album,
  Wallet,
  LogOut,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
  Phone,
  User,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Booking, PromoAd } from '@/lib/types';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { formatINR, formatDate } from '@/lib/format';
import { formatDeliverablesList } from '@/components/BillInvoice';
import { getClientSession, clearClientSession } from '@/pages/ClientLogin';
import { Modal } from '@/components/ui/Modal';
import { Field, inputClass } from '@/components/ui/Field';
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

export function ClientDashboard() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [promoAds, setPromoAds] = useState<PromoAd[]>([]);

  const load = useCallback(async () => {
    const session = getClientSession();
    if (!session) { navigate('/client-login'); return; }
    const { data } = await supabase.from('bookings').select('*').eq('id', session).maybeSingle();
    if (data) {
      setBooking(data as Booking);
      const { data: ads } = await supabase.from('promo_ads').select('*').eq('is_active', true).eq('audience', 'clients').order('sort_order');
      setPromoAds((ads ?? []) as PromoAd[]);
    } else {
      clearClientSession();
      navigate('/client-login');
    }
    setLoading(false);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const handleLogout = () => {
    clearClientSession();
    navigate('/client-login');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Sparkles className="h-6 w-6 animate-pulse text-amber-500" />
      </div>
    );
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
            <span className="flex items-center gap-1.5"><Phone className="h-4 w-4 text-slate-400" /> {booking.client_mobile}</span>
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-slate-400" /> {booking.venue || '—'}</span>
          </div>
          <button
            onClick={() => setShowPasswordModal(true)}
            className="mt-4 flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20"
          >
            <KeyRound className="h-3.5 w-3.5" /> Change Password
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

      {/* Change Password Modal */}
      <ChangePasswordModal
        open={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        booking={booking}
        onUpdated={(updated) => setBooking(updated)}
      />
    </div>
  );
}

function ChangePasswordModal({ open, onClose, booking, onUpdated }: { open: boolean; onClose: () => void; booking: Booking; onUpdated: (b: Booking) => void }) {
  const { toast } = useToast();
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!currentPwd || !newPwd || !confirmPwd) { toast('Please fill all fields', 'error'); return; }
    const storedPwd = booking.client_password ?? '';
    if (currentPwd !== storedPwd) { toast('Current password is incorrect', 'error'); return; }
    if (newPwd.length < 6) { toast('New password must be at least 6 characters', 'error'); return; }
    if (newPwd !== confirmPwd) { toast('New passwords do not match', 'error'); return; }
    setSaving(true);
    const { data, error } = await supabase.from('bookings').update({ client_password: newPwd, password_changed: true }).eq('id', booking.id).select().single();
    setSaving(false);
    if (error || !data) {
      toast('Failed to change password. Please try again.', 'error');
      return;
    }
    onUpdated(data as Booking);
    toast('Password updated successfully!', 'success');
    setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Change Password" size="sm" dismissible={false}>
      <div className="space-y-4">
        <Field label="Current Password">
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              className={inputClass}
              placeholder="Enter current password"
            />
            <button onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-500">
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Field label="New Password">
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              className={inputClass}
              placeholder="Enter new password"
            />
            <button onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-500">
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Field label="Confirm New Password">
          <input
            type={showNew ? 'text' : 'password'}
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            className={inputClass}
            placeholder="Re-enter new password"
          />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:from-amber-400 hover:to-orange-400 disabled:opacity-50"
          >
            {saving ? <Sparkles className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Update Password'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
