import { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  Camera,
  Clock,
  MapPin,
  Sparkles,
  LogOut,
  KeyRound,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Images,
  Music2,
  Wallet,
  TrendingUp,
  TrendingDown,
  Package,
  CheckCircle2,
  Send,
  Zap,
  CalendarClock,
  Copy,
  ChevronDown,
  Download,
  ExternalLink,
  Search,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { EventFunction, Partner, PromoAd, StudioLabOrder, ClientSelectionSession } from '@/lib/types';
import { withPhotoSessionCounts } from '@/lib/types';
import { formatDate, formatINR, formatPhone } from '@/lib/format';
import { inputClass } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { useToast } from '@/context/ToastContext';
import { copyToClipboard } from '@/lib/clipboard';
import { getVisiblePromoAds } from '@/lib/promo';
import { useSettings } from '@/context/SettingsContext';

const PARTNER_SESSION_KEY = 'buf_partner_session';
const LEGACY_PARTNER_SESSION_KEY = 'bup_partner_session';

export function cleanPartnerPhone(num: string): string {
  return (num || '').replace(/\D/g, '').slice(-10);
}

function sessionInnerSheetCount(session: ClientSelectionSession): number {
  return (session.proofSheets ?? []).filter((sheet) => Number(sheet.sheetNumber) > 0).length;
}

export function setPartnerSession(partner: Partner) {
  localStorage.setItem(PARTNER_SESSION_KEY, JSON.stringify(partner));
}

export function getPartnerSession(): Partner | null {
  const raw = localStorage.getItem(PARTNER_SESSION_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Partner;
    } catch {
      // ignore malformed session data
    }
  }

  const legacy = sessionStorage.getItem(LEGACY_PARTNER_SESSION_KEY);
  if (legacy) {
    const migrated = { id: legacy } as Partner;
    localStorage.setItem(PARTNER_SESSION_KEY, JSON.stringify(migrated));
    sessionStorage.removeItem(LEGACY_PARTNER_SESSION_KEY);
    return migrated;
  }

  return null;
}

export function clearPartnerSession() {
  localStorage.removeItem(PARTNER_SESSION_KEY);
  sessionStorage.removeItem(LEGACY_PARTNER_SESSION_KEY);
}

interface CrewBooking {
  id: string;
  client_name: string;
  client_mobile: string;
  event_function: string;
  shoot_date: string;
  shoot_time: string;
  venue: string;
  events: EventFunction[];
  assignments: Array<{ function_name: string; role: string; reporting_time: string }>;
}

/** Loads all data for a partner: assigned shoots, lab orders, ledger balance, photo sessions. */
async function fetchPartnerData(p: Partner) {
  const [{ data: assignmentData }, { data: labOrderData }, { data: ledger }, { data: directTxns }] = await Promise.all([
    supabase.from('shoot_assignments').select('booking_id, function_name, role, reporting_time').eq('partner_id', p.id),
    supabase.from('studio_lab_orders').select('*').eq('partner_id', p.id).order('created_at'),
    supabase.from('photographer_ledger').select('*').eq('mobile', p.mobile),
    supabase.from('direct_transactions').select('*').eq('partner_id', p.id),
  ]);

  const ids = [...new Set((assignmentData ?? []).map((a: { booking_id: string }) => a.booking_id))];
  const { data: bookingData } = ids.length > 0
    ? await supabase.from('bookings').select('id, client_name, client_mobile, event_function, shoot_date, shoot_time, venue, events').in('id', ids).order('shoot_date')
    : { data: [] };
  const assignmentsByBooking = new Map<string, CrewBooking['assignments']>();
  (assignmentData ?? []).forEach((a: { booking_id: string; function_name: string; role: string; reporting_time: string }) => {
    const current = assignmentsByBooking.get(a.booking_id) ?? [];
    current.push({ function_name: a.function_name, role: a.role, reporting_time: a.reporting_time });
    assignmentsByBooking.set(a.booking_id, current);
  });
  const bookings = ((bookingData ?? []) as Omit<CrewBooking, 'assignments'>[]).map((b) => ({ ...b, assignments: assignmentsByBooking.get(b.id) ?? [] }));

  const activeLabOrders = ((labOrderData ?? []) as StudioLabOrder[]).filter((o) => !o.deleted_at && !o.archived_at);

  const ledgerEntries = (ledger ?? []) as Array<{ entry_type: string; amount: number }>;
  const directEntries = (directTxns ?? []) as Array<{ txn_type: string; amount: number }>;
  const credit = ledgerEntries.filter((e) => e.entry_type === 'SHOOT_DUTY_CREDIT').reduce((s, e) => s + Number(e.amount), 0)
    + directEntries.filter((d) => d.txn_type === 'Received').reduce((s, d) => s + Number(d.amount), 0);
  const debit = ledgerEntries.filter((e) => e.entry_type === 'LAB_WORK_DEBIT' || e.entry_type === 'PAYMENT_SETTLED').reduce((s, e) => s + Number(e.amount), 0)
    + directEntries.filter((d) => d.txn_type === 'Given').reduce((s, d) => s + Number(d.amount), 0);

  return { bookings, labOrders: activeLabOrders, balance: { credit, debit, balance: credit - debit } };
}

export function PartnerDashboard() {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState('');
  const [partner, setPartner] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFromSession = useCallback(async () => {
    const storedAuth = localStorage.getItem('partnerAuth');
    const storedPhone = localStorage.getItem('partnerPhone');
    let localPartner: Partner | null = null;

    if (storedAuth) {
      try {
        const parsed = JSON.parse(storedAuth);
        if (parsed && typeof parsed === 'object') localPartner = parsed as Partner;
      } catch {
        localStorage.removeItem('partnerAuth');
      }
    }

    const registeredPartners = (settings as any)?.partners || [];
    if (!localPartner && storedPhone) {
      const phone = cleanPartnerPhone(storedPhone);
      localPartner = (registeredPartners.find((candidate: any) =>
        cleanPartnerPhone(candidate.phone || candidate.mobile) === phone,
      ) as Partner | undefined) ?? null;
    }

    if (!localPartner) {
      localPartner = getPartnerSession();
    }

    if (localPartner) {
      setPartner(localPartner);
      localStorage.setItem('partnerAuth', JSON.stringify(localPartner));
      localStorage.setItem('partnerPhone', localPartner.mobile || '');
    }

    setLoading(false);
  }, [settings]);

  useEffect(() => { loadFromSession(); }, [loadFromSession]);

  const signIn = async () => {
    if (!mobile.trim()) { setError('Enter your registered mobile number'); return; }
    setLoading(true);
    setError('');
    const { data: partnerData } = await supabase.from('partners').select('*');
    const matchedPartner = ((partnerData ?? []) as Partner[]).find((candidate) => cleanPartnerPhone(mobile) === cleanPartnerPhone(candidate.mobile));
    if (!matchedPartner) {
      setError('No staff profile found for this mobile number.');
      setLoading(false);
      return;
    }
    const p = matchedPartner;
    setPartnerSession(p);
    setPartner(p);
    setLoading(false);
  };

  const handleLogout = () => {
    clearPartnerSession();
    setPartner(null);
    navigate('/partner/dashboard', { replace: true });
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">Loading partner portal...</div>;
  }

  if (!partner) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-center text-slate-300">
        <div>
          <p className="mb-3">No partner session found.</p>
          <Link to="/partner/login" className="text-cyan-400 hover:text-cyan-300">Return to partner login</Link>
        </div>
      </div>
    );
  }

  return (
    <PartnerDashboardContent
      partner={partner}
      onLogout={handleLogout}
      onPartnerUpdated={setPartner}
    />
  );
}

export function PartnerDashboardContent({
  partner,
  onLogout,
  onPartnerUpdated,
  adminPreview = false,
}: {
  partner: Partner;
  onLogout?: () => void;
  onPartnerUpdated?: (p: Partner) => void;
  adminPreview?: boolean;
}) {
  const { toast } = useToast();
  const { settings } = useSettings();
  const [bookings, setBookings] = useState<CrewBooking[]>([]);
  const [labOrders, setLabOrders] = useState<StudioLabOrder[]>([]);
  const [balance, setBalance] = useState({ credit: 0, debit: 0, balance: 0 });
  const [orderSessions, setOrderSessions] = useState<Record<string, ClientSelectionSession | null>>({});
  const [musicProjects, setMusicProjects] = useState<Array<{ id: string; client_name: string; mode: 'b2c' | 'b2b'; status: 'draft' | 'submitted' | 'locked'; locked_at: string | null; created_at: string; updated_at: string }>>([]);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [promoAds, setPromoAds] = useState<PromoAd[]>([]);
  const [photoSessionRevision, setPhotoSessionRevision] = useState(0);
  const [copyingSessionId, setCopyingSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'orders' | 'ledger' | 'duties' | 'offers'>('orders');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState('All');
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [revealedAlbumPins, setRevealedAlbumPins] = useState<Set<string>>(new Set());
  const [copiedAlbumId, setCopiedAlbumId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingData(true);
      const data = await fetchPartnerData(partner);
      const { data: ads } = await supabase.from('promo_ads').select('*').eq('is_active', true).eq('audience', 'partners').order('sort_order');
      if (cancelled) return;
      setBookings(data.bookings);
      setLabOrders(data.labOrders);
      setBalance(data.balance);
      setPromoAds((ads ?? []) as PromoAd[]);
      setLoadingData(false);
    };
    void load();

    const labOrdersChannel = supabase
      .channel(`partner-lab-orders-${partner.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'studio_lab_orders', filter: `partner_id=eq.${partner.id}` }, () => { void load(); })
      .subscribe();

    const assignmentsChannel = supabase
      .channel(`partner-assignments-${partner.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shoot_assignments', filter: `partner_id=eq.${partner.id}` }, () => { void load(); })
      .subscribe();

    const ledgerChannel = supabase
      .channel(`partner-ledger-${partner.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photographer_ledger' }, () => { void load(); })
      .subscribe();

    const transactionsChannel = supabase
      .channel(`partner-transactions-${partner.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_transactions', filter: `partner_id=eq.${partner.id}` }, () => { void load(); })
      .subscribe();

    const photoSessionsChannel = supabase
      .channel(`partner-photo-sessions-${partner.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_selection_sessions' }, () => { setPhotoSessionRevision((revision) => revision + 1); })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(labOrdersChannel);
      supabase.removeChannel(assignmentsChannel);
      supabase.removeChannel(ledgerChannel);
      supabase.removeChannel(transactionsChannel);
      supabase.removeChannel(photoSessionsChannel);
    };
  }, [partner]);

  useEffect(() => {
    if (labOrders.length === 0) { setOrderSessions({}); return; }
    let cancelled = false;
    const loadSessions = async () => {
      const entries = await Promise.all(
        labOrders.map(async (o) => {
          if (!o.order_no) return [o.id, null] as const;
          const { data } = await supabase.from('photo_selection_sessions').select('*').eq('bill_id', o.order_no).maybeSingle();
          return [o.id, data ? withPhotoSessionCounts(data as ClientSelectionSession) : null] as const;
        }),
      );
      if (!cancelled) {
        const map: Record<string, ClientSelectionSession | null> = {};
        for (const [id, session] of entries) { (map as any)[id] = session; }
        setOrderSessions(map);
      }
    };
    void loadSessions();
    return () => { cancelled = true; };
  }, [labOrders, photoSessionRevision]);

  useEffect(() => {
    let cancelled = false;
    const loadMusicProjects = async () => {
      const { data } = await supabase.from('music_projects').select('*').eq('mode', 'b2b').order('updated_at', { ascending: false });
      if (cancelled) return;
      const names = new Set(
        [partner.name, partner.studio_name, ...labOrders.map((o) => o.project_name), ...labOrders.map((o) => o.partner_name)]
          .filter(Boolean)
          .map((value) => value.trim().toLowerCase()),
      );
      const matches = ((data ?? []) as Array<{ id: string; client_name: string; mode: 'b2c' | 'b2b'; status: 'draft' | 'submitted' | 'locked'; locked_at: string | null; created_at: string; updated_at: string }>).filter((project) => {
        const clientName = (project.client_name || '').trim().toLowerCase();
        return clientName && [...names].some((name) => clientName.includes(name) || name.includes(clientName));
      });
      setMusicProjects(matches);
    };
    void loadMusicProjects();
    return () => { cancelled = true; };
  }, [labOrders, partner.name, partner.studio_name]);

  const copySessionLink = async (session: ClientSelectionSession) => {
    const ok = await copyToClipboard(session.shareableUrl);
    toast(ok ? 'Selection link copied' : 'Could not copy link', ok ? 'success' : 'error');
  };

  const copySessionPin = async (session: ClientSelectionSession) => {
    const ok = await copyToClipboard(session.pinCode);
    toast(ok ? `PIN copied: ${session.pinCode}` : 'Could not copy PIN', ok ? 'success' : 'error');
  };

  const copySelectedPhotos = async (session: ClientSelectionSession) => {
    const selectedPhotos = session.photos.filter((photo) => photo.selected);
    const directoryPicker = (window as Window & typeof globalThis & { showDirectoryPicker?: () => Promise<any> }).showDirectoryPicker;
    if (selectedPhotos.length === 0) { toast('No photos selected by client', 'error'); return; }
    if (!directoryPicker) { toast('File System Access API is not supported in this browser', 'error'); return; }
    try {
      setCopyingSessionId(session.id);
      const rootHandle = await directoryPicker();
      const selectedDir = await rootHandle.getDirectoryHandle('Selected_Originals', { create: true });
      for (const photo of selectedPhotos) {
        const folderHandle = await selectedDir.getDirectoryHandle(photo.folder, { create: true });
        const fileHandle = await folderHandle.getFileHandle(photo.fileName, { create: true });
        const writable = await fileHandle.createWritable();
        const response = await fetch(photo.previewUrl);
        await writable.write(await response.blob());
        await writable.close();
      }
      toast(`${selectedPhotos.length} selected photos copied successfully`, 'success');
    } catch (error: any) {
      if (error?.name !== 'AbortError') toast(`Copy failed: ${error?.message || 'Unknown error'}`, 'error');
    } finally {
      setCopyingSessionId(null);
    }
  };

  if (loadingData) {
    return (
      <div className="flex items-center justify-center py-20">
        <Sparkles className="h-6 w-6 animate-pulse text-amber-500" />
      </div>
    );
  }

  const dashboardPromos = getVisiblePromoAds(promoAds, 'b2b_dashboard', 'partners', partner.id).slice(0, 3);
  const settingsData = settings as (typeof settings & { studioLogo?: string; logo?: string; studioName?: string }) | null;
  const partnerPhone = (partner as Partner & { phone?: string }).phone || partner.mobile;
  const filteredLabOrders = [...labOrders]
    .filter((order) => {
      const query = orderSearch.trim().toLowerCase();
      const matchesSearch = !query || [order.order_no, order.project_name, order.partner_name, ...(order.clients ?? []).map((client) => client.client_name)]
        .some((value) => String(value || '').toLowerCase().includes(query));
      const status = order.order_status || 'Processing';
      const matchesFilter = orderFilter === 'All'
        || (orderFilter === 'Processing' && status !== 'Ready' && status !== 'Printed/Ready' && status !== 'Delivered')
        || (orderFilter === 'Ready' && (status === 'Ready' || status === 'Printed/Ready'))
        || status === orderFilter;
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      const aDelivered = a.order_status === 'Delivered';
      const bDelivered = b.order_status === 'Delivered';
      if (aDelivered !== bDelivered) return aDelivered ? 1 : -1;
      if (a.is_emergency !== b.is_emergency) return a.is_emergency ? -1 : 1;
      const aDeadline = a.date_pending ? null : [a.album_required_date, a.video_delivery_date].filter(Boolean).sort()[0] ?? null;
      const bDeadline = b.date_pending ? null : [b.album_required_date, b.video_delivery_date].filter(Boolean).sort()[0] ?? null;
      if (aDeadline && bDeadline) return aDeadline.localeCompare(bDeadline);
      if (aDeadline && !bDeadline) return -1;
      if (!aDeadline && bDeadline) return 1;
      return 0;
    });

  return (
    <div className="min-h-screen w-full bg-slate-950 px-4 pb-6 pt-20 text-white">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="fixed left-0 right-0 top-0 z-50 flex h-14 w-full items-center justify-between gap-4 border-b border-slate-800/80 bg-slate-950/95 px-4 backdrop-blur-md lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src={settingsData?.studioLogo || settingsData?.logo || settings?.production_logo_url || settings?.films_logo_url || '/logo.png'}
              alt="Studio logo"
              className="h-11 w-11 rounded-lg border border-slate-700/70 bg-slate-900 p-1 object-contain"
            />
            <div className="flex min-w-0 flex-col">
              <span className="mb-0.5 text-[10px] font-bold uppercase leading-none tracking-widest text-cyan-400">Partner Portal</span>
              <span className="whitespace-nowrap text-sm font-extrabold uppercase leading-tight tracking-wide text-white">Bollywood Umang</span>
              <span className="mt-0.5 text-[11px] font-medium uppercase leading-none tracking-wider text-slate-300">Production</span>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center text-center leading-none">
            <span className="block whitespace-nowrap text-sm font-extrabold uppercase tracking-wide text-amber-400 text-center md:text-base">{partner.name || 'SHARMA STUDIO'}</span>
            <span className="mt-1 block whitespace-nowrap font-mono text-[11px] font-medium tracking-wider text-emerald-400 text-center">{partnerPhone ? `+91 ${partnerPhone.replace(/\D/g, '').slice(-10)}` : ''}</span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => setShowPasswordModal(true)} className="flex items-center gap-1.5 rounded border border-slate-700/50 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white">
              <KeyRound className="h-3.5 w-3.5" /> <span className="hidden md:inline">Change Password</span>
            </button>
            {onLogout && (
              <button onClick={onLogout} className="flex items-center gap-1.5 rounded border border-red-500/20 px-2.5 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/10 hover:text-red-300">
                <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Sign Out</span>
              </button>
            )}
          </div>
        </header>

        {/* Ledger Balance */}
        <div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 text-center">
            <TrendingUp className="mx-auto mb-1 h-4 w-4 text-emerald-400" />
            <p className="text-xs text-slate-400">Credit</p>
            <p className="mt-0.5 text-sm font-bold text-emerald-400">{formatINR(balance.credit)}</p>
          </div>
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5 text-center">
            <TrendingDown className="mx-auto mb-1 h-4 w-4 text-rose-400" />
            <p className="text-xs text-slate-400">Debit</p>
            <p className="mt-0.5 text-sm font-bold text-rose-400">{formatINR(balance.debit)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 text-center">
            <Wallet className="mx-auto mb-1 h-4 w-4 text-slate-400" />
            <p className="text-xs text-slate-400">Balance</p>
            <p className={`mt-0.5 text-sm font-bold ${balance.balance > 0 ? 'text-emerald-400' : balance.balance < 0 ? 'text-rose-400' : 'text-slate-400'}`}>{formatINR(balance.balance)}</p>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-white/10 pb-1">
          {([
            ['orders', '📦 Lab Orders'],
            ['ledger', '📑 Ledger & History'],
            ['duties', '🎬 Assigned Duties'],
            ['offers', '🎉 Studio Offers'],
          ] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-xs font-semibold transition ${activeTab === tab ? 'border-b-2 border-cyan-400 bg-cyan-500/10 text-cyan-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'offers' && musicProjects.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-slate-900 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Music2 className="h-4 w-4 text-amber-400" /> Music Selection</h2>
            <div className="space-y-3">
              {musicProjects.map((project) => {
                const shareUrl = `${window.location.origin}/music-selection?party=${encodeURIComponent(project.client_name)}`;
                return (
                  <div key={project.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{project.client_name}</p>
                        <p className="text-[11px] text-slate-400">{project.status === 'locked' ? 'Finalized' : project.status === 'submitted' ? 'Submitted' : 'Open'}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${project.status === 'locked' ? 'bg-emerald-500/10 text-emerald-400' : project.status === 'submitted' ? 'bg-sky-500/10 text-sky-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        {project.status}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <a href={shareUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded bg-amber-500 px-2.5 py-1.5 text-[11px] font-semibold text-slate-900">Open Portal</a>
                      <button onClick={async () => { const ok = await copyToClipboard(shareUrl); toast(ok ? 'Music portal link copied' : 'Could not copy link', ok ? 'success' : 'error'); }} className="inline-flex items-center gap-1 rounded border border-white/10 px-2.5 py-1.5 text-[11px] text-slate-300">Copy Link</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'offers' && dashboardPromos.length > 0 && (
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Sparkles className="h-4 w-4 text-cyan-400" /> Studio Offers</h2>
            <div className="space-y-3">{dashboardPromos.map((ad) => <div key={ad.id} className="rounded-lg border border-white/10 bg-slate-950/40 p-3"><p className="text-sm font-semibold text-white">{ad.title}</p><p className="mt-1 text-xs text-slate-300">{ad.description}</p>{(ad.action_link || ad.video_url) && <a href={ad.video_url || ad.action_link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-cyan-300">{ad.cta_text || 'Learn more'} <ExternalLink className="h-3 w-3" /></a>}</div>)}</div>
          </div>
        )}

        {/* Lab Orders */}
        {activeTab === 'orders' && <>
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-900 p-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" /><input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Search project, order ID (e.g. BUP-001), client..." className="w-full rounded-md border border-white/10 bg-slate-950 px-8 py-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-cyan-500/50" /></div>
          <div className="flex gap-1 overflow-x-auto">{['All', 'Processing', 'Ready', 'Delivered'].map((filter) => <button key={filter} onClick={() => setOrderFilter(filter)} className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${orderFilter === filter ? 'bg-cyan-500 text-slate-950' : 'bg-white/5 text-slate-400 hover:text-white'}`}>{filter}</button>)}</div>
        </div>
        {filteredLabOrders.length > 0 ? (
          <div className="rounded-xl border border-white/10 bg-slate-900 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4 text-amber-400" /> Lab Orders</h2>
            <div className="space-y-3">
              {filteredLabOrders.map((order) => {
                const session = orderSessions[order.id];
                const isExpanded = expandedOrders.has(order.id);
                const hasPaymentInfo = Boolean(order.payment_mode || order.payment_date || order.payment_note || Number(order.advance_paid ?? 0) || Number(order.net_final_due ?? 0));
                const financials = [
                  { label: 'Current Bill', value: formatINR(Number(order.current_order_total ?? 0)) },
                  { label: 'Total Bill', value: formatINR(Number(order.master_total ?? 0)) },
                  { label: 'Advance Paid', value: formatINR(Number(order.advance_paid ?? 0)) },
                  { label: 'Back Due', value: formatINR(Number(order.previous_back_due ?? 0)) },
                  { label: 'Net Final Due', value: formatINR(Number(order.net_final_due ?? 0)) },
                ];
                return (
                  <div key={order.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <button onClick={() => setExpandedOrders((current) => { const next = new Set(current); if (next.has(order.id)) next.delete(order.id); else next.add(order.id); return next; })} className="flex w-full items-center justify-between gap-3 text-left">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {order.is_emergency && <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white"><Zap className="h-2.5 w-2.5" />EMERGENCY</span>}
                          <p className="truncate font-medium">{order.project_name || order.order_no}</p>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">{order.order_no} · {order.studio_name || partner.studio_name || 'Studio'} · {order.work_type}</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${order.order_status === 'Delivered' ? 'bg-emerald-500/10 text-emerald-400' : order.order_status === 'Ready' || order.order_status === 'Printed/Ready' ? 'bg-sky-500/10 text-sky-400' : 'bg-amber-500/10 text-amber-400'}`}>{order.order_status}</span><ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} /></span>
                    </button>

                    <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-[10px]">
                      {[['Total', order.master_total], ['Advance', order.advance_paid], ['Back Due', order.previous_back_due], ['Net Due', order.net_final_due]].map(([label, value]) => <div key={String(label)} className="rounded bg-slate-950/50 p-1.5"><p className="text-slate-500">{label}</p><p className="font-medium text-slate-200">{formatINR(Number(value ?? 0))}</p></div>)}
                    </div>

                    {isExpanded && <>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {order.is_emergency && <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white"><Zap className="h-2.5 w-2.5" />EMERGENCY</span>}
                      {order.date_pending ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400"><CalendarClock className="h-3 w-3" /> Date Pending</span>
                      ) : (() => {
                        const dates = [order.album_required_date, order.video_delivery_date].filter(Boolean).sort() as string[];
                        if (dates.length === 0) return null;
                        return <span className="inline-flex items-center gap-0.5 text-xs text-slate-400"><CalendarClock className="h-3 w-3 text-amber-400" /> Due: {formatDate(dates[0])}</span>;
                      })()}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                      {financials.map((item) => (
                        <div key={item.label} className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                          <p className="text-slate-500">{item.label}</p>
                          <p className="mt-1 font-medium text-slate-200">{item.value}</p>
                        </div>
                      ))}
                    </div>

                    {hasPaymentInfo && (
                      <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-slate-200">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-amber-300">Payment</span>
                          <button className="rounded bg-amber-500 px-2 py-1 text-[10px] font-bold text-slate-900">Pay Now</button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-slate-300">
                          {order.payment_mode && <span>Mode: {order.payment_mode}</span>}
                          {order.payment_date && <span>Date: {formatDate(order.payment_date)}</span>}
                          {order.payment_note && <span>Note: {order.payment_note}</span>}
                        </div>
                      </div>
                    )}

                    {order.clients && order.clients.length > 0 && (
                      <div className="mt-3 border-t border-white/10 pt-3 text-xs text-slate-300">
                        <p className="mb-2 font-medium text-slate-200">Client-wise Order Status</p>
                        <div className="space-y-2">
                          {order.clients.map((client, idx) => (
                            <div key={client.id || idx} className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-medium text-slate-200">{client.client_name || `Client ${idx + 1}`}</p>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${client.delivery_status === 'Delivered' ? 'bg-emerald-500/10 text-emerald-400' : client.delivery_status === 'Ready' ? 'bg-sky-500/10 text-sky-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                  {client.delivery_status || 'In Design'}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-400">
                                {client.dispatch_mode && <span>Dispatch: {client.dispatch_mode}</span>}
                                {client.video_rows?.length > 0 && <span>Videos: {client.video_rows.length}</span>}
                                {client.album_rows?.length > 0 && <span>Albums: {client.album_rows.length}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(order.promised_delivery_date || order.storage_locations?.length || order.album_required_date || order.video_delivery_date) && (
                      <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-xs text-slate-300">
                        {order.promised_delivery_date && <div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-amber-400" /> Promised Delivery: {formatDate(order.promised_delivery_date)}</div>}
                        {order.album_required_date && <div className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-amber-400" /> Album Due: {formatDate(order.album_required_date)}</div>}
                        {order.video_delivery_date && <div className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-amber-400" /> Video Due: {formatDate(order.video_delivery_date)}</div>}
                        {order.storage_locations && order.storage_locations.length > 0 && (
                          <div className="space-y-1">
                            <p className="font-medium text-slate-200">Storage Location</p>
                            {order.storage_locations.map((loc, idx) => (
                              <p key={`${loc.id || idx}`} className="text-slate-400">{loc.device || 'Storage'} / {loc.drive || 'Drive'} / {loc.work || 'Work'} / {loc.client_name || order.project_name || order.order_no}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {(order.order_status === 'Delivered') && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Delivered</div>
                    )}
                    {session ? (
                      <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-amber-400">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${session.isLocked ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{session.isLocked ? 'Completed' : 'Pending'} · {session.selectedCount ?? 0} Selected</span>
                          <span className="flex items-center gap-1"><Images className="h-3.5 w-3.5" /> Photo Selection: {session.selectedCount ?? 0}/{session.totalPhotos ?? 0}</span>
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">Inner Sheets: {sessionInnerSheetCount(session)}</span>
                          {sessionInnerSheetCount(session) > Number(session.packageSheets ?? 0) && <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-300">Lab Extra: {formatINR(Math.max(0, sessionInnerSheetCount(session) - Number(session.packageSheets ?? 0)) * Number(session.extraSheetRate ?? 0))}</span>}
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">Sheets: {session.packageSheets || 0}</span>
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">Preview: {(session.proofSheets ?? []).length}</span>
                          {session.isLocked && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">Locked</span>}
                        </div>
                        {!adminPreview && (
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                            <span>Passcode: {session.pinCode}</span>
                            <span>Type: {session.clientType}</span>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={`/select/${session.id}`} className="text-xs font-medium text-amber-400 hover:text-amber-300">Open Gallery</Link>
                          <button onClick={() => void copySelectedPhotos(session)} disabled={copyingSessionId === session.id} className="flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 disabled:opacity-50"><Copy className="h-3 w-3" /> {copyingSessionId === session.id ? 'Copying...' : 'Get Selected Photos'}</button>
                          <button onClick={() => copySessionLink(session)} className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-200"><Send className="h-3 w-3" /> Copy Link</button>
                          {!adminPreview && <button onClick={() => copySessionPin(session)} className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-200"><KeyRound className="h-3 w-3" /> Copy PIN</button>}
                        </div>
                        <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200"><span>📖 Digital Album Suite</span><span className={`rounded-full px-2 py-0.5 text-[10px] ${session.isLocked ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{session.isLocked ? 'Ready' : 'In Design'}</span></div>
                            {session.shareableUrl && <a href={session.shareableUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded bg-cyan-500 px-2 py-1 text-[10px] font-semibold text-slate-950"><ExternalLink className="h-3 w-3" /> View Album</a>}
                          </div>
                          {session.shareableUrl ? <>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-slate-950/60 px-2 py-1 font-mono text-[10px] text-cyan-300">PIN: {revealedAlbumPins.has(session.id) ? session.pinCode : '****'}</span>
                              <button onClick={() => setRevealedAlbumPins((current) => { const next = new Set(current); if (next.has(session.id)) next.delete(session.id); else next.add(session.id); return next; })} className="text-[10px] text-slate-400 hover:text-white">{revealedAlbumPins.has(session.id) ? 'Hide PIN' : 'Show PIN'}</button>
                              <button onClick={async () => { const ok = await copyToClipboard(`Link: ${session.shareableUrl} | PIN: ${session.pinCode}`); setCopiedAlbumId(session.id); window.setTimeout(() => setCopiedAlbumId(null), 1600); toast(ok ? 'Copied!' : 'Could not copy link', ok ? 'success' : 'error'); }} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300">{copiedAlbumId === session.id ? 'Copied!' : 'Copy Link + PIN'}</button>
                              {session.pdfDownloadAllowed && <a href={(session as ClientSelectionSession & { albumPdfUrl?: string }).albumPdfUrl || session.shareableUrl} download className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300"><Download className="h-3 w-3" /> Download PDF</a>}
                            </div>
                          </> : <p className="mt-2 text-[11px] text-slate-400">Album design/selection in progress</p>}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 border-t border-white/10 pt-3 text-xs text-slate-400">Photo selection is waiting for the studio to share a gallery.</div>
                    )}
                        </>}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-slate-900 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4 text-amber-400" /> Lab Orders</h2>
            <p className="py-4 text-center text-sm text-slate-400">No lab orders available yet. Waiting for Studio.</p>
          </div>
        )}
        </>}

        {/* Assigned Duties */}
        {activeTab === 'duties' && <div className="rounded-xl border border-white/10 bg-slate-900 p-5">
          <h2 className="mb-3 text-sm font-semibold">Assigned Duties</h2>
          {bookings.length === 0 ? <p className="text-sm text-slate-400">No assigned duties yet.</p> : <div className="space-y-3">{bookings.map((booking) => { const events = booking.events ?? []; return <div key={booking.id} className="rounded-lg border border-white/10 bg-white/5 p-4"><p className="font-medium">{booking.client_name}</p><div className="mt-2 space-y-1 text-xs text-slate-300"><p className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-amber-400" /> {formatDate(booking.shoot_date)} · {booking.event_function}</p><p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-amber-400" /> {booking.venue || 'Venue to be confirmed'}</p></div><div className="mt-3 border-t border-white/10 pt-3 text-xs text-slate-400">{booking.assignments.map((assignment, index) => <p key={index} className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-amber-400" /> {assignment.function_name} · {assignment.role} · Report {assignment.reporting_time || 'time pending'}</p>)}{events.length > 0 && events.map((event, index) => <p key={`event-${index}`}>{event.name} · {event.date ? formatDate(event.date) : 'Date pending'} · {event.start_time ?? event.time ?? 'Time pending'}</p>)}</div></div>; })}</div>}
        </div>}
        {activeTab === 'ledger' && <div className="rounded-xl border border-white/10 bg-slate-900 p-5">
          <h2 className="mb-3 text-sm font-semibold">Ledger &amp; History</h2>
          <div className="space-y-2">{[
            ['Shoot duty credits', balance.credit, 'text-emerald-400'],
            ['Lab work and settlements', balance.debit, 'text-rose-400'],
            ['Current balance', balance.balance, balance.balance >= 0 ? 'text-emerald-400' : 'text-rose-400'],
          ].map(([label, amount, color]) => <div key={String(label)} className="flex items-center justify-between border-b border-white/10 py-2 text-xs"><span className="text-slate-400">{label}</span><span className={`font-semibold ${color}`}>{formatINR(Number(amount))}</span></div>)}</div>
        </div>}
        <p className="flex items-center gap-1.5 text-xs text-slate-500"><Camera className="h-3.5 w-3.5" /> Operational schedule only. Client package amounts are private.</p>
      </div>

      {!adminPreview && onPartnerUpdated && (
        <PartnerChangePasswordModal
          open={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
          partner={partner}
          onUpdated={onPartnerUpdated}
        />
      )}
    </div>
  );
}

function PartnerChangePasswordModal({ open, onClose, partner, onUpdated }: { open: boolean; onClose: () => void; partner: Partner; onUpdated: (p: Partner) => void }) {
  const { toast } = useToast();
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!currentPwd || !newPwd || !confirmPwd) { toast('Please fill all fields', 'error'); return; }
    const storedPwd = partner.portal_password ?? '';
    if (currentPwd !== storedPwd) { toast('Current password is incorrect', 'error'); return; }
    if (newPwd.length < 6) { toast('New password must be at least 6 characters', 'error'); return; }
    if (newPwd !== confirmPwd) { toast('New passwords do not match', 'error'); return; }
    setSaving(true);
    const { data, error } = await supabase.from('partners').update({ portal_password: newPwd, password_changed: true }).eq('id', partner.id).select().single();
    setSaving(false);
    if (error || !data) {
      toast('Failed to change password. Please try again.', 'error');
      return;
    }
    onUpdated(data as Partner);
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
              placeholder="Enter new password (min 6 characters)"
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
