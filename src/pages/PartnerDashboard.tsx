import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { EventFunction, Partner, PromoAd, StudioLabOrder, ClientSelectionSession } from '@/lib/types';
import { photoSessionFromDatabase } from '@/lib/types';
import { formatDate, formatDateTime, formatINR, formatPhone } from '@/lib/format';
import { inputClass } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { isRightEdgeBackSwipe } from '@/lib/touchNavigation';
import { useAppBackGuard } from '@/lib/useAppBackGuard';
import { useToast } from '@/context/ToastContext';
import { copyToClipboard } from '@/lib/clipboard';
import { getVisiblePromoAds } from '@/lib/promo';
import { useSettings } from '@/context/SettingsContext';
import { hasLabAlbumWork, hasLabVideoWork, labOrderOverviewStatus, visibleLabOrderDates } from '@/lib/labOrderStatus';
import { clientPaidTotal, clientWorkTotal, labOrderPayments, unallocatedPaidTotal } from '@/lib/labBilling';

const PARTNER_SESSION_KEY = 'buf_partner_session';
const LEGACY_PARTNER_SESSION_KEY = 'bup_partner_session';

export function cleanPartnerPhone(num: string): string {
  return (num || '').replace(/\D/g, '').slice(-10);
}

function sessionInnerSheetCount(session: ClientSelectionSession): number {
  return (session.proofSheets ?? []).filter((sheet) => Number(sheet.sheetNumber) > 0).length;
}

function partnerOrderTitle(order: StudioLabOrder): string {
  const title = order.project_name?.trim();
  return title || order.order_no;
}

function partnerOrderClientLabels(order: StudioLabOrder): string {
  return (order.clients ?? []).map((client, index) => `Client ${index + 1}: ${client.client_name || 'Unnamed'}`).join(' · ');
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
  localStorage.removeItem('partnerAuth');
  localStorage.removeItem('partnerPhone');
  void supabase.auth.signOut();
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
  const [{ data: bookingPayload, error: bookingError }, { data: labOrderPayload, error: labOrderError }, { data: ledger }, { data: directTxns }] = await Promise.all([
    supabase.functions.invoke('portal-auth', { body: { action: 'partner-bookings' } }),
    supabase.functions.invoke('portal-auth', { body: { action: 'partner-lab-orders' } }),
    supabase.from('photographer_ledger').select('*').eq('mobile', p.mobile),
    supabase.from('direct_transactions').select('*').eq('partner_id', p.id),
  ]);
  if (bookingError) throw new Error(bookingPayload?.error || bookingError.message || 'Could not load assigned shoots.');
  if (labOrderError) throw new Error(labOrderPayload?.error || labOrderError.message || 'Could not load lab orders.');
  const bookings = (bookingPayload?.bookings ?? []) as CrewBooking[];

  const activeLabOrders = ((labOrderPayload?.orders ?? []) as StudioLabOrder[]).filter((o) => !o.deleted_at && (!o.archived_at || o.order_status === 'Delivered'));

  const ledgerEntries = (ledger ?? []) as Array<{ entry_type: string; amount: number }>;
  const directEntries = (directTxns ?? []) as Array<{ txn_type: string; amount: number }>;
  const credit = ledgerEntries.filter((e) => e.entry_type === 'SHOOT_DUTY_CREDIT').reduce((s, e) => s + Number(e.amount), 0)
    + directEntries.filter((d) => d.txn_type === 'Received').reduce((s, d) => s + Number(d.amount), 0);
  const debit = ledgerEntries.filter((e) => e.entry_type === 'LAB_WORK_DEBIT' || e.entry_type === 'PAYMENT_SETTLED').reduce((s, e) => s + Number(e.amount), 0)
    + directEntries.filter((d) => d.txn_type === 'Given').reduce((s, d) => s + Number(d.amount), 0);

  return { bookings, labOrders: activeLabOrders, balance: { credit, debit, balance: credit - debit } };
}

export function PartnerDashboard() {
  const navigate = useNavigate();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFromSession = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const localPartner = getPartnerSession();
    const isOwnPartner = user?.app_metadata?.role === 'partner'
      && user.app_metadata?.portal_record_id === localPartner?.id;
    if (localPartner && isOwnPartner) setPartner(localPartner);
    else if (localPartner) clearPartnerSession();
    setLoading(false);
  }, []);

  useEffect(() => { loadFromSession(); }, [loadFromSession]);

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
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedOrderId = searchParams.get('order');
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
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

    // Lab orders are delivered by an allow-listed Edge Function response so
    // their client PIN columns are never sent over a Realtime row payload.
    const refreshTimer = window.setInterval(() => { void load(); }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
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
          return [o.id, data ? photoSessionFromDatabase(data as Record<string, any>) : null] as const;
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
      const selectedDir = await rootHandle.getDirectoryHandle('PhotoSelect', { create: true });
      for (const photo of selectedPhotos) {
        const folderHandle = await selectedDir.getDirectoryHandle(photo.folder, { create: true });
        const extensionIndex = photo.fileName.lastIndexOf('.');
        const baseName = extensionIndex > 0 ? photo.fileName.slice(0, extensionIndex) : photo.fileName;
        const extension = extensionIndex > 0 ? photo.fileName.slice(extensionIndex) : '';
        let copyName = photo.fileName;
        let suffix = 2;
        while (true) {
          try {
            await folderHandle.getFileHandle(copyName);
            copyName = `${baseName} (${suffix++})${extension}`;
          } catch (error) {
            if ((error as DOMException).name !== 'NotFoundError') throw error;
            break;
          }
        }
        const fileHandle = await folderHandle.getFileHandle(copyName, { create: true });
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
      const status = labOrderOverviewStatus(order);
      const matchesFilter = orderFilter === 'All'
        || (orderFilter === 'Processing' && status === 'In Progress')
        || (orderFilter === 'Ready' && status === 'Ready for Delivery')
        || status === orderFilter;
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      const aDelivered = labOrderOverviewStatus(a) === 'Delivered';
      const bDelivered = labOrderOverviewStatus(b) === 'Delivered';
      if (aDelivered !== bDelivered) return aDelivered ? 1 : -1;
      if (a.is_emergency !== b.is_emergency) return a.is_emergency ? -1 : 1;
      const aDeadline = visibleLabOrderDates(a).map(({ date }) => date).sort()[0] ?? null;
      const bDeadline = visibleLabOrderDates(b).map(({ date }) => date).sort()[0] ?? null;
      if (aDeadline && bDeadline) return aDeadline.localeCompare(bDeadline);
      if (aDeadline && !bDeadline) return -1;
      if (!aDeadline && bDeadline) return 1;
      return 0;
    });
  const selectedOrder = selectedOrderId ? labOrders.find((order) => order.id === selectedOrderId) ?? null : null;
  const visibleLabOrders = selectedOrder ? [selectedOrder] : filteredLabOrders;
  const dueLabOrders = labOrders.filter((order) => {
    const payments = labOrderPayments(order);
    const hasClientDue = (order.clients ?? []).some((client) =>
      clientWorkTotal(client, order.extra_items ?? [], order.clients ?? [])
        - clientPaidTotal(client, payments, order.clients ?? []) > 0.005,
    );
    return Math.max(0, Number(order.master_total ?? 0) - Number(order.advance_paid ?? 0)) > 0.005 || hasClientDue;
  });
  const returnToOrderList = () => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.delete('order');
    return next;
  }, { replace: true });
  const handleAppBack = () => {
    if (selectedOrderId) returnToOrderList();
    else if (activeTab !== 'orders') setActiveTab('orders');
  };
  const guardedBack = useAppBackGuard(handleAppBack, !adminPreview);

  return (
    <div
      className={`${adminPreview ? 'min-h-0 px-1 py-1 pb-2' : 'min-h-screen px-1 pb-4 pt-16 sm:px-4 sm:pt-20'} w-full bg-slate-950 text-white`}
      onTouchStart={(event) => {
        if (adminPreview) return;
        const touch = event.touches[0];
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(event) => {
        const start = touchStartRef.current;
        touchStartRef.current = null;
        if (adminPreview || !start) return;
        const touch = event.changedTouches[0];
        if (!isRightEdgeBackSwipe(start, { x: touch.clientX, y: touch.clientY }, window.innerWidth)) return;
        guardedBack();
      }}
    >
      <div className="mx-auto max-w-5xl space-y-3 sm:space-y-5">
        {!adminPreview && <header className="fixed left-0 right-0 top-0 z-50 flex h-14 w-full items-center justify-between gap-2 border-b border-slate-800/80 bg-slate-950/95 px-2 backdrop-blur-md sm:gap-4 sm:px-4 lg:px-8">
          <div className="flex min-w-0 max-w-[44%] items-center gap-1.5 sm:max-w-none sm:gap-2.5">
            <img
              src={settingsData?.studioLogo || settingsData?.logo || settings?.production_logo_url || settings?.films_logo_url || '/logo.png'}
              alt="Studio logo"
              className="h-8 w-8 shrink-0 rounded-lg border border-slate-700/70 bg-slate-900 p-1 object-contain sm:h-11 sm:w-11"
            />
            <div className="flex min-w-0 flex-col">
              <span className="mb-0.5 truncate text-[9px] font-bold uppercase leading-none tracking-widest text-cyan-400 sm:text-[10px]">Partner Portal</span>
              <span className="max-w-full truncate whitespace-nowrap text-[11px] font-extrabold uppercase leading-tight tracking-wide text-white sm:text-sm">Bollywood Umang</span>
              <span className="mt-0.5 truncate text-[9px] font-medium uppercase leading-none tracking-wider text-slate-300 sm:text-[11px]">Production</span>
            </div>
          </div>

          <div className="mx-1 flex min-w-0 flex-1 flex-col items-center justify-center text-center leading-none sm:flex-none">
            <span className="block max-w-full truncate whitespace-nowrap text-[11px] font-extrabold uppercase tracking-wide text-amber-400 sm:text-sm md:text-base">{partner.name || 'SHARMA STUDIO'}</span>
            <span className="mt-1 block max-w-full truncate whitespace-nowrap font-mono text-[9px] font-medium tracking-wider text-emerald-400 sm:text-[11px]">{partnerPhone ? `+91 ${partnerPhone.replace(/\D/g, '').slice(-10)}` : ''}</span>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <button onClick={() => setShowPasswordModal(true)} className="flex items-center gap-1.5 rounded border border-slate-700/50 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white">
              <KeyRound className="h-3.5 w-3.5" /> <span className="hidden md:inline">Change Password</span>
            </button>
            {onLogout && (
              <button onClick={onLogout} className="flex items-center gap-1.5 rounded border border-red-500/20 px-2.5 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/10 hover:text-red-300">
                <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Sign Out</span>
              </button>
            )}
          </div>
        </header>}

        <div className={`sticky ${adminPreview ? 'top-0' : 'top-14'} z-40 -mx-1 flex gap-1 overflow-x-auto border-b border-white/10 bg-slate-950/95 px-1 pb-1 pt-1 backdrop-blur-md sm:-mx-4 sm:px-4`}>
          {([
            ['orders', 'Orders', '📦 Lab Orders'],
            ['ledger', 'Ledger', '📑 Ledger'],
            ['duties', 'Duties', '🎬 Assigned Duties'],
            ['offers', 'Offers', '🎉 Studio Offers'],
          ] as const).map(([tab, mobileLabel, desktopLabel]) => (
            <button key={tab} onClick={() => { setActiveTab(tab); if (selectedOrderId) returnToOrderList(); }} className={`flex min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-t-lg px-1.5 py-2 text-[10px] font-semibold transition sm:flex-none sm:px-3 sm:text-xs ${activeTab === tab ? 'border-b-2 border-cyan-400 bg-cyan-500/10 text-cyan-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
              <span className="sm:hidden">{mobileLabel}</span>
              <span className="hidden sm:inline">{desktopLabel}</span>
            </button>
          ))}
        </div>

        {activeTab === 'offers' && musicProjects.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-slate-900 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Music2 className="h-4 w-4 text-amber-400" /> Music Selection</h2>
            <div className="space-y-3">
              {musicProjects.map((project) => {
                const shareUrl = `${window.location.origin}/music-selection?project=${encodeURIComponent(project.id)}`;
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
        {!selectedOrder && <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-900 p-2.5 sm:flex-row sm:items-center sm:p-3">
          <div className="relative min-w-0 flex-1"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" /><input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Search project, order ID (e.g. BUP-001), client..." className="w-full rounded-md border border-white/10 bg-slate-950 px-8 py-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-cyan-500/50" /></div>
          <div className="flex gap-1 overflow-x-auto">{['All', 'Processing', 'Ready', 'Delivered'].map((filter) => <button key={filter} onClick={() => setOrderFilter(filter)} className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${orderFilter === filter ? 'bg-cyan-500 text-slate-950' : 'bg-white/5 text-slate-400 hover:text-white'}`}>{filter}</button>)}</div>
        </div>}
        {visibleLabOrders.length > 0 ? (
          <div className="rounded-xl border border-white/10 bg-slate-900 p-3 sm:p-5">
            {selectedOrder && <button onClick={returnToOrderList} className="mb-3 inline-flex items-center gap-1 rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5">← Back to orders</button>}
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold sm:mb-3"><Package className="h-4 w-4 text-amber-400" /> {selectedOrder ? 'Order Details' : 'Lab Orders'}</h2>
            <div className="space-y-3">
              {visibleLabOrders.map((order) => {
                const session = orderSessions[order.id];
                const isExpanded = selectedOrder?.id === order.id;
                const overviewStatus = labOrderOverviewStatus(order);
                return (
                  <div key={order.id} className="rounded-lg border border-white/10 bg-white/5 p-3 sm:p-4">
                    <button onClick={() => { if (!isExpanded) setSearchParams((current) => { const next = new URLSearchParams(current); next.set('order', order.id); return next; }); }} className="flex w-full items-center justify-between gap-3 text-left">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {order.is_emergency && <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white"><Zap className="h-2.5 w-2.5" />EMERGENCY</span>}
                          <p className="truncate font-medium">{partnerOrderTitle(order)}</p>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">{order.order_no} · {order.studio_name || partner.studio_name || 'Studio'} · {order.work_type}</p>
                        <p className="mt-0.5 text-[11px] text-cyan-200">{partnerOrderClientLabels(order) || 'No client listed'}</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${overviewStatus === 'Delivered' ? 'bg-emerald-500/10 text-emerald-400' : overviewStatus === 'Ready for Delivery' ? 'bg-sky-500/10 text-sky-400' : overviewStatus === 'Pending' ? 'bg-amber-500/10 text-amber-400' : 'bg-cyan-500/10 text-cyan-300'}`}>{overviewStatus}</span><ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} /></span>
                    </button>

                    <div className="mt-2 text-right text-[11px] text-slate-400">Balance due <span className="font-semibold text-amber-300">{formatINR(Math.max(0, Number(order.master_total ?? 0) - Number(order.advance_paid ?? 0)))}</span></div>

                    {isExpanded && <>

                    <div className="mt-2 rounded-md border border-cyan-500/20 bg-cyan-500/5 p-2.5 text-xs sm:mt-3 sm:p-3">
                      <p className="mb-2 font-medium text-slate-200">Production Progress</p>
                      <div className="flex flex-wrap gap-2">
                        {hasLabAlbumWork(order) && <span className="rounded-full bg-white/5 px-2 py-1 text-slate-300">Album: {order.album_status || 'Pending'}</span>}
                        {hasLabVideoWork(order) && <span className="rounded-full bg-white/5 px-2 py-1 text-slate-300">Video: {order.video_status || 'Pending'}</span>}
                      </div>
                      {(order.album_started_at || order.video_started_at || order.album_completed_at || order.video_completed_at) && (
                        <div className="mt-2 space-y-1 text-[10px] text-slate-400">
                          {order.album_started_at && <p>Album work started: {formatDate(order.album_started_at)}</p>}
                          {order.album_completed_at && <p>Album work completed: {formatDate(order.album_completed_at)}</p>}
                          {order.video_started_at && <p>Video work started: {formatDate(order.video_started_at)}</p>}
                          {order.video_completed_at && <p>Video work completed: {formatDate(order.video_completed_at)}</p>}
                        </div>
                      )}
                      {order.delivered_at && <p className="mt-2 text-emerald-400">Final delivery: {formatDate(order.delivered_at)}</p>}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {order.is_emergency && <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white"><Zap className="h-2.5 w-2.5" />EMERGENCY</span>}
                      {order.date_pending ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400"><CalendarClock className="h-3 w-3" /> Date Pending</span>
                      ) : visibleLabOrderDates(order).map(({ label, date }) => <span key={label} className="inline-flex items-center gap-0.5 text-xs text-slate-400"><CalendarClock className="h-3 w-3 text-amber-400" /> {label}: {formatDate(date)}</span>)}
                    </div>

                    <div className="mt-2 rounded-md border border-white/10 bg-slate-950/40 p-2.5 text-xs sm:mt-3 sm:p-3">
                      <p className="mb-2 font-medium text-slate-200">Order bill · {order.order_no} · {partnerOrderTitle(order)}</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-400 sm:grid-cols-4">
                        <span>Order total: <b className="text-slate-200">{formatINR(Number(order.current_order_total ?? 0))}</b></span>
                        <span>Previous balance: <b className="text-slate-200">{formatINR(Number(order.previous_back_due ?? 0))}</b></span>
                        <span>Total bill: <b className="text-slate-200">{formatINR(Number(order.master_total ?? 0))}</b></span>
                        <span>Paid: <b className="text-emerald-300">{formatINR(Number(order.advance_paid ?? 0))}</b></span>
                      </div>
                      {(order.clients ?? []).map((client, ci) => <div key={client.id || ci} className="mt-2 border-t border-white/10 pt-2">
                        <p className="font-semibold text-cyan-200">Client {ci + 1}: {client.client_name || `Client ${ci + 1}`}</p>
                        <div className="mt-1 space-y-0.5 text-slate-400">
                          {(client.video_rows ?? []).map((row, ri) => <p key={`v${ri}`}>Video · {row.video_type} / {row.quality} · {row.qty} × {formatINR(Number(row.rate))} = <b className="text-slate-200">{formatINR(Number(row.total ?? Number(row.qty) * Number(row.rate)))}</b></p>)}
                          {(client.album_rows ?? []).map((row, ri) => <div key={`a${ri}`}><p>Album · {row.album_type} ({row.size})</p><p className="pl-3">{row.packaging} packaging · {formatINR(Number(row.packaging_total ?? 0))}</p>{row.mini_album && <p className="pl-3">Mini album · {row.mini_qty} × {formatINR(Number(row.mini_rate))} = {formatINR(Number(row.mini_total))}</p>}{(row.papers ?? []).filter((paper) => paper.paper_type).map((paper) => <p key={paper.id} className="pl-3">{paper.paper_type} paper · {paper.sheets} × {formatINR(Number(paper.rate))} = {formatINR(Number(paper.total))}</p>)}</div>)}
                          {(order.extra_items ?? []).filter((item) => item.client_name === client.client_name).map((item) => <p key={item.id} className="text-amber-200">Extra · {item.description} · {item.quantity} × {formatINR(item.unit_rate)} = {formatINR(item.line_amount)}</p>)}
                        </div>
                        <div className="mt-1 grid grid-cols-3 gap-2 border-t border-white/10 pt-1 text-right">
                          <span className="text-slate-400">Client {ci + 1} total <b className="block text-slate-200">{formatINR(clientWorkTotal(client, order.extra_items ?? [], order.clients))}</b></span>
                          <span className="text-slate-400">Paid <b className="block text-emerald-300">{formatINR(clientPaidTotal(client, labOrderPayments(order), order.clients))}</b></span>
                          <span className="text-slate-400">Due <b className="block text-rose-300">{formatINR(Math.max(0, clientWorkTotal(client, order.extra_items ?? [], order.clients) - clientPaidTotal(client, labOrderPayments(order), order.clients)))}</b></span>
                        </div>
                        {labOrderPayments(order).filter((payment) => payment.client_id === client.id || (!payment.client_id && payment.client_name === client.client_name)).map((payment) => <p key={payment.id} className="mt-1 text-[10px] text-slate-500">Payment · {formatDateTime(payment.created_at || payment.payment_date)} · {payment.payment_mode} · {formatINR(Number(payment.amount))}{payment.note ? ` · ${payment.note}` : ''}</p>)}
                      </div>)}
                      {(order.extra_items ?? []).filter((item) => !item.client_name || !(order.clients ?? []).some((client) => client.client_name === item.client_name)).map((item) => <p key={item.id} className="mt-1 text-amber-200">Order extra · {item.description} · {item.quantity} × {formatINR(item.unit_rate)} = {formatINR(item.line_amount)}</p>)}
                      {unallocatedPaidTotal(labOrderPayments(order)) > 0 && <div className="mt-2 overflow-x-auto border-t border-white/10 pt-2"><p className="mb-1 font-medium text-slate-200">Unassigned / legacy order payments</p><table className="w-full min-w-[500px] text-left text-[11px]"><thead className="text-slate-500"><tr><th className="py-1">Date &amp; time</th><th>Mode</th><th>Note</th><th className="text-right">Paid</th></tr></thead><tbody>{labOrderPayments(order).filter((payment) => !payment.client_id && !payment.client_name).map((payment) => <tr key={payment.id} className="border-t border-white/5 text-slate-400"><td className="py-1">{formatDateTime(payment.created_at || payment.payment_date)}</td><td>{payment.payment_mode}</td><td>{payment.note || '—'}</td><td className="text-right text-emerald-300">{formatINR(Number(payment.amount))}</td></tr>)}</tbody></table></div>}
                    </div>

                    {(visibleLabOrderDates(order).length > 0 || order.date_pending || order.storage_locations?.length) && (
                      <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-xs text-slate-300">
                        {order.date_pending ? <div className="flex items-center gap-1.5 text-amber-300"><CalendarClock className="h-3.5 w-3.5" /> Delivery date pending confirmation</div> : visibleLabOrderDates(order).map(({ label, date }) => <div key={label} className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-amber-400" /> {label}: {formatDate(date)}</div>)}
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
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Delivered{order.delivered_at ? ` · ${formatDate(order.delivered_at)}` : ''}</div>
                    )}
                    {session ? (
                      <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-amber-400">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${session.submitted_at ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{session.submitted_at ? 'Completed' : 'Pending'} · {session.selectedCount ?? 0} Selected</span>
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
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200"><span>📖 Digital Album Suite</span><span className={`rounded-full px-2 py-0.5 text-[10px] ${session.submitted_at ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{session.submitted_at ? 'Ready' : 'In Design'}</span></div>
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
          <div className="rounded-xl border border-white/10 bg-slate-900 p-3 sm:p-5">
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
        {activeTab === 'ledger' && <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-slate-900 p-4"><h2 className="mb-2 text-sm font-semibold">Partner Account Balance</h2><p className="mb-3 text-[11px] text-slate-400">This is the partner-level account ledger (shoot duties and direct settlements), separate from client/order balances below.</p><div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-slate-950/50 p-2"><p className="text-slate-500">Duty credits</p><b className="text-emerald-300">{formatINR(balance.credit)}</b></div><div className="rounded-lg bg-slate-950/50 p-2"><p className="text-slate-500">Partner debits</p><b className="text-rose-300">{formatINR(balance.debit)}</b></div><div className="rounded-lg bg-slate-950/50 p-2"><p className="text-slate-500">Account balance</p><b className={balance.balance < 0 ? 'text-rose-300' : 'text-cyan-200'}>{formatINR(balance.balance)}</b></div></div></div>
          <div className="rounded-xl border border-white/10 bg-slate-900 p-4"><h2 className="mb-1 text-sm font-semibold">Unpaid Client &amp; Lab Order Work</h2><p className="mb-3 text-[11px] text-slate-400">Only work with an outstanding balance is listed. Fully paid work disappears from this view.</p>{dueLabOrders.length === 0 ? <p className="text-xs text-slate-400">No outstanding client or lab-order balances.</p> : <div className="space-y-3">{dueLabOrders.map((order) => { const payments = labOrderPayments(order); return <div key={order.id} className="rounded-lg border border-white/10 bg-slate-950/50 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold text-white">{order.order_no} · {order.project_name || order.work_type}</p><p className="text-xs text-slate-400">Work: {order.work_type} · Studio: {order.studio_name || '—'}</p></div><span className="text-xs font-semibold text-amber-300">Combined due {formatINR(Math.max(0, Number(order.master_total ?? 0) - Number(order.advance_paid ?? 0)))}</span></div><div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4"><span className="text-slate-400">Combined work <b className="text-slate-200">{formatINR(Number(order.current_order_total ?? 0))}</b></span><span className="text-slate-400">Previous balance <b className="text-slate-200">{formatINR(Number(order.previous_back_due ?? 0))}</b></span><span className="text-slate-400">Combined bill <b className="text-slate-200">{formatINR(Number(order.master_total ?? 0))}</b></span><span className="text-slate-400">Combined paid <b className="text-emerald-300">{formatINR(Number(order.advance_paid ?? 0))}</b></span></div>{(order.clients ?? []).map((client, ci) => { const total = clientWorkTotal(client, order.extra_items ?? [], order.clients ?? []); const paid = clientPaidTotal(client, payments, order.clients ?? []); if (total - paid <= 0.005) return null; return <div key={client.id || ci} className="mt-2 border-t border-white/10 pt-2"><div className="flex flex-wrap justify-between gap-2"><p className="text-xs font-semibold text-cyan-200">Client {ci + 1}: {client.client_name || `Client ${ci + 1}`}</p><p className="text-[11px] text-slate-400">Work {formatINR(total)} · Paid {formatINR(paid)} · Due <b className="text-rose-300">{formatINR(Math.max(0, total - paid))}</b></p></div><div className="mt-1 space-y-0.5 text-[11px] text-slate-400">{(client.video_rows ?? []).map((row, ri) => <p key={`v${ri}`}>Video · {row.video_type} / {row.quality} · {row.qty} × {formatINR(Number(row.rate))} = {formatINR(Number(row.total ?? Number(row.qty) * Number(row.rate)))}</p>)}{(client.album_rows ?? []).map((row, ri) => <p key={`a${ri}`}>Album · {row.album_type} ({row.size}) · {formatINR(Number(row.total ?? 0))}</p>)}{(order.extra_items ?? []).filter((item) => item.client_id ? item.client_id === client.id : item.client_name === client.client_name).map((item) => <p key={item.id} className="text-amber-200">Extra · {item.description} · {item.quantity} × {formatINR(item.unit_rate)} = {formatINR(item.line_amount)}</p>)}</div>{payments.filter((payment) => payment.client_id === client.id || (!payment.client_id && payment.client_name === client.client_name)).map((payment) => <p key={payment.id} className="mt-1 text-[10px] text-slate-500">Payment · {formatDateTime(payment.created_at || payment.payment_date)} · {payment.payment_mode} · {formatINR(Number(payment.amount))}{payment.note ? ` · ${payment.note}` : ''}</p>)}</div>; })}{unallocatedPaidTotal(payments) > 0 && <div className="mt-2 border-t border-amber-500/20 pt-2 text-[11px] text-amber-200">Unassigned/legacy payment: {formatINR(unallocatedPaidTotal(payments))} · this historical payment is not attributed to a specific client.</div>}</div>; })}</div>}</div>
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
    if (!/^\d{4}$/.test(currentPwd) || !/^\d{4}$/.test(newPwd)) { toast('PIN must be exactly 4 digits', 'error'); return; }
    if (newPwd !== confirmPwd) { toast('New passwords do not match', 'error'); return; }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('portal-auth', { body: { action: 'change-pin', currentPin: currentPwd, newPin: newPwd } });
    setSaving(false);
    if (error || data?.error) {
      toast(data?.error || 'Failed to change PIN. Please try again.', 'error');
      return;
    }
    onUpdated({ ...partner, password_changed: true });
    toast('PIN updated successfully!', 'success');
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
