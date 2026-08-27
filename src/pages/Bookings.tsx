import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Search,
  Sparkles,
  CalendarPlus,
  ChevronRight,
  Edit3,
  Trash2,
  Printer,
  MapPin,
  Phone,
  MessageCircle,
  CheckCircle2,
  Copy,
  X,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Unlock,
  RotateCcw,
  RefreshCw,
  Download,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type {
  Booking,
  EventFunction,
  BookingDeliverables,
  BookingAlbumRow,
  BookingVideoRow,
  BookingCustomItem,
  Partner,
  ShootAssignment,
  BookingPaymentDetails,
  BookingPaymentInstallment,
  BookingPaperRow,
  StudioSettings,
} from '@/lib/types';
import { formatINR, formatDate, todayISO } from '@/lib/format';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { useDraftState, useDraftOpen } from '@/lib/useDraftState';
import {
  BOOKING_STATUSES,
  BOOKING_FUNCTION_NAMES,
  BOOKING_ALBUM_TYPES,
  BOOKING_ALBUM_SIZES,
  BOOKING_ALBUM_PAPERS,
  BOOKING_ALBUM_COVERS,
  BOOKING_VIDEO_SERVICES,
  BOOKING_VIDEO_FORMATS,
} from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { BillInvoice, formatDeliverablesList } from '@/components/BillInvoice';
import { copyToClipboard } from '@/lib/clipboard';
import { Modal } from '@/components/ui/Modal';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MasterPinDialog } from '@/components/ui/MasterPinDialog';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useRefresh } from '@/context/RefreshContext';
import { buildPdfFilename, downloadA4Pdf, PrintableDualCopies } from '@/lib/pdf';

const STATUS_COLORS: Record<string, 'amber' | 'emerald' | 'rose' | 'sky' | 'slate'> = {
  CONFIRMED: 'amber',
  TENTATIVE: 'sky',
  COMPLETED: 'emerald',
};

const DEFAULT_DELIVERABLES: BookingDeliverables = {
  raw_video: false,
  raw_selected_photos: false,
  raw_all_photos: false,
  raw_edited_photos: false,
};

const toNum = (v: string | number | undefined) => { const n = Number(v); return isNaN(n) ? 0 : n; };

function sanitizePayload<T>(payload: T): T {
  return JSON.parse(JSON.stringify(payload)) as T;
}

const bookingDue = (booking: Pick<Booking, 'total_amount' | 'discount' | 'advance_paid'>) =>
  toNum(booking.total_amount) - toNum(booking.discount) - toNum(booking.advance_paid);

function recycleDaysRemaining(deletedAt: string | null | undefined): number {
  if (!deletedAt) return 90;
  return Math.max(0, 90 - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86400000));
}

function uid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function emptyPaperRow(): BookingPaperRow {
  return { id: uid(), paper_type: 'Glossy', sheets: '', rate: '', total: '' };
}

function emptyAlbumRow(): BookingAlbumRow {
  return {
    id: uid(),
    album_type: 'Main Wedding Album',
    size: '12x36',
    cover: 'Plain',
    cover_rate: '',
    mini_album: false,
    mini_qty: '',
    mini_rate: '',
    papers: [emptyPaperRow()],
    total: '',
  };
}

function emptyVideoRow(): BookingVideoRow {
  return { id: uid(), video_service: 'Full Traditional Video', quality: '1080p FHD', qty: '', rate: '', total: '' };
}

function computeAlbumTotal(r: BookingAlbumRow): number {
  const coverTotal = toNum(r.cover_rate);
  const miniTotal = toNum(r.mini_qty) * toNum(r.mini_rate);
  const papersTotal = r.papers.reduce((s, p) => s + toNum(p.total), 0);
  return coverTotal + miniTotal + papersTotal;
}

function computeVideoTotal(r: BookingVideoRow): number {
  return toNum(r.qty) * toNum(r.rate);
}

export function Bookings() {
  const { toast } = useToast();
  const { settings } = useSettings();
  const { refreshToken } = useRefresh();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [successBooking, setSuccessBooking] = useState<Booking | null>(null);
  const [view, setView] = useState<'active' | 'archived' | 'recycle'>('active');
  const [showPin, setShowPin] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<'soft' | 'permanent'>('soft');

  const load = useCallback(async () => {
    const { data } = await supabase.from('bookings').select('*').order('shoot_date');
    setBookings((data ?? []) as Booking[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshToken]);

  const filtered = bookings.filter((b) => {
    const q = search.toLowerCase();
    const lifecycleMatch = view === 'recycle' ? !!b.deleted_at : view === 'archived' ? !!b.archived_at && !b.deleted_at : !b.archived_at && !b.deleted_at;
    return lifecycleMatch && ((b.client_name ?? '').toLowerCase().includes(q) || (b.event_function ?? '').toLowerCase().includes(q) || (b.booking_no ?? '').toLowerCase().includes(q));
  });

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from('bookings').update({ deleted_at: new Date().toISOString() }).eq('id', deleteId);
    toast('Booking moved to Recycle Bin', 'success');
    setDeleteId(null); setShowPin(false); load();
  };

  const restoreBooking = async (id: string) => { await supabase.from('bookings').update({ archived_at: null, deleted_at: null }).eq('id', id); toast('Booking restored to Active', 'success'); load(); };
  const permanentlyDeleteBooking = async () => { if (!deleteId) return; await supabase.from('bookings').delete().eq('id', deleteId); toast('Booking permanently deleted', 'success'); setDeleteId(null); setShowPin(false); load(); };

  const copyBookingSummary = async (b: Booking) => {
    const text = buildBookingSummaryText(b, settings);
    const ok = await copyToClipboard(text);
    toast(ok ? 'Bill summary copied to clipboard' : 'Failed to copy bill summary', ok ? 'success' : 'error');
  };

  return (
    <div className="flex h-full w-full flex-col space-y-5 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Bookings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">B2C Films — client event bookings</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-amber-400"
        >
          <Plus className="h-4 w-4" /> New Booking
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by client, event, or booking no..."
          className={`${inputClass} pl-10`}
        />
      </div>
      <div className="flex gap-2"><button onClick={() => setView('active')} className={`rounded-lg px-3 py-2 text-xs font-medium ${view === 'active' ? 'bg-amber-500 text-slate-900' : 'border border-slate-200 dark:border-white/10 dark:text-slate-300'}`}>Active</button><button onClick={() => setView('archived')} className={`rounded-lg px-3 py-2 text-xs font-medium ${view === 'archived' ? 'bg-amber-500 text-slate-900' : 'border border-slate-200 dark:border-white/10 dark:text-slate-300'}`}>Archived</button><button onClick={() => setView('recycle')} className={`rounded-lg px-3 py-2 text-xs font-medium ${view === 'recycle' ? 'bg-amber-500 text-slate-900' : 'border border-slate-200 dark:border-white/10 dark:text-slate-300'}`}>Recycle Bin</button></div>

      {loading ? (
        <div className="flex justify-center py-20"><Sparkles className="h-6 w-6 animate-pulse text-amber-500" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={CalendarPlus} title="No bookings found" subtitle="Create a new booking to get started" />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((b) => (
            <div
              key={b.id}
              onClick={() => setDetailBooking(b)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setDetailBooking(b); }}
              role="button"
              tabIndex={0}
              className="group flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-amber-500/30 hover:bg-amber-50/50 dark:border-white/10 dark:bg-slate-900/50 dark:hover:border-amber-500/20 dark:hover:bg-slate-900"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{b.client_name}</p>
                  <Badge color={STATUS_COLORS[b.booking_status] ?? 'slate'}>{b.booking_status}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {b.booking_no} · {b.event_function} · {formatDate(b.shoot_date)} {b.venue && `· ${b.venue}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatINR(Number(b.total_amount))}</p>
                <p className="text-xs text-rose-500 dark:text-rose-400">{formatINR(bookingDue(b))} due</p>
                {view === 'recycle' && <p className="text-[11px] text-amber-600 dark:text-amber-400">Expires in {recycleDaysRemaining(b.deleted_at)} days</p>}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); copyBookingSummary(b); }}
                className="shrink-0 rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-amber-500 dark:hover:bg-white/10"
                title="Copy bill summary"
              >
                <Copy className="h-4 w-4" />
              </button>
              <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-amber-500 dark:group-hover:text-amber-400" />
              {view !== 'active' && <button onClick={(e) => { e.stopPropagation(); restoreBooking(b.id); }} className="text-xs text-emerald-600 dark:text-emerald-400">Restore</button>}
              {view === 'recycle' && <button onClick={(e) => { e.stopPropagation(); setDeleteId(b.id); setPendingDelete('permanent'); setShowPin(true); }} className="text-xs text-rose-500">Delete Forever</button>}
            </div>
          ))}
        </div>
      )}

      <BookingForm
        open={showForm}
        onClose={() => setShowForm(false)}
        editing={editing}
        existing={bookings}
        onSaved={(saved: Booking) => { setShowForm(false); load(); setSuccessBooking(saved); toast('Saved Successfully!', 'success'); }}
      />

      {successBooking && (
        <ErrorBoundary>
          <BookingSuccessModal
            booking={successBooking}
            onClose={() => setSuccessBooking(null)}
            onView={() => { setDetailBooking(successBooking); setSuccessBooking(null); }}
          />
        </ErrorBoundary>
      )}

      {createPortal(
        <div id="printable-bill-sheet" aria-hidden>
          {successBooking && <BillInvoice booking={successBooking} settings={settings} />}
        </div>,
        document.body,
      )}

      {detailBooking && (
        <ErrorBoundary>
          <BookingDetail
            booking={detailBooking}
            onClose={() => { setDetailBooking(null); load(); }}
            onEdit={() => { setEditing(detailBooking); setDetailBooking(null); setShowForm(true); }}
            onDelete={() => { setDeleteId(detailBooking.id); setPendingDelete('soft'); setShowPin(true); setDetailBooking(null); }}
          />
        </ErrorBoundary>
      )}

      <ConfirmDialog
        open={false}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Booking"
        message="This will permanently delete the booking. This cannot be undone."
        confirmLabel="Delete"
        danger
      />
      <MasterPinDialog open={showPin} settings={settings} onClose={() => { setShowPin(false); setDeleteId(null); }} onVerified={() => { if (pendingDelete === 'permanent') permanentlyDeleteBooking(); else handleDelete(); }} />
    </div>
  );
}

function nextBookingNo(existing: Booking[]): string {
  const max = existing.reduce((m, b) => {
    const n = parseInt(b.booking_no.replace(/\D/g, ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `BUF-${String(max + 1).padStart(3, '0')}`;
}

interface BookingDraftData {
  clientName: string;
  clientMobile: string;
  clientAddress: string;
  venue: string;
  bookingStatus: string;
  events: EventFunction[];
  albumRows: BookingAlbumRow[];
  videoRows: BookingVideoRow[];
  customItems: BookingCustomItem[];
  deliverables: BookingDeliverables;
  baseAmount: string;
  totalAmount: string;
  discount: string;
  advancePaid: string;
}

function BookingForm({ open, onClose, editing, existing, onSaved }: { open: boolean; onClose: () => void; editing: Booking | null; existing: Booking[]; onSaved: (saved: Booking) => void }) {
  const { toast } = useToast();
  const { settings } = useSettings();
  const draftKey = editing ? `booking-edit-${editing.id}` : 'booking-new';

  const [clientName, setClientName] = useDraftState<string>(`${draftKey}-clientName`, '');
  const [clientMobile, setClientMobile] = useDraftState<string>(`${draftKey}-clientMobile`, '');
  const [clientAddress, setClientAddress] = useDraftState<string>(`${draftKey}-clientAddress`, '');
  const [venue, setVenue] = useDraftState<string>(`${draftKey}-venue`, '');
  const [bookingStatus, setBookingStatus] = useDraftState<string>(`${draftKey}-bookingStatus`, 'CONFIRMED');
  const [events, setEvents] = useDraftState<EventFunction[]>(`${draftKey}-events`, []);
  const [albumRows, setAlbumRows] = useDraftState<BookingAlbumRow[]>(`${draftKey}-albumRows`, []);
  const [videoRows, setVideoRows] = useDraftState<BookingVideoRow[]>(`${draftKey}-videoRows`, []);
  const [customItems, setCustomItems] = useDraftState<BookingCustomItem[]>(`${draftKey}-customItems`, []);
  const [deliverables, setDeliverables] = useDraftState<BookingDeliverables>(`${draftKey}-deliverables`, { ...DEFAULT_DELIVERABLES });
  const [baseAmount, setBaseAmount] = useDraftState<string>(`${draftKey}-baseAmount`, '');
  const [totalAmount, setTotalAmount] = useDraftState<string>(`${draftKey}-totalAmount`, '');
  const [discount, setDiscount] = useDraftState<string>(`${draftKey}-discount`, '');
  const [advancePaid, setAdvancePaid] = useDraftState<string>(`${draftKey}-advancePaid`, '');
  const [paymentMode, setPaymentMode] = useDraftState<string>(`${draftKey}-paymentMode`, 'Cash');
  const [paymentDate, setPaymentDate] = useDraftState<string>(`${draftKey}-paymentDate`, todayISO());
  const [customPaymentNote, setCustomPaymentNote] = useDraftState<string>(`${draftKey}-customPaymentNote`, '');
  const [paidAmount, setPaidAmount] = useDraftState<string>(`${draftKey}-paidAmount`, '');
  const [paymentHistory, setPaymentHistory] = useDraftState<BookingPaymentInstallment[]>(`${draftKey}-paymentHistory`, []);
  const [showPaymentQr, setShowPaymentQr] = useState(false);
  const [paymentVerified, setPaymentVerified] = useState(false);

  const clearDraft = () => {
    setClientName('');
    setClientMobile('');
    setClientAddress('');
    setVenue('');
    setBookingStatus('CONFIRMED');
    setEvents([]);
    setAlbumRows([]);
    setVideoRows([]);
    setCustomItems([]);
    setDeliverables({ ...DEFAULT_DELIVERABLES });
    setBaseAmount('');
    setTotalAmount('');
    setDiscount('');
    setAdvancePaid('');
    setPaymentMode('Cash');
    setPaymentDate(todayISO());
    setCustomPaymentNote('');
    setPaidAmount('');
    setPaymentHistory([]);
    setShowPaymentQr(false);
    setPaymentVerified(false);
  };

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const d = editing.deliverables_data ?? { ...DEFAULT_DELIVERABLES };
      setClientName(editing.client_name ?? '');
      setClientMobile(editing.client_mobile ?? '');
      setClientAddress(editing.client_address ?? '');
      setVenue(editing.venue ?? '');
      setBookingStatus(editing.booking_status ?? 'CONFIRMED');
      setEvents(editing.events ?? []);
      setAlbumRows((d.album_rows ?? []).map((r) => ({
        id: r.id ?? uid(),
        album_type: r.album_type ?? 'Main Wedding Album',
        size: r.size ?? '12x36',
        cover: r.cover ?? 'Plain',
        cover_rate: r.cover_rate ?? '',
        mini_album: r.mini_album ?? false,
        mini_qty: r.mini_qty ?? '',
        mini_rate: r.mini_rate ?? '',
        papers: (r.papers ?? []).map((p) => ({
          id: p.id ?? uid(),
          paper_type: p.paper_type ?? 'Glossy',
          sheets: p.sheets ?? '',
          rate: p.rate ?? '',
          total: p.total ?? '',
        })),
        total: r.total ?? '',
      })));
      setVideoRows((d.video_rows ?? []).map((r) => ({
        id: r.id ?? uid(),
        video_service: r.video_service ?? 'Full Traditional Video',
        quality: r.quality ?? '1080p FHD',
        qty: r.qty ?? '',
        rate: r.rate ?? '',
        total: r.total ?? '',
      })));
      setCustomItems((d.custom_items ?? []).map((item) => ({
        id: item.id ?? uid(),
        name: item.name ?? '',
        qty: item.qty ?? '1',
        rate: item.rate ?? '',
        amount: item.amount ?? String(toNum(item.qty ?? '1') * toNum(item.rate)),
      })));
      setDeliverables({
        raw_video: d.raw_video ?? false,
        raw_selected_photos: d.raw_selected_photos ?? false,
        raw_all_photos: d.raw_all_photos ?? false,
        raw_edited_photos: d.raw_edited_photos ?? false,
      });
      setBaseAmount(editing && Number(editing.base_amount) ? String(editing.base_amount) : '');
      setTotalAmount(editing && Number(editing.total_amount) ? String(editing.total_amount) : '');
      setDiscount(editing && Number(editing.discount) ? String(editing.discount) : '');
      setAdvancePaid(editing && Number(editing.advance_paid) ? String(editing.advance_paid) : '');
      const payment = d.payment_details;
      setPaymentMode(payment?.payment_mode === 'UPI / PhonePe / GPay' ? 'QR Code' : (payment?.payment_mode ?? 'Cash'));
      setPaymentDate(payment?.payment_date ?? todayISO());
      setCustomPaymentNote(payment?.custom_note ?? '');
      setPaidAmount(payment?.paid_amount ?? (editing && Number(editing.advance_paid) ? String(editing.advance_paid) : ''));
      setPaymentHistory(payment?.payment_history ?? (editing && Number(editing.advance_paid) ? [{ id: uid(), payment_date: payment?.payment_date ?? todayISO(), payment_mode: payment?.payment_mode ?? 'Cash', custom_note: payment?.custom_note ?? 'Legacy payment record', paid_amount: String(editing.advance_paid) }] : []));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  useEffect(() => {
    const historyTotal = paymentHistory.reduce((sum, payment) => sum + toNum(payment.paid_amount), 0);
    if (paymentHistory.length > 0 && String(historyTotal) !== advancePaid) setAdvancePaid(String(historyTotal));
  }, [paymentHistory, advancePaid, setAdvancePaid]);

  useEffect(() => {
    setShowPaymentQr(false);
    setPaymentVerified(false);
  }, [open, editing]);

  const addEvent = () => {
    setEvents([...events, {
      name: 'Haldi',
      date: '',
      time: '',
      start_time: '',
      end_time: '',
      end_date_shift: 'same_date',
      venue: '',
    }]);
  };
  const updateEvent = (i: number, patch: Partial<EventFunction>) => {
    setEvents(events.map((e, idx) => idx === i ? { ...e, ...patch } : e));
  };
  const removeEvent = (i: number) => {
    setEvents(events.filter((_, idx) => idx !== i));
  };

  const addAlbumRow = () => setAlbumRows((r) => [...r, emptyAlbumRow()]);
  const updateAlbumRow = (i: number, patch: Partial<BookingAlbumRow>) => {
    setAlbumRows((rows) => rows.map((r, idx) => {
      if (idx !== i) return r;
      const updated = { ...r, ...patch };
      updated.total = String(computeAlbumTotal(updated));
      return updated;
    }));
  };
  const removeAlbumRow = (i: number) => setAlbumRows((rows) => rows.filter((_, idx) => idx !== i));

  const addPaperRow = (ai: number) => {
    setAlbumRows((rows) => rows.map((r, idx) => {
      if (idx !== ai) return r;
      const updated = { ...r, papers: [...r.papers, emptyPaperRow()] };
      updated.total = String(computeAlbumTotal(updated));
      return updated;
    }));
  };
  const updatePaperRow = (ai: number, pi: number, patch: Partial<BookingPaperRow>) => {
    setAlbumRows((rows) => rows.map((r, idx) => {
      if (idx !== ai) return r;
      const newPapers = r.papers.map((p, pidx) => {
        if (pidx !== pi) return p;
        const updated = { ...p, ...patch };
        updated.total = String(toNum(updated.sheets) * toNum(updated.rate));
        return updated;
      });
      const updated = { ...r, papers: newPapers };
      updated.total = String(computeAlbumTotal(updated));
      return updated;
    }));
  };
  const removePaperRow = (ai: number, pi: number) => {
    setAlbumRows((rows) => rows.map((r, idx) => {
      if (idx !== ai) return r;
      const updated = { ...r, papers: r.papers.filter((_, pidx) => pidx !== pi) };
      updated.total = String(computeAlbumTotal(updated));
      return updated;
    }));
  };

  const addVideoRow = () => setVideoRows((r) => [...r, emptyVideoRow()]);
  const updateVideoRow = (i: number, patch: Partial<BookingVideoRow>) => {
    setVideoRows((rows) => rows.map((r, idx) => {
      if (idx !== i) return r;
      const updated = { ...r, ...patch };
      updated.total = String(computeVideoTotal(updated));
      return updated;
    }));
  };
  const removeVideoRow = (i: number) => setVideoRows((rows) => rows.filter((_, idx) => idx !== i));

  const addCustomItem = () => setCustomItems((items) => [...items, { id: uid(), name: '', qty: '1', rate: '', amount: '' }]);
  const updateCustomItem = (i: number, patch: Partial<BookingCustomItem>) => {
    setCustomItems((items) => items.map((item, idx) => {
      if (idx !== i) return item;
      const updated = { ...item, ...patch };
      updated.amount = String(toNum(updated.qty) * toNum(updated.rate));
      return updated;
    }));
  };
  const removeCustomItem = (i: number) => setCustomItems((items) => items.filter((_, idx) => idx !== i));

  const toggleDeliverable = (key: 'raw_video' | 'raw_selected_photos' | 'raw_all_photos' | 'raw_edited_photos') => {
    setDeliverables((d) => ({ ...d, [key]: !d[key] }));
  };

  const syncDeliveryData = useCallback(() => {
    const hasAlbumItems = albumRows.length > 0;
    const hasVideoItems = videoRows.length > 0;
    if (!hasAlbumItems && !hasVideoItems) return;

    setDeliverables((current) => ({
      ...current,
      raw_video: current.raw_video || hasVideoItems,
      raw_selected_photos: current.raw_selected_photos || hasAlbumItems,
      raw_edited_photos: current.raw_edited_photos || hasAlbumItems || hasVideoItems,
    }));
  }, [albumRows.length, videoRows.length]);

  useEffect(() => {
    syncDeliveryData();
  }, [syncDeliveryData, albumRows, videoRows, customItems]);

  const lineItemsTotal = useMemo(() => {
    const albumTotal = albumRows.reduce((s, r) => s + computeAlbumTotal(r), 0);
    const videoTotal = videoRows.reduce((s, r) => s + computeVideoTotal(r), 0);
    const customItemsTotal = customItems.reduce((s, item) => s + toNum(item.amount), 0);
    return albumTotal + videoTotal + customItemsTotal;
  }, [albumRows, videoRows, customItems]);

  const computedTotal = lineItemsTotal;
  const totalAmountNum = totalAmount !== '' ? toNum(totalAmount) : computedTotal;
  const netDue = totalAmountNum - toNum(discount) - toNum(advancePaid);

  const eventFunctionLabel = events.length > 0
    ? events.map((e) => e.name === 'Custom' && e.customName ? e.customName : e.name).join(', ')
    : 'Wedding';
  const primaryDate = events.find((e) => e.date)?.date || events[0]?.date || todayISO();
  const primaryTime = events.find((e) => e.time)?.time || events[0]?.time || '';

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    if (isSubmitting || !paymentVerified) return;
    if (!clientName || !clientMobile) { toast('Name and mobile are required', 'error'); return; }
    setIsSubmitting(true);
    const payload = sanitizePayload({
      id: editing?.id ?? uid(),
      booking_no: editing?.booking_no ?? nextBookingNo(existing),
      client_name: clientName,
      client_mobile: clientMobile,
      client_address: clientAddress,
      event_function: eventFunctionLabel,
      events,
      shoot_date: primaryDate,
      shoot_time: primaryTime,
      venue: events.find((event) => event.venue)?.venue ?? venue,
      booking_status: bookingStatus,
      archived_at: bookingStatus === 'COMPLETED' ? (editing?.archived_at ?? new Date().toISOString()) : null,
      total_amount: totalAmountNum,
      discount: toNum(discount),
      advance_paid: paymentHistory.reduce((sum, payment) => sum + toNum(payment.paid_amount), 0),
      deliverables_data: {
        ...deliverables,
        album_rows: albumRows,
        video_rows: videoRows,
        custom_items: customItems,
        payment_details: {
          payment_mode: paymentMode,
          payment_date: paymentDate,
          custom_note: customPaymentNote,
          paid_amount: paidAmount,
          payment_history: paymentHistory,
        } satisfies BookingPaymentDetails,
      },
      base_amount: toNum(baseAmount),
      is_login_allowed: editing?.is_login_allowed ?? false,
      client_password: editing?.client_password ?? clientMobile,
      password_changed: editing?.password_changed ?? false,
    });
    let savedBooking: Booking | null = null;
    const { data, error } = await supabase.from('bookings').upsert(payload).select().single();
    if (error) {
      setIsSubmitting(false);
      toast('Failed to save booking. Please try again.', 'error');
      return;
    }
    savedBooking = data as Booking | null;
    clearDraft();
    setIsSubmitting(false);
    if (savedBooking) onSaved(savedBooking);
  };

  const handlePayNow = () => {
    if (toNum(paidAmount) <= 0) {
      toast('Enter an amount greater than zero before paying', 'error');
      return;
    }
    const installment: BookingPaymentInstallment = {
      id: uid(),
      payment_date: paymentDate,
      payment_mode: paymentMode,
      custom_note: customPaymentNote,
      paid_amount: paidAmount,
    };
    setPaymentHistory((history) => [...history, installment]);
    setAdvancePaid(paidAmount);
    setPaymentVerified(true);
    setShowPaymentQr(false);
    toast('Payment recorded and verified', 'success');
  };

  const startAnotherPayment = () => {
    setPaidAmount('');
    setCustomPaymentNote('');
    setPaymentDate(todayISO());
    setPaymentVerified(false);
  };

  const sendPaymentReceipt = (payment: BookingPaymentInstallment) => {
    let phone = clientMobile.replace(/\D/g, '');
    if (phone.length === 10) phone = `91${phone}`;
    const currentAdvance = paymentHistory.reduce((sum, item) => sum + toNum(item.paid_amount), 0);
    const remainingDue = totalAmountNum - toNum(discount) - currentAdvance;
    const message = `*Payment Receipt*\nClient: ${clientName || 'Client'}\nDate: ${formatDate(payment.payment_date)}\nAmount Paid: ${formatINR(toNum(payment.paid_amount))}\nPayment Mode: ${payment.payment_mode}\nNote: ${payment.custom_note || '—'}\nRemaining Due: ${formatINR(remainingDue)}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const handleClose = () => {
    clearDraft();
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={editing ? 'Edit Booking' : 'New Booking'} size="xl" dismissible={false}>
      <div className="space-y-5">
        {/* 1. CLIENT PROFILE */}
        <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Client Profile</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Client Name">
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputClass} placeholder="Client name" />
            </Field>
            <Field label="Mobile (WhatsApp)">
              <input type="tel" value={clientMobile} onChange={(e) => setClientMobile(e.target.value)} className={inputClass} placeholder="+91 ..." />
            </Field>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Client Address" className="sm:col-span-2">
              <input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} className={inputClass} placeholder="Client address" />
            </Field>
            <Field label="Status">
              <select value={bookingStatus} onChange={(e) => setBookingStatus(e.target.value)} className={selectClass}>
                {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
        </div>

        {/* 2. FUNCTION DETAILS & SCHEDULE */}
        <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Function Details &amp; Schedule</h3>
            <button
              onClick={addEvent}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
            >
              <Plus className="h-3.5 w-3.5" /> Add Custom Function
            </button>
          </div>
          {events.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-400">No functions added yet. Click "Add Custom Function" to begin.</p>
          ) : (
            <div className="space-y-2">
              {events.map((e, i) => (
                <div key={i} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 dark:border-white/5 dark:bg-white/5">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <select
                      value={e.name}
                      onChange={(ev) => updateEvent(i, { name: ev.target.value })}
                      className={`${selectClass} w-40 shrink-0`}
                    >
                      {BOOKING_FUNCTION_NAMES.map((fn) => <option key={fn} value={fn}>{fn}</option>)}
                    </select>
                    {e.name === 'Custom' && (
                      <input
                        value={e.customName ?? ''}
                        onChange={(ev) => updateEvent(i, { customName: ev.target.value })}
                        placeholder="Custom function name"
                        className={`${inputClass} min-w-[120px] flex-1`}
                      />
                    )}
                    <button onClick={() => removeEvent(i)} className="ml-auto shrink-0 rounded p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10" title="Delete function">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Field label="Function Date">
                      <input type="date" value={e.date} onChange={(ev) => updateEvent(i, { date: ev.target.value })} className={inputClass} />
                    </Field>
                    <Field label="Starting Function Time">
                      <div className="space-y-1.5">
                        <input
                          type="time"
                          value={e.start_time ?? e.time}
                          onChange={(ev) => updateEvent(i, { start_time: ev.target.value, time: ev.target.value })}
                          className={inputClass}
                        />
                      </div>
                    </Field>
                    <Field label="Ending Function Time">
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1.5 dark:border-white/10 dark:bg-slate-900/50">
                        <input
                          type="time"
                          value={e.end_time ?? ''}
                          onChange={(ev) => updateEvent(i, { end_time: ev.target.value })}
                          className={`${inputClass} min-w-0 flex-1 border-0 bg-transparent px-1.5 py-1.5 focus:bg-transparent dark:bg-transparent dark:focus:bg-transparent`}
                        />
                        <select
                          value={e.end_date_shift === 'next_date' ? 'after_day' : (e.end_date_shift ?? 'same_date')}
                          onChange={(ev) => updateEvent(i, { end_date_shift: ev.target.value as EventFunction['end_date_shift'] })}
                          className={`${selectClass} w-auto min-w-[118px] border-0 bg-transparent px-1.5 py-1.5 text-xs focus:bg-transparent dark:bg-transparent dark:focus:bg-transparent`}
                        >
                          <option value="same_date">Same Date</option>
                          <option value="after_day">After Day</option>
                        </select>
                      </div>
                    </Field>
                  </div>
                  <div className="mt-3">
                    <Field label="Event Venue">
                      <input
                        value={e.venue ?? ''}
                        onChange={(ev) => updateEvent(i, { venue: ev.target.value })}
                        className={inputClass}
                        placeholder="Function-specific venue location"
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. ALBUM SECTION */}
        <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Album Section</h3>
            <button
              onClick={addAlbumRow}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
            >
              <Plus className="h-3.5 w-3.5" /> Add Album Item
            </button>
          </div>
          {albumRows.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-400">No album items added yet.</p>
          ) : (
            <div className="space-y-3">
              {albumRows.map((r, i) => (
                <div key={r.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5">
                  {/* Master Line: Album Type, Size, Packaging, Rate, Mini Album checkbox */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center">
                    <select
                      value={r.album_type}
                      onChange={(e) => updateAlbumRow(i, { album_type: e.target.value })}
                      className={`${selectClass} sm:col-span-3`}
                    >
                      {BOOKING_ALBUM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select
                      value={r.size}
                      onChange={(e) => updateAlbumRow(i, { size: e.target.value })}
                      className={`${selectClass} sm:col-span-2`}
                    >
                      {BOOKING_ALBUM_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select
                      value={r.cover}
                      onChange={(e) => updateAlbumRow(i, { cover: e.target.value })}
                      className={`${selectClass} sm:col-span-2`}
                    >
                      {BOOKING_ALBUM_COVERS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input
                      type="number"
                      value={r.cover_rate}
                      onChange={(e) => updateAlbumRow(i, { cover_rate: e.target.value })}
                      onFocus={(e) => { if (toNum(e.target.value) === 0) e.target.value = ''; }}
                      className={`${inputClass} sm:col-span-2`}
                      placeholder="Rate (₹)"
                    />
                    <div className="flex items-center justify-between gap-2 sm:col-span-3">
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                        <input
                          type="checkbox"
                          checked={r.mini_album}
                          onChange={(e) => updateAlbumRow(i, { mini_album: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                        />
                        Mini Album
                      </label>
                      <button onClick={() => removeAlbumRow(i)} className="shrink-0 rounded p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Mini Album row (conditional) */}
                  {r.mini_album && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50/50 p-2 dark:bg-amber-500/5">
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Mini Album:</span>
                      <input
                        type="number"
                        value={r.mini_qty}
                        onChange={(e) => updateAlbumRow(i, { mini_qty: e.target.value })}
                        onFocus={(e) => { if (toNum(e.target.value) === 0) e.target.value = ''; }}
                        className={`${inputClass} w-20`}
                        placeholder="Qty"
                      />
                      <input
                        type="number"
                        value={r.mini_rate}
                        onChange={(e) => updateAlbumRow(i, { mini_rate: e.target.value })}
                        onFocus={(e) => { if (toNum(e.target.value) === 0) e.target.value = ''; }}
                        className={`${inputClass} w-24`}
                        placeholder="Rate (₹)"
                      />
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        = {formatINR(toNum(r.mini_qty) * toNum(r.mini_rate))}
                      </span>
                    </div>
                  )}

                  {/* Paper sub-rows */}
                  <div className="mt-2 space-y-1.5 border-l-2 border-amber-200 pl-3 dark:border-amber-500/20">
                    {r.papers.map((p, pi) => (
                      <div key={p.id} className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center">
                        <select
                          value={p.paper_type}
                          onChange={(e) => updatePaperRow(i, pi, { paper_type: e.target.value })}
                          className={`${selectClass} sm:col-span-4`}
                        >
                          {BOOKING_ALBUM_PAPERS.map((pp) => <option key={pp} value={pp}>{pp}</option>)}
                        </select>
                        <input
                          type="number"
                          value={p.sheets}
                          onChange={(e) => updatePaperRow(i, pi, { sheets: e.target.value })}
                          onFocus={(e) => { if (toNum(e.target.value) === 0) e.target.value = ''; }}
                          className={`${inputClass} sm:col-span-3`}
                          placeholder="Sheets Qty"
                        />
                        <input
                          type="number"
                          value={p.rate}
                          onChange={(e) => updatePaperRow(i, pi, { rate: e.target.value })}
                          onFocus={(e) => { if (toNum(e.target.value) === 0) e.target.value = ''; }}
                          className={`${inputClass} sm:col-span-2`}
                          placeholder="Rate/Sheet"
                        />
                        <span className="flex items-center text-xs font-medium text-slate-600 dark:text-slate-300 sm:col-span-2">
                          {formatINR(toNum(p.total))}
                        </span>
                        {r.papers.length > 1 && (
                          <button
                            onClick={() => removePaperRow(i, pi)}
                            className="flex items-center justify-center sm:col-span-1 text-slate-400 hover:text-rose-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => addPaperRow(i)}
                      className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
                    >
                      <Plus className="h-3 w-3" /> Add Paper
                    </button>
                  </div>

                  {/* Album line total */}
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-100 px-3 py-1.5 text-xs dark:bg-white/10">
                    <span className="text-slate-400">Album Total</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {formatINR(computeAlbumTotal(r))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. VIDEO SECTION */}
        <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Video Section</h3>
            <button
              onClick={addVideoRow}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
            >
              <Plus className="h-3.5 w-3.5" /> Add Video Item
            </button>
          </div>
          {videoRows.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-400">No video items added yet.</p>
          ) : (
            <div className="space-y-2">
              {videoRows.map((r, i) => (
                <div key={r.id} className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center rounded-lg border border-slate-100 bg-slate-50 p-2.5 dark:border-white/5 dark:bg-white/5">
                  <select
                    value={r.video_service}
                    onChange={(e) => updateVideoRow(i, { video_service: e.target.value })}
                    className={`${selectClass} sm:col-span-3`}
                  >
                    {BOOKING_VIDEO_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select
                    value={r.quality}
                    onChange={(e) => updateVideoRow(i, { quality: e.target.value })}
                    className={`${selectClass} sm:col-span-2`}
                  >
                    {BOOKING_VIDEO_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <input
                    type="number"
                    value={r.qty}
                    min={1}
                    onChange={(e) => updateVideoRow(i, { qty: e.target.value })}
                    onFocus={(e) => { if (toNum(e.target.value) === 0) e.target.value = ''; }}
                    className={`${inputClass} sm:col-span-2`}
                    placeholder="Qty/Days"
                  />
                  <input
                    type="number"
                    value={r.rate}
                    onChange={(e) => updateVideoRow(i, { rate: e.target.value })}
                    onFocus={(e) => { if (toNum(e.target.value) === 0) e.target.value = ''; }}
                    className={`${inputClass} sm:col-span-2`}
                    placeholder="Rate (₹)"
                  />
                  <span className="flex items-center text-xs font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2">
                    {formatINR(computeVideoTotal(r))}
                  </span>
                  <button
                    onClick={() => removeVideoRow(i)}
                    className="flex items-center justify-center sm:col-span-1 text-slate-400 hover:text-rose-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 5. CUSTOM SERVICES / ADDITIONAL ITEMS */}
        <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Custom Services / Additional Items</h3>
            <button
              onClick={addCustomItem}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
            >
              <Plus className="h-3.5 w-3.5" /> Add Item
            </button>
          </div>
          {customItems.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-400">No additional items added yet.</p>
          ) : (
            <div className="space-y-2">
              {customItems.map((item, i) => (
                <div key={item.id} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2.5 dark:border-white/5 dark:bg-white/5 sm:grid-cols-12 sm:items-end">
                  <Field label="Item Name / Description" className="sm:col-span-5">
                    <input value={item.name} onChange={(e) => updateCustomItem(i, { name: e.target.value })} className={inputClass} placeholder="Additional service or item" />
                  </Field>
                  <Field label="Quantity" className="sm:col-span-2">
                    <input type="number" min={1} value={item.qty} onChange={(e) => updateCustomItem(i, { qty: e.target.value })} className={inputClass} />
                  </Field>
                  <Field label="Rate / Price per unit" className="sm:col-span-2">
                    <input type="number" min={0} value={item.rate} onChange={(e) => updateCustomItem(i, { rate: e.target.value })} className={inputClass} placeholder="Rate (₹)" />
                  </Field>
                  <div className="sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Amount</span>
                    <div className={`${inputClass} font-semibold text-slate-700 dark:text-slate-200`}>{formatINR(toNum(item.amount))}</div>
                  </div>
                  <button onClick={() => removeCustomItem(i)} className="flex items-center justify-center pb-2 text-slate-400 hover:text-rose-500 sm:col-span-1" title="Delete item">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 6. DELIVERY DATA */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Delivery Data</h3>
            <button
              type="button"
              onClick={syncDeliveryData}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh / Sync
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
            <div className="flex flex-col gap-4">
              <DeliverableCheckbox label="Raw Video" checked={!!deliverables.raw_video} onChange={() => toggleDeliverable('raw_video')} />
              <DeliverableCheckbox label="Selected Photos" checked={!!deliverables.raw_selected_photos} onChange={() => toggleDeliverable('raw_selected_photos')} />
              <DeliverableCheckbox label="All Photos" checked={!!deliverables.raw_all_photos} onChange={() => toggleDeliverable('raw_all_photos')} />
              <DeliverableCheckbox label="Finished / Edited Photos" checked={!!deliverables.raw_edited_photos} onChange={() => toggleDeliverable('raw_edited_photos')} />
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Package &amp; Media Sync Sheet</h3>
            {albumRows.length === 0 && videoRows.length === 0 && customItems.filter((item) => item.name.trim()).length === 0 ? (
              <p className="text-xs text-slate-400">No deliverables added yet. Select package or click Refresh.</p>
            ) : (
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                {albumRows.length > 0 && (
                  <div>
                    <p className="mb-1 font-semibold text-amber-600 dark:text-amber-400">Albums</p>
                    <div className="space-y-1.5">
                      {albumRows.map((row) => (
                        <div key={row.id} className="rounded border border-slate-200 bg-slate-50 p-2 dark:border-white/10 dark:bg-white/5">
                          <p className="font-medium text-slate-800 dark:text-slate-100">{row.album_type}</p>
                          <p>{row.size} · {row.papers.reduce((total, paper) => total + toNum(paper.sheets), 0)} sheets · {row.cover}</p>
                          {row.papers.length > 0 && <p className="text-slate-500 dark:text-slate-400">{row.papers.map((paper) => paper.paper_type).join(', ')}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {videoRows.length > 0 && (
                  <div>
                    <p className="mb-1 font-semibold text-amber-600 dark:text-amber-400">Videos</p>
                    <div className="space-y-1.5">
                      {videoRows.map((row) => (
                        <div key={row.id} className="rounded border border-slate-200 bg-slate-50 p-2 dark:border-white/10 dark:bg-white/5">
                          <p className="font-medium text-slate-800 dark:text-slate-100">{row.video_service}</p>
                          <p>{row.quality} · Qty {row.qty || '0'}</p>
                          <p className="text-slate-500 dark:text-slate-400">Output: {row.quality}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {customItems.some((item) => item.name.trim()) && (
                  <div>
                    <p className="mb-1 font-semibold text-amber-600 dark:text-amber-400">Additional Items</p>
                    <div className="space-y-1.5">
                      {customItems.filter((item) => item.name.trim()).map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 p-2 dark:border-white/10 dark:bg-white/5">
                          <span>{item.name} x{item.qty || '0'}</span>
                          <span className="font-medium">{formatINR(toNum(item.amount))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* 7. BILLING SUMMARY */}
        <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Billing Summary</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Total Package (₹)">
              <input
                type="number"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                onFocus={(e) => { if (toNum(e.target.value) === 0) e.target.value = ''; }}
                placeholder={String(computedTotal || '')}
                className={inputClass}
              />
            </Field>
            <Field label="Discount (₹)">
              <input
                type="number"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                onFocus={(e) => { if (toNum(e.target.value) === 0) e.target.value = ''; }}
                className={inputClass}
              />
            </Field>
            <Field label="Advance Paid (₹)">
              <input
                type="number"
                value={advancePaid}
                onChange={(e) => { setAdvancePaid(e.target.value); setPaidAmount(e.target.value); setPaymentVerified(false); }}
                onFocus={(e) => { if (toNum(e.target.value) === 0) e.target.value = ''; }}
                className={inputClass}
              />
            </Field>
            <Field label="Net Final Due (₹)">
              <input type="number" value={netDue} className={`${inputClass} font-semibold text-rose-600 dark:text-rose-400`} readOnly />
            </Field>
          </div>
          <div className="mt-3 border-t border-slate-200 pt-3 dark:border-white/10">
            <div className="max-w-[200px]">
              <Field label="Base Amount (₹) — reference only">
                <input
                  type="number"
                  value={baseAmount}
                  onChange={(e) => setBaseAmount(e.target.value)}
                  onFocus={(e) => { if (toNum(e.target.value) === 0) e.target.value = ''; }}
                  className={`${inputClass} text-slate-500`}
                />
              </Field>
            </div>
            <p className="mt-1 text-xs text-slate-400">Standalone reference field — does not affect package, discount, advance, or net calculations.</p>
          </div>
        </div>

        {/* 8. PAYMENT MODE & TRANSACTION DETAILS */}
        <div className="rounded-lg border border-slate-800 bg-[#0d1322] p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Payment Mode &amp; Transaction Details</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Payment Mode">
              <select value={paymentMode} onChange={(e) => { setPaymentMode(e.target.value); setShowPaymentQr(false); }} disabled={paymentVerified} className={selectClass}>
                <option>QR Code</option>
                <option>Cash</option>
                <option>Bank Transfer</option>
                <option>Cheque</option>
                <option>Card</option>
              </select>
            </Field>
            <Field label="Payment Date">
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} disabled={paymentVerified} className={inputClass} />
            </Field>
            <Field label="Custom Note / Remarks">
              <input
                value={customPaymentNote}
                onChange={(e) => setCustomPaymentNote(e.target.value)}
                disabled={paymentVerified}
                className={inputClass}
                placeholder="Txn ID or reference"
              />
            </Field>
            <Field label="Amount Paid (₹)">
              <div className="flex gap-2">
                <input
                  type="number"
                  value={paidAmount}
                  onChange={(e) => { setPaidAmount(e.target.value); setAdvancePaid(e.target.value); setPaymentVerified(false); }}
                  onFocus={(e) => { if (toNum(e.target.value) === 0) e.target.value = ''; }}
                  disabled={paymentVerified}
                  className={`${inputClass} min-w-0 flex-1`}
                  placeholder="Amount paid"
                />
                <button
                  type="button"
                  onClick={handlePayNow}
                  disabled={paymentVerified}
                  className="shrink-0 rounded-lg bg-emerald-500 px-2.5 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  ⚡ Pay Now
                </button>
              </div>
            </Field>
          </div>
          {paymentHistory.length > 0 && (
            <div className="mt-4 border-t border-slate-800 pt-3">
              <h4 className="mb-2 text-xs font-semibold text-slate-200">Payment History</h4>
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full min-w-[650px] text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="px-2.5 py-2">Payment Date</th>
                      <th className="px-2.5 py-2">Payment Mode</th>
                      <th className="px-2.5 py-2">Custom Note / Reason</th>
                      <th className="px-2.5 py-2 text-right">Amount Paid (₹)</th>
                      <th className="px-2.5 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {paymentHistory.map((payment) => (
                      <tr key={payment.id} className="border-t border-slate-800 text-slate-300">
                        <td className="px-2.5 py-2">{formatDate(payment.payment_date)}</td>
                        <td className="px-2.5 py-2">{payment.payment_mode}</td>
                        <td className="max-w-[220px] truncate px-2.5 py-2">{payment.custom_note || '—'}</td>
                        <td className="px-2.5 py-2 text-right font-semibold text-emerald-400">{formatINR(toNum(payment.paid_amount))}</td>
                        <td className="px-2.5 py-2 text-right">
                          <button type="button" onClick={() => sendPaymentReceipt(payment)} className="whitespace-nowrap text-emerald-400 hover:text-emerald-300">Send WhatsApp Receipt</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {paymentMode === 'QR Code' && toNum(paidAmount) > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowPaymentQr((visible) => !visible)}
                disabled={paymentVerified}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {showPaymentQr ? '🙈 Hide QR Code' : '👁️ Show QR Code'}
              </button>
              {showPaymentQr && (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 p-3">
                  {settings?.upi_id ? (
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`upi://pay?pa=${settings.upi_id}&am=${toNum(paidAmount)}&cu=INR`)}`}
                      alt="Payment QR code"
                      className="h-40 w-40"
                    />
                  ) : (
                    <p className="text-xs text-slate-400">Add a studio UPI ID in Settings to generate this QR code.</p>
                  )}
                  <div className="text-xs text-slate-300">
                    <p className="font-medium text-white">Scan to pay {formatINR(toNum(paidAmount))}</p>
                    {settings?.upi_id && <p className="mt-1 text-slate-400">UPI: {settings.upi_id}</p>}
                  </div>
                </div>
              )}
            </div>
          )}
          {paymentVerified && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm font-medium text-emerald-300">
              <span>✅ Payment Recorded &amp; Verified</span>
              <button type="button" onClick={startAnotherPayment} className="text-xs text-emerald-200 underline hover:text-white">Add another installment</button>
            </div>
          )}
          <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
            <span className="font-medium">Last Due Balance:</span> {formatINR(netDue)}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-3 pt-1">
          <button onClick={handleClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
          <button
            onClick={handleSave}
            disabled={isSubmitting || !paymentVerified}
            className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:from-amber-400 hover:to-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <><Sparkles className="h-4 w-4 animate-spin" /> Saving...</>
            ) : (
              <>{editing ? 'Update' : 'Create'} Booking</>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DeliverableCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} className="flex items-center gap-2 text-xs">
      <span className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
        checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 dark:border-white/20'
      }`}>
        {checked && <CheckCircle2 className="h-3 w-3" />}
      </span>
      <span className={checked ? 'font-medium text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}>{label}</span>
    </button>
  );
}

function BookingDetail({ booking, onClose, onEdit, onDelete }: { booking: Booking; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const { settings } = useSettings();
  const { toast } = useToast();
  const { triggerRefresh } = useRefresh();
  const safeEvents = booking.events ?? [];
  const safeDeliverables = booking.deliverables_data ?? DEFAULT_DELIVERABLES;
  const netDue = bookingDue(booking);
  const delivList = formatDeliverablesList(safeDeliverables);
  const [showPassword, setShowPassword] = useState(false);
  const [loginAllowed, setLoginAllowed] = useState(booking.is_login_allowed ?? false);
  const [currentPassword, setCurrentPassword] = useState(booking.client_password ?? booking.client_mobile);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [assignments, setAssignments] = useState<ShootAssignment[]>([]);
  const [assignmentPartner, setAssignmentPartner] = useState('');
  const [assignmentFunction, setAssignmentFunction] = useState('');
  const [assignmentRole, setAssignmentRole] = useState('Traditional Photo');
  const [reportingTime, setReportingTime] = useState('');
  const [isBillPreviewOpen, setIsBillPreviewOpen] = useState(false);
  const [isDualPrintOpen, setIsDualPrintOpen] = useState(false);

  const toggleLoginAccess = async () => {
    const newVal = !loginAllowed;
    setLoginAllowed(newVal);
    await supabase.from('bookings').update({ is_login_allowed: newVal }).eq('id', booking.id);
    triggerRefresh();
    toast(newVal ? 'Portal login enabled for this client' : 'Portal login disabled for this client', 'success');
  };

  const resetPassword = async () => {
    const defaultPwd = booking.client_mobile;
    setCurrentPassword(defaultPwd);
    await supabase.from('bookings').update({ client_password: defaultPwd, password_changed: false }).eq('id', booking.id);
    triggerRefresh();
    toast('Password reset to client mobile number', 'success');
  };

  useEffect(() => {
    const loadAssignments = async () => {
      const [{ data: partnerData }, { data: assignmentData }] = await Promise.all([
        supabase.from('partners').select('*').in('status', ['Active', 'On Leave', 'Inactive', 'Archived']).order('name'),
        supabase.from('shoot_assignments').select('*').eq('booking_id', booking.id),
      ]);
      setPartners((partnerData ?? []) as Partner[]);
      setAssignments((assignmentData ?? []) as ShootAssignment[]);
    };
    loadAssignments();
  }, [booking.id]);

  const addAssignment = async () => {
    const partner = partners.find((item) => item.id === assignmentPartner);
    if (!partner || !assignmentFunction) return;
    const alreadyAssigned = assignments.some((item) => item.partner_id === partner.id && item.function_name === assignmentFunction);
    if (alreadyAssigned) { toast('This staff member is already assigned to that function', 'error'); return; }
    const currentEvent = safeEvents.find((event) => event.name === assignmentFunction);
    if (currentEvent?.date) {
      if (partner.status === 'On Leave' && partner.leave_start && partner.leave_end && currentEvent.date >= partner.leave_start && currentEvent.date <= partner.leave_end) {
        toast(`${partner.name} is on leave for ${formatDate(currentEvent.date)}`, 'error');
        return;
      }
      const { data: otherAssignments } = await supabase.from('shoot_assignments').select('booking_id').eq('partner_id', partner.id).neq('booking_id', booking.id);
      const bookingIds = [...new Set((otherAssignments ?? []).map((item: { booking_id: string }) => item.booking_id))];
      if (bookingIds.length > 0) {
        const { data: otherBookings } = await supabase.from('bookings').select('id, events').in('id', bookingIds);
        const clash = (otherBookings ?? []).some((other: { events?: EventFunction[] | null }) => (other.events ?? []).some((event) => event.date === currentEvent.date));
        if (clash) { toast(`${partner.name} already has a same-day booking`, 'error'); return; }
      }
    }
    const { data, error } = await supabase.from('shoot_assignments').insert({
      booking_id: booking.id,
      partner_id: partner.id,
      function_name: assignmentFunction,
      role: assignmentRole,
      reporting_time: reportingTime,
    }).select().single();
    if (error) { toast('Could not save assignment', 'error'); return; }
    setAssignments((current) => [...current, data as ShootAssignment]);
    setAssignmentPartner('');
  };

  const removeAssignment = async (id: string) => {
    await supabase.from('shoot_assignments').delete().eq('id', id);
    setAssignments((current) => current.filter((item) => item.id !== id));
  };

  const sendDutySlip = () => {
    let phone = booking.client_mobile.replace(/\D/g, '');
    if (phone.length === 10) phone = `91${phone}`;
    const slip = assignments.map((assignment) => {
      const event = safeEvents.find((item) => item.name === assignment.function_name);
      const staff = partners.find((item) => item.id === assignment.partner_id);
      return `Function: ${assignment.function_name}\nDate: ${event?.date ? formatDate(event.date) : formatDate(booking.shoot_date)}\nReporting: ${assignment.reporting_time || event?.start_time || event?.time || '—'}\nVenue: ${event?.venue || booking.venue || '—'}\nAssigned Role: ${assignment.role}\nAssigned Staff: ${staff?.name || '—'}`;
    }).join('\n\n');
    const message = `*Shoot Duty Slip*\nClient: ${booking.client_name}\nHost Contact: ${booking.client_mobile}\n\n${slip || `Function: ${booking.event_function}\nDate: ${formatDate(booking.shoot_date)}\nReporting: ${booking.shoot_time || '—'}\nVenue: ${booking.venue || '—'}`}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const sendIndividualDutySlip = (assignment: ShootAssignment, staff: Partner) => {
    let phone = staff.mobile.replace(/\D/g, '');
    if (phone.length === 10) phone = `91${phone}`;
    const event = safeEvents.find((item) => item.name === assignment.function_name);
    const message = `*Shoot Duty Slip*\nClient: ${booking.client_name}\nHost Contact: ${booking.client_mobile}\nFunction: ${assignment.function_name}\nDate: ${event?.date ? formatDate(event.date) : formatDate(booking.shoot_date)}\nReporting Time: ${assignment.reporting_time || event?.start_time || event?.time || '—'}\nRole: ${assignment.role}\nVenue: ${event?.venue || booking.venue || '—'}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const sendWhatsApp = () => {
    let phone = booking.client_mobile.replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;
    const fnList = safeEvents.length > 0
      ? safeEvents.map((e) => {
          const label = e.name === 'Custom' && e.customName ? e.customName : e.name;
          return `${label} — ${formatDate(e.date)} ${e.time || ''}`;
        }).join('\n')
      : `${booking.event_function} — ${formatDate(booking.shoot_date)} ${booking.shoot_time || ''}`;
    const delivText = delivList.length > 0 ? delivList.join('\n') : 'None';
    const msg =
      `*${settings?.films_title ?? 'Bollywood Umang Films'}*\n` +
      `Booking: ${booking.booking_no}\n\n` +
      `*Client:* ${booking.client_name}\n` +
      `*Mobile:* ${booking.client_mobile}\n` +
      `*Venue:* ${booking.venue || '—'}\n\n` +
      `*Functions:*\n${fnList}\n\n` +
      `*Deliverables:*\n${delivText}\n\n` +
      `*Total Package:* ${formatINR(Number(booking.total_amount))}\n` +
      `*Discount:* ${formatINR(Number(booking.discount))}\n` +
      `*Advance Paid:* ${formatINR(Number(booking.advance_paid))}\n` +
      `*Balance Due:* ${formatINR(netDue)}\n\n` +
      `Thank you for choosing ${settings?.films_title ?? 'Bollywood Umang Films'}!`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyBillSummary = async () => {
    const text = buildBookingSummaryText(booking, settings, safeEvents, delivList);
    const ok = await copyToClipboard(text);
    toast(ok ? 'Bill summary copied to clipboard' : 'Failed to copy bill summary', ok ? 'success' : 'error');
  };

  const modalBody = (
    <div className="space-y-4">
      {/* Client info */}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><Phone className="h-4 w-4 text-slate-400" /> {booking.client_mobile}</div>
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><MapPin className="h-4 w-4 text-slate-400" /> {booking.venue || '—'}</div>
        <div className="text-sm text-slate-600 dark:text-slate-300">{booking.event_function} · {formatDate(booking.shoot_date)} {booking.shoot_time && `· ${booking.shoot_time}`}</div>
        <div className="text-sm text-slate-600 dark:text-slate-300">{booking.client_address || '—'}</div>
      </div>

      {/* Events timeline */}
      {safeEvents.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Functions Timeline</h3>
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2">Function</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {safeEvents.map((e, i) => {
                  const label = e.name === 'Custom' && e.customName ? e.customName : e.name;
                  return (
                    <tr key={i} className="border-t border-slate-100 dark:border-white/5">
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{label}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{formatDate(e.date)}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{e.time || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Operational duty roster; intentionally kept out of client-facing views. */}
      <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Duty Roster</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">Admin only</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <select value={assignmentFunction} onChange={(e) => setAssignmentFunction(e.target.value)} className={selectClass}>
            <option value="">Select function</option>
            {safeEvents.map((event, index) => <option key={`${event.name}-${index}`} value={event.name}>{event.name}</option>)}
          </select>
          <select value={assignmentPartner} onChange={(e) => setAssignmentPartner(e.target.value)} className={selectClass}>
            <option value="">Assign staff</option>
            {partners.filter((partner) => partner.status === 'Active' || partner.status === 'On Leave').map((partner) => <option key={partner.id} value={partner.id}>{partner.name}{partner.status === 'On Leave' ? ' · On Leave' : ''}</option>)}
          </select>
          <select value={assignmentRole} onChange={(e) => setAssignmentRole(e.target.value)} className={selectClass}>
            <option>Traditional Photo</option><option>Candid Photo</option><option>Traditional Video</option><option>Candid Video</option>
          </select>
          <div className="flex gap-2"><input type="time" value={reportingTime} onChange={(e) => setReportingTime(e.target.value)} className={`${inputClass} min-w-0`} /><button onClick={addAssignment} className="shrink-0 rounded-lg bg-amber-500 px-3 text-xs font-semibold text-slate-900">Assign</button></div>
        </div>
        {assignments.length > 0 && <div className="mt-3 space-y-2">{assignments.map((assignment) => { const partner = partners.find((item) => item.id === assignment.partner_id); return <div key={assignment.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/5"><span className="text-slate-700 dark:text-slate-200">{partner?.name ?? 'Assigned staff'} · {assignment.function_name} · {assignment.role}{assignment.reporting_time ? ` · Report ${assignment.reporting_time}` : ''}</span><div className="flex items-center gap-2">{partner && <button onClick={() => sendIndividualDutySlip(assignment, partner)} className="text-emerald-600 hover:text-emerald-500 dark:text-emerald-400" title="Share duty on WhatsApp"><MessageCircle className="h-3.5 w-3.5" /></button>}<button onClick={() => removeAssignment(assignment.id)} className="text-rose-500 hover:text-rose-400" title="Remove assignment"><Trash2 className="h-3.5 w-3.5" /></button></div></div>; })}</div>}
      </div>

      {/* Delivery Data */}
      {delivList.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Delivery Data</h3>
          <div className="flex flex-wrap gap-2">
            {delivList.map((d, i) => (
              <Badge key={i} color="emerald">{d}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Bill summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center dark:border-white/10 dark:bg-white/5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Package</p>
          <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">{formatINR(Number(booking.total_amount))}</p>
        </div>
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-center dark:border-sky-500/20 dark:bg-sky-500/5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Discount</p>
          <p className="mt-0.5 text-base font-bold text-sky-600 dark:text-sky-400">{formatINR(Number(booking.discount))}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center dark:border-emerald-500/20 dark:bg-emerald-500/5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Advance</p>
          <p className="mt-0.5 text-base font-bold text-emerald-600 dark:text-emerald-400">{formatINR(Number(booking.advance_paid))}</p>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-center dark:border-rose-500/20 dark:bg-rose-500/5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Due</p>
          <p className="mt-0.5 text-base font-bold text-rose-600 dark:text-rose-400">{formatINR(netDue)}</p>
        </div>
      </div>

      {/* Client Portal Access */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <Lock className="h-4 w-4 text-amber-500" /> Client Portal Access
        </h3>
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={toggleLoginAccess}
            className="flex items-center gap-2.5"
          >
            <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${loginAllowed ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${loginAllowed ? 'translate-x-6' : 'translate-x-1'}`} />
            </span>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {loginAllowed ? 'Portal Login Enabled' : 'Allow Portal Login'}
            </span>
            {loginAllowed ? (
              <Unlock className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Lock className="h-3.5 w-3.5 text-slate-400" />
            )}
          </button>

          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-800">
            <KeyRound className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-sm text-slate-600 dark:text-slate-300">
              Password: <span className="font-mono font-medium text-slate-900 dark:text-white">{showPassword ? currentPassword : '••••••••'}</span>
            </span>
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="text-slate-400 hover:text-amber-500"
              title={showPassword ? 'Hide password' : 'View password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <button
            onClick={resetPassword}
            className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset Password to Default
          </button>
        </div>
        {!loginAllowed && (
          <p className="mt-2 text-xs text-slate-400">This client cannot log into the portal until login is enabled above.</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap justify-end gap-3 pt-2">
        <button onClick={onDelete} className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 dark:border-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/10">
          <Trash2 className="h-4 w-4" /> Delete
        </button>
        <button onClick={onEdit} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">
          <Edit3 className="h-4 w-4" /> Edit
        </button>
        <button onClick={sendWhatsApp} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">
          <MessageCircle className="h-4 w-4" /> Send WhatsApp Bill
        </button>
        <button onClick={sendDutySlip} className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 px-4 py-2.5 text-sm font-medium text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10">
          <MessageCircle className="h-4 w-4" /> WhatsApp Duty Slip
        </button>
        <button onClick={copyBillSummary} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">
          <Copy className="h-4 w-4" /> Copy Bill Summary
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-amber-400">
          <Printer className="h-4 w-4" /> Print A4 Bill
        </button>
        <button onClick={() => setIsBillPreviewOpen(true)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">
          <Eye className="h-4 w-4" /> View Bill
        </button>
      </div>
    </div>
  );

  return (
    <>
      <Modal open={true} onClose={onClose} title={`${booking.booking_no} — ${booking.client_name}`} size="lg">
        {modalBody}
      </Modal>
      <BillPreviewModal booking={booking} settings={settings} open={isBillPreviewOpen} onClose={() => setIsBillPreviewOpen(false)} onDualPrint={() => { setIsDualPrintOpen(true); setTimeout(() => { window.print(); setIsDualPrintOpen(false); }, 100); }} />
      {isDualPrintOpen && createPortal(<div id="printable-bill-sheet"><PrintableDualCopies><BillInvoice booking={booking} settings={settings} /></PrintableDualCopies></div>, document.body)}
      {createPortal(
        <div id="printable-bill-sheet" aria-hidden>
          <BillInvoice booking={booking} settings={settings} />
        </div>,
        document.body,
      )}
    </>
  );
}

function BillPreviewModal({ booking, settings, open, onClose, onDualPrint }: { booking: Booking; settings: StudioSettings | null; open: boolean; onClose: () => void; onDualPrint: () => void }) {
  const previewId = `invoice-preview-${booking.id}`;
  const download = async () => {
    const element = document.getElementById(previewId);
    if (element) await downloadA4Pdf(element, buildPdfFilename(booking.client_name, booking.booking_no));
  };
  const copyPublicLink = async () => {
    const link = `${window.location.origin}/view/${booking.id}`;
    const copied = await copyToClipboard(link);
    window.alert(copied ? 'Public invoice link copied.' : 'Could not copy public invoice link.');
  };

  return (
    <Modal open={open} onClose={onClose} title="Invoice Preview" size="xl" dismissible={false}>
      <div id={previewId} className="bg-slate-950/80 p-2 sm:p-4">
        <BillInvoice booking={booking} settings={settings} />
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
        <button onClick={onClose} className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 dark:border-white/10 dark:text-slate-300">
          ✖ Close
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600">
          🖨️ Print Now
        </button>
        <button onClick={onDualPrint} className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600">
          🖨️ Print 2-in-1 (Half Cut / 2 Copies per A4)
        </button>
        <button onClick={download} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-400">
          <Download className="h-4 w-4" /> Download / Save
        </button>
        <button onClick={copyPublicLink} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <ExternalLink className="h-4 w-4" /> Copy Public Link
        </button>
      </div>
    </Modal>
  );
}

function buildBookingSummaryText(booking: Booking, settings: StudioSettings | null, safeEvents?: EventFunction[], delivList?: string[]): string {
  const ev = safeEvents ?? booking.events ?? [];
  const dl = delivList ?? formatDeliverablesList(booking.deliverables_data ?? DEFAULT_DELIVERABLES);
  const fnList = ev.length > 0
    ? ev.map((e) => {
        const label = e.name === 'Custom' && e.customName ? e.customName : e.name;
        const startTime = e.start_time ?? e.time;
        const time = startTime || e.end_time ? `${startTime || '—'} - ${e.end_time || '—'}` : '—';
        const venue = e.venue || booking.venue || '—';
        const dateShift = e.end_date_shift === 'next_date' ? ' (ends next date)' : '';
        return `  - ${label}: ${formatDate(e.date)}${dateShift}, ${time}, Venue: ${venue}`;
      }).join('\n')
    : `  - ${booking.event_function}: ${formatDate(booking.shoot_date)} ${booking.shoot_time || ''}`;
  const delivText = dl.length > 0 ? dl.map((d) => `  - ${d}`).join('\n') : '  None';
  return (
    `${settings?.films_title ?? 'Bollywood Umang Films'}\n` +
    `Booking: ${booking.booking_no}\n` +
    `Date: ${formatDate(booking.shoot_date)}\n\n` +
    `Client: ${booking.client_name}\n` +
    `Mobile: ${booking.client_mobile}\n` +
    `Address: ${booking.client_address || '—'}\n` +
    `Venue: ${booking.venue || '—'}\n` +
    `Status: ${booking.booking_status}\n\n` +
    `Functions:\n${fnList}\n\n` +
    `Delivery Data:\n${delivText}\n\n` +
    `Base Amount: ${formatINR(Number(booking.base_amount))}\n` +
    `Total Package: ${formatINR(Number(booking.total_amount))}\n` +
    `Discount: ${formatINR(Number(booking.discount))}\n` +
    `Advance Paid: ${formatINR(Number(booking.advance_paid))}\n` +
    `Balance Due: ${formatINR(Number(booking.net_due))}\n`
  );
}

function BookingSuccessModal({ booking, onClose, onView }: { booking: Booking; onClose: () => void; onView: () => void }) {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handlePrint = () => {
    setTimeout(() => window.print(), 300);
  };

  const handleWhatsApp = () => {
    let phone = booking.client_mobile.replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;
    const safeEvents = booking.events ?? [];
    const delivList = formatDeliverablesList(booking.deliverables_data ?? DEFAULT_DELIVERABLES);
    const fnList = safeEvents.length > 0
      ? safeEvents.map((e) => {
          const label = e.name === 'Custom' && e.customName ? e.customName : e.name;
          return `${label} — ${formatDate(e.date)} ${e.time || ''}`;
        }).join('\n')
      : `${booking.event_function} — ${formatDate(booking.shoot_date)} ${booking.shoot_time || ''}`;
    const msg =
      `*${settings?.films_title ?? 'Bollywood Umang Films'}*\n` +
      `Booking: ${booking.booking_no}\n\n` +
      `*Client:* ${booking.client_name}\n` +
      `*Mobile:* ${booking.client_mobile}\n` +
      `*Venue:* ${booking.venue || '—'}\n\n` +
      `*Functions:*\n${fnList}\n\n` +
      `*Deliverables:*\n${delivList.length > 0 ? delivList.join('\n') : 'None'}\n\n` +
      `*Total Package:* ${formatINR(Number(booking.total_amount))}\n` +
      `*Discount:* ${formatINR(Number(booking.discount))}\n` +
      `*Advance Paid:* ${formatINR(Number(booking.advance_paid))}\n` +
      `*Balance Due:* ${formatINR(Number(booking.net_due))}\n\n` +
      `Thank you for choosing ${settings?.films_title ?? 'Bollywood Umang Films'}!`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopySummary = async () => {
    const text = buildBookingSummaryText(booking, settings);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      toast('Bill summary copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast('Failed to copy bill summary', 'error');
    }
  };

  return (
    <Modal open={true} onClose={onClose} title="Saved Successfully!" size="md" dismissible={false}>
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/10">
            <CheckCircle2 className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Booking <span className="font-semibold text-slate-900 dark:text-white">{booking.booking_no}</span> for <span className="font-semibold text-slate-900 dark:text-white">{booking.client_name}</span> has been saved.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            onClick={onView}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            <Eye className="h-4 w-4" /> View Bill
          </button>
          <button
            onClick={handleWhatsApp}
            className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-amber-400"
          >
            <Printer className="h-4 w-4" /> Print A4 Bill
          </button>
          <button
            onClick={handleCopySummary}
            className="relative flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            <Copy className="h-4 w-4" /> Copy Bill Summary
            {copied && (
              <span className="absolute -top-2 right-2 rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">Copied!</span>
            )}
          </button>
        </div>

        <button
          onClick={onClose}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
        >
          <X className="h-4 w-4" /> Done / Close
        </button>
      </div>
    </Modal>
  );
}


