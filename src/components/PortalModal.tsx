import { useCallback, useEffect, useState } from 'react';
import {
  X,
  LogIn,
  Sparkles,
  Lock,
  ArrowLeft,
  KeyRound,
  Eye,
  EyeOff,
  Calendar,
  MapPin,
  Phone,
  MessageCircle,
  Instagram,
  Wallet,
  Clock,
  TrendingUp,
  TrendingDown,
  Package,
  CheckCircle2,
  ExternalLink,
  Camera,
  Clapperboard,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import type { Booking, StudioLabOrder, Partner, PromoAd, PromoAdAudience } from '@/lib/types';
import { formatINR, formatDate } from '@/lib/format';
import { inputClass } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';

type PortalType = 'client' | 'partner';

interface PortalModalProps {
  open: boolean;
  onClose: () => void;
  portalType: PortalType;
}

export function PortalModal({ open, onClose, portalType }: PortalModalProps) {
  const { settings } = useSettings();
  const { toast } = useToast();

  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [clientBooking, setClientBooking] = useState<Booking | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [partnerBookings, setPartnerBookings] = useState<Array<{ booking: Booking; role: string; functionName: string; reportingTime: string }>>([]);
  const [partnerLabOrders, setPartnerLabOrders] = useState<StudioLabOrder[]>([]);
  const [partnerBalance, setPartnerBalance] = useState<{ credit: number; debit: number; balance: number }>({ credit: 0, debit: 0, balance: 0 });
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [ads, setAds] = useState<PromoAd[]>([]);

  const audience: PromoAdAudience = portalType === 'client' ? 'clients' : 'partners';

  const loadAds = useCallback(async () => {
    try {
      const { data } = await supabase.from('promo_ads').select('*').eq('audience', audience).eq('is_active', true).order('sort_order');
      setAds(Array.isArray(data) ? data as PromoAd[] : []);
    } catch (error) {
      console.error('Failed to load portal ads:', error);
      setAds([]);
    }
  }, [audience]);

  useEffect(() => {
    if (open) { loadAds(); }
  }, [open, loadAds]);

  const resetState = () => {
    setMobile(''); setPassword(''); setError(''); setLoading(false);
    setClientBooking(null); setPartner(null); setPartnerBookings([]); setPartnerLabOrders([]); setPartnerBalance({ credit: 0, debit: 0, balance: 0 });
  };

  const handleClose = () => { resetState(); onClose(); };

  const handleLogin = async () => {
    if (!mobile || !password) { setError('Enter both mobile number and password'); return; }
    setLoading(true);
    setError('');

    if (portalType === 'client') {
      const cleanMobile = mobile.replace(/\D/g, '');
      const { data } = await supabase.from('bookings').select('*');
      const match = ((data ?? []) as Booking[]).find((b) => b.client_mobile.replace(/\D/g, '') === cleanMobile);
      if (!match) { setError('No account found with that mobile number'); setLoading(false); return; }
      if (!match.is_login_allowed) { setError('Login access is currently disabled. Please contact studio admin.'); setLoading(false); return; }
      if (!match.client_password || password !== match.client_password) { setError('Incorrect password. Please try again.'); setLoading(false); return; }
      setClientBooking(match);
    } else {
      const { data } = await supabase.from('partners').select('*').eq('mobile', mobile.trim()).maybeSingle();
      if (!data) { setError('No staff profile found for this mobile number'); setLoading(false); return; }
      const p = data as Partner;
      if (!p.is_login_allowed) { setError('Login access is currently disabled. Please contact studio admin.'); setLoading(false); return; }
      if (!p.portal_password || password !== p.portal_password) { setError('Incorrect password. Please try again.'); setLoading(false); return; }
      setPartner(p);
      await loadPartnerData(p);
    }
    setLoading(false);
  };

  const loadPartnerData = async (p: Partner) => {
    const [{ data: assignments }, { data: labOrders }, { data: ledger }, { data: directTxns }] = await Promise.all([
      supabase.from('shoot_assignments').select('booking_id, function_name, role, reporting_time').eq('partner_id', p.id),
      supabase.from('studio_lab_orders').select('*').eq('partner_id', p.id).order('created_at'),
      supabase.from('photographer_ledger').select('*').eq('mobile', p.mobile),
      supabase.from('direct_transactions').select('*').eq('partner_id', p.id),
    ]);

    const bookingIds = [...new Set((assignments ?? []).map((a: { booking_id: string }) => a.booking_id))];
    let bookingsData: Booking[] = [];
    if (bookingIds.length > 0) {
      const { data: bd } = await supabase.from('bookings').select('*').in('id', bookingIds).order('shoot_date');
      bookingsData = (bd ?? []) as Booking[];
    }
    const bookingMap = new Map(bookingsData.map((b) => [b.id, b]));
    const combined = (assignments ?? []).map((a: { booking_id: string; function_name: string; role: string; reporting_time: string }) => ({
      booking: bookingMap.get(a.booking_id),
      role: a.role,
      functionName: a.function_name,
      reportingTime: a.reporting_time,
    })).filter((c: { booking: Booking | undefined; role: string; functionName: string; reportingTime: string }) => c.booking) as Array<{ booking: Booking; role: string; functionName: string; reportingTime: string }>;
    setPartnerBookings(combined);
    setPartnerLabOrders((labOrders ?? []) as StudioLabOrder[]);

    const ledgerEntries = (ledger ?? []) as Array<{ entry_type: string; amount: number }>;
    const directEntries = (directTxns ?? []) as Array<{ txn_type: string; amount: number }>;
    const credit = ledgerEntries.filter((e) => e.entry_type === 'SHOOT_DUTY_CREDIT').reduce((s, e) => s + Number(e.amount), 0)
      + directEntries.filter((d) => d.txn_type === 'Received').reduce((s, d) => s + Number(d.amount), 0);
    const debit = ledgerEntries.filter((e) => e.entry_type === 'LAB_WORK_DEBIT' || e.entry_type === 'PAYMENT_SETTLED').reduce((s, e) => s + Number(e.amount), 0)
      + directEntries.filter((d) => d.txn_type === 'Given').reduce((s, d) => s + Number(d.amount), 0);
    setPartnerBalance({ credit, debit, balance: credit - debit });
  };

  const isLoggedIn = portalType === 'client' ? !!clientBooking : !!partner;

  return (
    <>
      <Modal open={open} onClose={handleClose} title={portalType === 'client' ? 'Client Portal' : 'Lab / Partner Portal'} size="lg" dismissible={true}>
        {!isLoggedIn ? (
          <LoginView
            portalType={portalType}
            settings={settings}
            mobile={mobile}
            password={password}
            loading={loading}
            error={error}
            onMobileChange={setMobile}
            onPasswordChange={setPassword}
            onLogin={handleLogin}
          />
        ) : portalType === 'client' && clientBooking ? (
          <ClientDetailView booking={clientBooking} settings={settings} ads={ads} />
        ) : partner ? (
          <PartnerDetailView
            partner={partner}
            bookings={partnerBookings}
            labOrders={partnerLabOrders}
            balance={partnerBalance}
            ads={ads}
            onChangePassword={() => setShowPwdModal(true)}
          />
        ) : null}
      </Modal>

      {partner && (
        <PartnerPwdModal
          open={showPwdModal}
          onClose={() => setShowPwdModal(false)}
          partner={partner}
          onUpdated={setPartner}
          toast={toast}
        />
      )}
    </>
  );
}

function LoginView({ portalType, settings, mobile, password, loading, error, onMobileChange, onPasswordChange, onLogin }: {
  portalType: PortalType;
  settings: ReturnType<typeof useSettings>['settings'];
  mobile: string;
  password: string;
  loading: boolean;
  error: string;
  onMobileChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onLogin: () => void;
}) {
  const isClient = portalType === 'client';
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center text-center">
        {isClient ? (
          settings?.films_logo_url ? (
            <img src={settings.films_logo_url} alt="logo" className="h-14 w-14 rounded-lg object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
              <Camera className="h-7 w-7 text-slate-900" />
            </div>
          )
        ) : settings?.production_logo_url ? (
          <img src={settings.production_logo_url} alt="logo" className="h-14 w-14 rounded-lg object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-600">
            <Clapperboard className="h-7 w-7 text-white" />
          </div>
        )}
        <h2 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
          {isClient ? 'Client Portal' : 'Lab / Partner Portal'}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {isClient ? 'Sign in to view your booking details' : 'Sign in to view your assigned jobs & ledger'}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Mobile Number</label>
          <input value={mobile} onChange={(e) => onMobileChange(e.target.value)} className={inputClass} placeholder="+91 ..." />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
          <input type="password" value={password} onChange={(e) => onPasswordChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onLogin(); }} className={inputClass} placeholder="Default: your mobile number" />
          <p className="mt-1 text-xs text-slate-400">First time? Your password is your registered mobile number.</p>
        </div>
        {error && <p className="text-xs text-rose-500">{error}</p>}
        <button onClick={onLogin} disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-semibold text-slate-900 transition-colors hover:from-amber-400 hover:to-orange-400 disabled:opacity-50">
          {loading ? <Sparkles className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </div>

      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
        <Lock className="h-3 w-3" /><span>Access is controlled by the studio admin</span>
      </div>
    </div>
  );
}

function ClientDetailView({ booking, settings, ads }: { booking: Booking; settings: ReturnType<typeof useSettings>['settings']; ads: PromoAd[] }) {
  const whatsappNumber = (settings?.studio_whatsapp || settings?.whatsapp_number || '').replace(/\D/g, '');
  const callNumber = (settings?.studio_call_number || settings?.phone || '').replace(/\D/g, '');
  const instaUrl = settings?.studio_instagram_url || (settings?.films_insta ? `https://instagram.com/${settings.films_insta.replace('@', '')}` : '');

  return (
    <div className="space-y-5">
      {/* Contact Hub */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
        <p className="mb-3 text-xs font-semibold text-amber-700 dark:text-amber-400">Connect with Studio</p>
        <div className="grid grid-cols-3 gap-2">
          {whatsappNumber && (
            <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 p-3 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20">
              <MessageCircle className="h-5 w-5" />
              WhatsApp
            </a>
          )}
          {callNumber && (
            <a href={`tel:${callNumber}`} className="flex flex-col items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-100 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400 dark:hover:bg-sky-500/20">
              <Phone className="h-5 w-5" />
              Call
            </a>
          )}
          {instaUrl && (
            <a href={instaUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1.5 rounded-lg border border-pink-200 bg-pink-50 p-3 text-xs font-medium text-pink-700 transition-colors hover:bg-pink-100 dark:border-pink-500/20 dark:bg-pink-500/10 dark:text-pink-400 dark:hover:bg-pink-500/20">
              <Instagram className="h-5 w-5" />
              Instagram
            </a>
          )}
        </div>
      </div>

      {/* Active Promo Ads */}
      {ads.length > 0 && (
        <div className="space-y-2">
          {ads.map((ad) => <PromoAdCard key={ad.id} ad={ad} />)}
        </div>
      )}

      {/* Booking Details */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900/50">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{booking.client_name}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{booking.booking_no} · {booking.event_function}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${booking.net_due > 0 ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'}`}>
            {booking.net_due > 0 ? 'Balance Due' : 'Fully Paid'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoRow icon={Calendar} label="Shoot Date" value={formatDate(booking.shoot_date)} />
          <InfoRow icon={Clock} label="Shoot Time" value={booking.shoot_time || 'TBD'} />
          <InfoRow icon={MapPin} label="Venue" value={booking.venue || 'TBD'} />
          <InfoRow icon={Package} label="Package" value={formatINR(Number(booking.total_amount))} />
        </div>

        {/* Events */}
        {booking.events && booking.events.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/5">
            <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Function Schedule</h4>
            <div className="space-y-2">
              {booking.events.map((event, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-white/5">
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-200">{event.name}</p>
                    {event.venue && <p className="text-slate-500 dark:text-slate-400">{event.venue}</p>}
                  </div>
                  <div className="text-right text-slate-600 dark:text-slate-400">
                    <p>{formatDate(event.date)}</p>
                    <p>{event.start_time || event.time || 'Time TBD'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment Summary */}
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3 dark:border-white/5">
          <div className="rounded-lg bg-emerald-50 p-3 text-center dark:bg-emerald-500/10">
            <p className="text-xs text-slate-500 dark:text-slate-400">Advance Paid</p>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatINR(Number(booking.advance_paid))}</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-3 text-center dark:bg-amber-500/10">
            <p className="text-xs text-slate-500 dark:text-slate-400">Total</p>
            <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{formatINR(Number(booking.total_amount))}</p>
          </div>
          <div className="rounded-lg bg-rose-50 p-3 text-center dark:bg-rose-500/10">
            <p className="text-xs text-slate-500 dark:text-slate-400">Remaining</p>
            <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{formatINR(Number(booking.net_due))}</p>
          </div>
        </div>

        {/* Delivery Status */}
        <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
          <CheckCircle2 className={`h-4 w-4 ${booking.net_due <= 0 ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`} />
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
            {booking.booking_status || 'Processing'}
          </span>
        </div>
      </div>
    </div>
  );
}

function PartnerDetailView({ partner, bookings, labOrders, balance, ads, onChangePassword }: {
  partner: Partner;
  bookings: Array<{ booking: Booking; role: string; functionName: string; reportingTime: string }>;
  labOrders: StudioLabOrder[];
  balance: { credit: number; debit: number; balance: number };
  ads: PromoAd[];
  onChangePassword: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{partner.name}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{partner.mobile} · {partner.category}</p>
        </div>
        <button onClick={onChangePassword} className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20">
          <KeyRound className="h-3.5 w-3.5" /> Change Password
        </button>
      </div>

      {/* Active Promo Ads */}
      {ads.length > 0 && (
        <div className="space-y-2">
          {ads.map((ad) => <PromoAdCard key={ad.id} ad={ad} />)}
        </div>
      )}

      {/* Balance Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center dark:border-emerald-500/20 dark:bg-emerald-500/10">
          <TrendingUp className="mx-auto mb-1 h-4 w-4 text-emerald-500" />
          <p className="text-xs text-slate-500 dark:text-slate-400">Credit</p>
          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatINR(balance.credit)}</p>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-center dark:border-rose-500/20 dark:bg-rose-500/10">
          <TrendingDown className="mx-auto mb-1 h-4 w-4 text-rose-500" />
          <p className="text-xs text-slate-500 dark:text-slate-400">Debit</p>
          <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{formatINR(balance.debit)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center dark:border-white/10 dark:bg-white/5">
          <Wallet className="mx-auto mb-1 h-4 w-4 text-slate-500" />
          <p className="text-xs text-slate-500 dark:text-slate-400">Balance</p>
          <p className={`text-sm font-bold ${balance.balance > 0 ? 'text-emerald-600 dark:text-emerald-400' : balance.balance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>{formatINR(balance.balance)}</p>
        </div>
      </div>

      {/* Assigned Jobs */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/50">
        <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Assigned Shoots</h4>
        {bookings.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No assigned shoots</p>
        ) : (
          <div className="space-y-2">
            {bookings.map((item, i) => (
              <div key={i} className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.booking.client_name}</p>
                  <span className="text-xs text-amber-600 dark:text-amber-400">{item.role}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(item.booking.shoot_date)}</span>
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {item.booking.venue || 'TBD'}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Report {item.reportingTime || 'TBD'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lab Orders */}
      {labOrders.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/50">
          <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Lab Orders</h4>
          <div className="space-y-2">
            {labOrders.map((order) => (
              <div key={order.id} className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{order.project_name || order.order_no}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${order.order_status === 'Delivered' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'}`}>{order.order_status}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>{order.work_type}</span>
                  <span>Due: {formatINR(Number(order.net_final_due))}</span>
                  {order.promised_delivery_date && <span>Delivery: {formatDate(order.promised_delivery_date)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PromoAdCard({ ad }: { ad: PromoAd }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/50">
      {ad.image_url && (
        <img src={ad.image_url} alt={ad.title} className="h-32 w-full object-cover" />
      )}
      <div className="p-4">
        <h4 className="text-sm font-bold text-slate-900 dark:text-white">{ad.title}</h4>
        {ad.description && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{ad.description}</p>}
        {ad.action_link && (
          <a href={ad.action_link} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-500 dark:text-amber-400">
            Learn More <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/5">
      <Icon className="h-4 w-4 text-amber-500" />
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{value}</p>
      </div>
    </div>
  );
}

function PartnerPwdModal({ open, onClose, partner, onUpdated, toast }: {
  open: boolean;
  onClose: () => void;
  partner: Partner;
  onUpdated: (p: Partner) => void;
  toast: (msg: string, type: 'success' | 'error' | 'info') => void;
}) {
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!currentPwd || !newPwd || !confirmPwd) { toast('Please fill all fields', 'error'); return; }
    if (currentPwd !== (partner.portal_password ?? '')) { toast('Current password is incorrect', 'error'); return; }
    if (newPwd.length < 6) { toast('New password must be at least 6 characters', 'error'); return; }
    if (newPwd !== confirmPwd) { toast('New passwords do not match', 'error'); return; }
    setSaving(true);
    const { data, error } = await supabase.from('partners').update({ portal_password: newPwd, password_changed: true }).eq('id', partner.id).select().single();
    setSaving(false);
    if (error || !data) { toast('Failed to change password', 'error'); return; }
    onUpdated(data as Partner);
    toast('Password updated successfully!', 'success');
    setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Change Password" size="sm" dismissible={false}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Current Password</label>
          <div className="relative">
            <input type={showCurrent ? 'text' : 'password'} value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} className={inputClass} placeholder="Enter current password" />
            <button onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-500">
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">New Password</label>
          <div className="relative">
            <input type={showNew ? 'text' : 'password'} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} className={inputClass} placeholder="Min 6 characters" />
            <button onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-500">
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Confirm New Password</label>
          <input type={showNew ? 'text' : 'password'} value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} className={inputClass} placeholder="Re-enter new password" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:from-amber-400 hover:to-orange-400 disabled:opacity-50">
            {saving ? <Sparkles className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Update Password'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
