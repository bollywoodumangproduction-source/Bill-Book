import { useCallback, useEffect, useState } from 'react';
import {
  LogIn,
  Sparkles,
  Lock,
  Search,
  ShieldCheck,
  Eye,
  EyeOff,
  KeyRound,
  Calendar,
  MapPin,
  Phone,
  MessageCircle,
  Instagram,
  Clock,
  Package,
  CheckCircle2,
  ExternalLink,
  Camera,
  Clapperboard,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import type { Booking, Partner, PromoAd, PromoAdAudience, ClientSelectionSession } from '@/lib/types';
import { withPhotoSessionCounts } from '@/lib/types';
import { formatINR, formatDate, formatPhone } from '@/lib/format';
import { inputClass } from '@/components/ui/Field';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { PinInput } from '@/components/ui/PinInput';
import { Modal } from '@/components/ui/Modal';
import { cleanPartnerPhone, PartnerDashboardContent, setPartnerSession } from '@/pages/PartnerDashboard';

type PortalType = 'client' | 'partner';

function portalInnerSheetCount(session: ClientSelectionSession): number {
  return (session.proofSheets ?? []).filter((sheet) => Number(sheet.sheetNumber) > 0).length;
}

interface PortalModalProps {
  open: boolean;
  onClose: () => void;
  portalType: PortalType;
  adminPreview?: boolean;
}

export function PortalModal({ open, onClose, portalType, adminPreview = false }: PortalModalProps) {
  const { settings } = useSettings();
  const { toast } = useToast();

  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [clientBooking, setClientBooking] = useState<Booking | null>(null);
  const [clientPhotoSession, setClientPhotoSession] = useState<ClientSelectionSession | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [ads, setAds] = useState<PromoAd[]>([]);
  const [adminSearch, setAdminSearch] = useState('');
  const [adminBookings, setAdminBookings] = useState<Booking[]>([]);
  const [adminPartners, setAdminPartners] = useState<Partner[]>([]);

  const audience: PromoAdAudience = portalType === 'client' ? 'clients' : 'partners';

  const loadAds = useCallback(async () => {
    try {
      const { data } = await supabase.from('promo_ads').select('*').eq('audience', audience).eq('is_active', true).order('sort_order');
      setAds(Array.isArray(data) ? data as PromoAd[] : []);
    } catch (err) {
      console.error('Failed to load portal ads:', err);
      setAds([]);
    }
  }, [audience]);

  useEffect(() => {
    if (open) { loadAds(); }
  }, [open, loadAds]);

  useEffect(() => {
    if (!open || !adminPreview) return;
    const loadAdminRecords = async () => {
      if (portalType === 'client') {
        const { data: bd } = await supabase.from('bookings').select('*').order('shoot_date');
        setAdminBookings((bd ?? []) as Booking[]);
      } else {
        const { data: pd } = await supabase.from('partners').select('*').order('created_at');
        setAdminPartners((pd ?? []) as Partner[]);
      }
    };
    void loadAdminRecords();
  }, [open, adminPreview, portalType]);

  const loadClientPhotoSession = useCallback(async (bookingRecord: Booking | null) => {
    if (!bookingRecord?.booking_no) {
      setClientPhotoSession(null);
      return;
    }

    const { data } = await supabase
      .from('photo_selection_sessions')
      .select('*')
      .eq('bill_id', bookingRecord.booking_no)
      .maybeSingle();
    if (data) {
      setClientPhotoSession(withPhotoSessionCounts(data as ClientSelectionSession));
      return;
    }
    const { data: phoneData } = await supabase.from('photo_selection_sessions').select('*').eq('phone', bookingRecord.client_mobile).maybeSingle();
    setClientPhotoSession(phoneData ? withPhotoSessionCounts(phoneData as ClientSelectionSession) : null);
  }, []);

  useEffect(() => {
    if (!open || !clientBooking?.booking_no || portalType !== 'client') return;
    const channel = supabase
      .channel(`portal-photo-session-${clientBooking.booking_no}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_selection_sessions', filter: `bill_id=eq.${clientBooking.booking_no}` }, (payload) => {
        if (payload.eventType === 'DELETE') setClientPhotoSession(null);
        else {
          setClientPhotoSession(withPhotoSessionCounts(payload.new as ClientSelectionSession));
          void supabase.from('bookings').select('*').eq('id', clientBooking.id).maybeSingle().then(({ data }) => {
            if (data) setClientBooking(data as Booking);
          });
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [open, clientBooking?.booking_no, portalType]);

  const resetState = () => {
    setMobile(''); setError(''); setLoading(false);
    setClientBooking(null); setClientPhotoSession(null); setPartner(null);
    setAdminSearch('');
  };

  const handleClose = () => { resetState(); onClose(); };

  const handleLogin = async () => {
    if (!mobile.trim()) { setError('Enter your mobile number or booking reference'); return; }
    setLoading(true);
    setError('');

    if (portalType === 'client') {
      const normalizedInput = mobile.trim().toLowerCase();
      const cleanMobile = formatPhone(mobile);
      const { data: bookingData } = await supabase.from('bookings').select('*');
      const bookingMatch = ((bookingData ?? []) as Booking[]).find((b) =>
        formatPhone(b.client_mobile) === cleanMobile ||
        (b.booking_no ?? '').toLowerCase() === normalizedInput ||
        (b.id ?? '').toLowerCase() === normalizedInput
      );
      if (bookingMatch) {
        if (!bookingMatch.is_login_allowed) { setError('Login access is currently disabled. Please contact studio admin.'); setLoading(false); return; }
        setClientBooking(bookingMatch);
        await loadClientPhotoSession(bookingMatch);
        setLoading(false);
        return;
      }
      setError('No account found with that mobile number or booking reference');
      setLoading(false);
      return;
    }

    const { data: partnerData } = await supabase.from('partners').select('*');
    const matchedPartner = ((partnerData ?? []) as Partner[]).find((candidate) => cleanPartnerPhone(mobile) === cleanPartnerPhone(candidate.mobile));
    if (!matchedPartner) {
      setError('No staff profile found for this mobile number');
      setLoading(false);
      return;
    }
    const p = matchedPartner;
    if (p.status && p.status !== 'Active') {
      setError('Login access is currently disabled. Please contact studio admin.');
      setLoading(false);
      return;
    }
    setPartnerSession(p);
    setPartner(p);
    setLoading(false);
  };

  const isLoggedIn = portalType === 'client' ? !!clientBooking : !!partner;

  const selectAdminBooking = async (b: Booking) => {
    setClientBooking(b);
    setAdminSearch('');
    await loadClientPhotoSession(b);
  };
  const selectAdminPartner = (p: Partner) => { setPartner(p); setAdminSearch(''); };

  const filteredAdminBookings = adminBookings.filter((b) =>
    !b.deleted_at && !b.archived_at &&
    (b.client_name?.toLowerCase().includes(adminSearch.toLowerCase()) ||
     b.client_mobile?.includes(adminSearch) ||
     b.booking_no?.toLowerCase().includes(adminSearch.toLowerCase()))
  );
  const filteredAdminPartners = adminPartners.filter((p) =>
    p.status !== 'Trash' &&
    (p.name?.toLowerCase().includes(adminSearch.toLowerCase()) ||
     p.mobile?.includes(adminSearch))
  );

  return (
    <>
      <Modal open={open} onClose={handleClose} title={portalType === 'client' ? 'Client Portal' : 'Lab / Partner Portal'} size="lg" dismissible={true}>
        {adminPreview && !isLoggedIn ? (
          <AdminPreviewPicker
            portalType={portalType}
            search={adminSearch}
            onSearchChange={setAdminSearch}
            bookings={filteredAdminBookings}
            partners={filteredAdminPartners}
            onSelectBooking={selectAdminBooking}
            onSelectPartner={selectAdminPartner}
          />
        ) : !isLoggedIn ? (
          <LoginView
            portalType={portalType}
            settings={settings}
            mobile={mobile}
            loading={loading}
            error={error}
            onMobileChange={setMobile}
            onLogin={handleLogin}
          />
        ) : portalType === 'client' && clientBooking ? (
          <ClientDetailView booking={clientBooking} settings={settings} ads={ads} photoSession={clientPhotoSession} />
        ) : partner ? (
          <div className="-m-5">
            <PartnerDashboardContent
              partner={partner}
              adminPreview={true}
              onPartnerUpdated={setPartner}
            />
          </div>
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

function AdminPreviewPicker({ portalType, search, onSearchChange, bookings, partners, onSelectBooking, onSelectPartner }: {
  portalType: PortalType;
  search: string;
  onSearchChange: (v: string) => void;
  bookings: Booking[];
  partners: Partner[];
  onSelectBooking: (b: Booking) => void;
  onSelectPartner: (p: Partner) => void;
}) {
  const isClient = portalType === 'client';
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/20 dark:bg-amber-500/10">
        <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
          {isClient
            ? 'Admin Preview Mode — select a retail client booking to view their portal'
            : 'Admin Preview Mode — select a Lab Partner to view their full B2B dashboard'}
        </span>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={isClient ? 'Search by client name, mobile, or booking no...' : 'Search by partner name or mobile...'}
          className={`${inputClass} pl-10`}
        />
      </div>
      {isClient ? (
        <>
          {bookings.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Retail Client Bookings ({bookings.length})</p>
              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {bookings.map((b) => (
                  <button key={b.id} onClick={() => onSelectBooking(b)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-amber-400 hover:bg-amber-50/50 dark:border-white/10 dark:bg-slate-900/50 dark:hover:border-amber-500/30 dark:hover:bg-slate-800">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{b.client_name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{b.booking_no} · {formatDate(b.shoot_date)}</p>
                    </div>
                    <span className={`text-xs font-medium ${Number(b.net_due) > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{formatINR(Number(b.net_due ?? 0))}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">No active client bookings found</p>
          )}
        </>
      ) : (
        <>
          {partners.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Registered Lab Partners ({partners.length})</p>
              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {partners.map((p) => (
                  <button key={p.id} onClick={() => onSelectPartner(p)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-sky-400 hover:bg-sky-50/50 dark:border-white/10 dark:bg-slate-900/50 dark:hover:border-sky-500/30 dark:hover:bg-slate-800">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{p.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{formatPhone(p.mobile)} · {p.category}</p>
                    </div>
                    <span className="text-xs text-slate-400">{p.status}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">No lab partners found</p>
          )}
        </>
      )}
    </div>
  );
}

function LoginView({ portalType, settings, mobile, loading, error, onMobileChange, onLogin }: {
  portalType: PortalType;
  settings: ReturnType<typeof useSettings>['settings'];
  mobile: string;
  loading: boolean;
  error: string;
  onMobileChange: (v: string) => void;
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
          {isClient ? 'Sign in with your mobile number or booking reference' : 'Sign in with your registered mobile number'}
        </p>
      </div>

      <form onSubmit={(event) => { event.preventDefault(); onLogin(); }} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{isClient ? 'Mobile Number / Booking ID' : 'Mobile Number'}</label>
          <PhoneInput value={mobile} onChange={onMobileChange} />
        </div>
        {error && <p className="text-xs text-rose-500">{error}</p>}
        <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-semibold text-slate-900 transition-colors hover:from-amber-400 hover:to-orange-400 disabled:opacity-50">
          {loading ? <Sparkles className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
        <Lock className="h-3 w-3" /><span>Access is available for verified records only</span>
      </div>
    </div>
  );
}

function ClientDetailView({ booking, settings, ads, photoSession }: { booking: Booking; settings: ReturnType<typeof useSettings>['settings']; ads: PromoAd[]; photoSession: ClientSelectionSession | null }) {
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

      {photoSession && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Photo Selection</p>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{photoSession.isLocked ? 'Completed' : 'Pending'} · {photoSession.selectedCount ?? 0} of {photoSession.totalPhotos ?? 0} selected</p>
            </div>
            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${photoSession.isLocked ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}>
              {photoSession.isLocked ? 'Completed' : 'Pending'}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span>Access Code: <strong className="font-mono">{photoSession.pinCode}</strong></span>
            <span>Inner Sheets: {portalInnerSheetCount(photoSession)}</span>
            {portalInnerSheetCount(photoSession) > Number(photoSession.packageSheets ?? 0) && <span className="font-medium text-amber-700 dark:text-amber-300">Extra Sheets: {portalInnerSheetCount(photoSession) - Number(photoSession.packageSheets ?? 0)} @ {formatINR(photoSession.extraSheetRate)}</span>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={`/select/${photoSession.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-900 transition-colors hover:bg-amber-400"
            >
              Open selection gallery
            </a>
          </div>
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
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (currentPwd.length !== 4) { toast('Current PIN must be 4 digits', 'error'); return; }
    if (newPwd.length !== 4) { toast('New PIN must be 4 digits', 'error'); return; }
    if (confirmPwd.length !== 4) { toast('Confirm PIN must be 4 digits', 'error'); return; }
    if (currentPwd !== (partner.portal_password ?? '')) { toast('Current PIN is incorrect', 'error'); return; }
    if (newPwd !== confirmPwd) { toast('New PIN and Confirm PIN do not match', 'error'); return; }
    setSaving(true);
    const { data, error } = await supabase.from('partners').update({ portal_password: newPwd, password_changed: true }).eq('id', partner.id).select().single();
    setSaving(false);
    if (error || !data) { toast('Failed to update PIN', 'error'); return; }
    onUpdated(data as Partner);
    toast('PIN updated successfully', 'success');
    setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Change Access PIN" size="sm" dismissible={false}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Current PIN</label>
          <PinInput value={currentPwd} onChange={setCurrentPwd} placeholder="Enter current 4-digit PIN" autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">New PIN</label>
          <PinInput value={newPwd} onChange={setNewPwd} placeholder="Enter new 4-digit PIN" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Confirm New PIN</label>
          <PinInput value={confirmPwd} onChange={setConfirmPwd} placeholder="Confirm new 4-digit PIN" onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:from-amber-400 hover:to-orange-400 disabled:opacity-50">
            {saving ? <Sparkles className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Update PIN'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
