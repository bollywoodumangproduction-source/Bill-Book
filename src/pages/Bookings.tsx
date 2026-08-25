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
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type {
  Booking,
  EventFunction,
  BookingDeliverables,
  BookingAlbumRow,
  BookingVideoRow,
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
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useRefresh } from '@/context/RefreshContext';
import { DutyRoster } from '@/components/DutyRoster';

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
  const [view, setView] = useState<'bookings' | 'roster'>('bookings');

  const load = useCallback(async () => {
    const { data } = await supabase.from('bookings').select('*').order('shoot_date');
    setBookings((data ?? []) as Booking[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshToken]);

  const filtered = bookings.filter((b) => {
    const q = search.toLowerCase();
    return (b.client_name ?? '').toLowerCase().includes(q) || (b.event_function ?? '').toLowerCase().includes(q) || (b.booking_no ?? '').toLowerCase().includes(q);
  });

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from('bookings').delete().eq('id', deleteId);
    toast('Booking deleted', 'success');
    load();
  };

  const copyBookingSummary = async (b: Booking) => {
    const text = buildBookingSummaryText(b, settings);
    const ok = await copyToClipboard(text);
    toast(ok ? 'Bill summary copied to clipboard' : 'Failed to copy bill summary', ok ? 'success' : 'error');
  };

  return (
    <div className="space-y-5">
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

      <div className="flex gap-1 border-b border-slate-200 dark:border-white/10">
        {([['bookings', 'Bookings'], ['roster', 'Duty Roster']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${view === key ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'roster' ? <DutyRoster bookings={bookings} bookingsLoading={loading} /> : <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by client, event, or booking no..."
          className={`${inputClass} pl-10`}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Sparkles className="h-6 w-6 animate-pulse text-amber-500" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={CalendarPlus} title="No bookings found" subtitle="Create a new booking to get started" />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((b) => (
            <button
              key={b.id}
              onClick={() => setDetailBooking(b)}
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
                <p className="text-xs text-rose-500 dark:text-rose-400">{formatINR(Number(b.net_due))} due</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); copyBookingSummary(b); }}
                className="shrink-0 rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-amber-500 dark:hover:bg-white/10"
                title="Copy bill summary"
              >
                <Copy className="h-4 w-4" />
              </button>
              <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-amber-500 dark:group-hover:text-amber-400" />
            </button>
          ))}
        </div>
      )}
      </>}

      <BookingForm
        open={showForm}
        onClose={() => setShowForm(false)}
        editing={editing}
        onSaved={(saved: Booking) => { setShowForm(false); load(); setSuccessBooking(saved); toast('Saved Successfully!', 'success'); }}
      />

      {successBooking && (
        <ErrorBoundary>
          <BookingSuccessModal
            booking={successBooking}
            onClose={() => setSuccessBooking(null)}
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
            onDelete={() => { setDeleteId(detailBooking.id); setDetailBooking(null); }}
          />
        </ErrorBoundary>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Booking"
        message="This will permanently delete the booking. This cannot be undone."
        confirmLabel="Delete"
        danger
      />
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
  deliverables: BookingDeliverables;
  baseAmount: string;
  totalAmount: string;
  discount: string;
  advancePaid: string;
}

function BookingForm({ open, onClose, editing, onSaved }: { open: boolean; onClose: () => void; editing: Booking | null; onSaved: (saved: Booking) => void }) {
  const { toast } = useToast();
  const draftKey = editing ? `booking-edit-${editing.id}` : 'booking-new';

  const [clientName, setClientName] = useDraftState<string>(`${draftKey}-clientName`, '');
  const [clientMobile, setClientMobile] = useDraftState<string>(`${draftKey}-clientMobile`, '');
  const [clientAddress, setClientAddress] = useDraftState<string>(`${draftKey}-clientAddress`, '');
  const [venue, setVenue] = useDraftState<string>(`${draftKey}-venue`, '');
  const [bookingStatus, setBookingStatus] = useDraftState<string>(`${draftKey}-bookingStatus`, 'CONFIRMED');
  const [events, setEvents] = useDraftState<EventFunction[]>(`${draftKey}-events`, []);
  const [albumRows, setAlbumRows] = useDraftState<BookingAlbumRow[]>(`${draftKey}-albumRows`, []);
  const [videoRows, setVideoRows] = useDraftState<BookingVideoRow[]>(`${draftKey}-videoRows`, []);
  const [deliverables, setDeliverables] = useDraftState<BookingDeliverables>(`${draftKey}-deliverables`, { ...DEFAULT_DELIVERABLES });
  const [baseAmount, setBaseAmount] = useDraftState<string>(`${draftKey}-baseAmount`, '');
  const [totalAmount, setTotalAmount] = useDraftState<string>(`${draftKey}-totalAmount`, '');
  const [discount, setDiscount] = useDraftState<string>(`${draftKey}-discount`, '');
  const [advancePaid, setAdvancePaid] = useDraftState<string>(`${draftKey}-advancePaid`, '');

  const clearDraft = () => {
    setClientName('');
    setClientMobile('');
    setClientAddress('');
    setVenue('');
    setBookingStatus('CONFIRMED');
    setEvents([]);
    setAlbumRows([]);
    setVideoRows([]);
    setDeliverables({ ...DEFAULT_DELIVERABLES });
    setBaseAmount('');
    setTotalAmount('');
    setDiscount('');
    setAdvancePaid('');
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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const addEvent = () => {
    setEvents([...events, { name: 'Haldi', date: '', time: '' }]);
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

  const toggleDeliverable = (key: 'raw_video' | 'raw_selected_photos' | 'raw_all_photos' | 'raw_edited_photos') => {
    setDeliverables((d) => ({ ...d, [key]: !d[key] }));
  };

  const lineItemsTotal = useMemo(() => {
    const albumTotal = albumRows.reduce((s, r) => s + computeAlbumTotal(r), 0);
    const videoTotal = videoRows.reduce((s, r) => s + computeVideoTotal(r), 0);
    return albumTotal + videoTotal;
  }, [albumRows, videoRows]);

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
    if (isSubmitting) return;
    if (!clientName || !clientMobile) { toast('Name and mobile are required', 'error'); return; }
    setIsSubmitting(true);
    const { data: existing } = await supabase.from('bookings').select('*');
    const payload = {
      booking_no: editing?.booking_no ?? nextBookingNo((existing ?? []) as Booking[]),
      client_name: clientName,
      client_mobile: clientMobile,
      client_address: clientAddress,
      event_function: eventFunctionLabel,
      events,
      shoot_date: primaryDate,
      shoot_time: primaryTime,
      venue,
      booking_status: bookingStatus,
      total_amount: totalAmountNum,
      discount: toNum(discount),
      advance_paid: toNum(advancePaid),
      deliverables_data: { ...deliverables, album_rows: albumRows, video_rows: videoRows },
      base_amount: toNum(baseAmount),
      is_login_allowed: editing?.is_login_allowed ?? false,
      client_password: editing?.client_password ?? clientMobile,
      password_changed: editing?.password_changed ?? false,
    };
    let savedBooking: Booking | null = null;
    if (editing) {
      const { data } = await supabase.from('bookings').update(payload).eq('id', editing.id).select().single();
      savedBooking = data as Booking | null;
    } else {
      const { data } = await supabase.from('bookings').insert(payload).select().single();
      savedBooking = data as Booking | null;
    }
    clearDraft();
    setIsSubmitting(false);
    if (savedBooking) onSaved(savedBooking);
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
            <Field label="Client Address">
              <input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} className={inputClass} placeholder="Client address" />
            </Field>
            <Field label="Event Address">
              <input value={venue} onChange={(e) => setVenue(e.target.value)} className={inputClass} placeholder="Event / venue address" />
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
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2.5 dark:border-white/5 dark:bg-white/5">
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
                  <input type="date" value={e.date} onChange={(ev) => updateEvent(i, { date: ev.target.value })} className={`${inputClass} shrink-0`} />
                  <input type="time" value={e.time} onChange={(ev) => updateEvent(i, { time: ev.target.value })} className={`${inputClass} w-28 shrink-0`} />
                  <button onClick={() => removeEvent(i)} className="shrink-0 rounded p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
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

        {/* 5. DELIVERY DATA */}
        <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Delivery Data</h3>
          <div className="flex flex-wrap gap-4">
            <DeliverableCheckbox label="Raw Video" checked={!!deliverables.raw_video} onChange={() => toggleDeliverable('raw_video')} />
            <DeliverableCheckbox label="Selected Photos" checked={!!deliverables.raw_selected_photos} onChange={() => toggleDeliverable('raw_selected_photos')} />
            <DeliverableCheckbox label="All Photos" checked={!!deliverables.raw_all_photos} onChange={() => toggleDeliverable('raw_all_photos')} />
            <DeliverableCheckbox label="Finished / Edited Photos" checked={!!deliverables.raw_edited_photos} onChange={() => toggleDeliverable('raw_edited_photos')} />
          </div>
        </div>

        {/* 6. BILLING SUMMARY */}
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
                onChange={(e) => setAdvancePaid(e.target.value)}
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

        {/* Footer Actions */}
        <div className="flex justify-end gap-3 pt-1">
          <button onClick={handleClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
          <button
            onClick={handleSave}
            disabled={isSubmitting}
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
  const netDue = Number(booking.net_due ?? 0);
  const delivList = formatDeliverablesList(safeDeliverables);
  const [showPassword, setShowPassword] = useState(false);
  const [loginAllowed, setLoginAllowed] = useState(booking.is_login_allowed ?? false);
  const [currentPassword, setCurrentPassword] = useState(booking.client_password ?? booking.client_mobile);
  const [showBillPreview, setShowBillPreview] = useState(false);

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
        <button onClick={() => setShowBillPreview(true)} className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-700">
          <Eye className="h-4 w-4" /> View Bill
        </button>
        <button onClick={sendWhatsApp} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">
          <MessageCircle className="h-4 w-4" /> Send WhatsApp Bill
        </button>
        <button onClick={copyBillSummary} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">
          <Copy className="h-4 w-4" /> Copy Bill Summary
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-amber-400">
          <Printer className="h-4 w-4" /> Print A4 Bill
        </button>
      </div>
    </div>
  );

  return (
    <>
      <Modal open={true} onClose={onClose} title={`${booking.booking_no} — ${booking.client_name}`} size="lg">
        {modalBody}
      </Modal>
      <Modal open={showBillPreview} onClose={() => setShowBillPreview(false)} title={`Bill Preview — ${booking.booking_no}`} size="xl">
        <div className="-m-5 bg-slate-100 p-3 dark:bg-slate-950 sm:p-5">
          <BillInvoice booking={booking} settings={settings} />
          <div className="no-print mt-4 flex justify-end gap-3">
            <button onClick={() => setShowBillPreview(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5">
              Close
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-amber-400">
              <Printer className="h-4 w-4" /> Print Bill
            </button>
          </div>
        </div>
      </Modal>
      {createPortal(
        <div id="printable-bill-sheet" aria-hidden>
          <BillInvoice booking={booking} settings={settings} />
        </div>,
        document.body,
      )}
    </>
  );
}

function buildBookingSummaryText(booking: Booking, settings: StudioSettings | null, safeEvents?: EventFunction[], delivList?: string[]): string {
  const ev = safeEvents ?? booking.events ?? [];
  const dl = delivList ?? formatDeliverablesList(booking.deliverables_data ?? DEFAULT_DELIVERABLES);
  const fnList = ev.length > 0
    ? ev.map((e) => {
        const label = e.name === 'Custom' && e.customName ? e.customName : e.name;
        return `  - ${label}: ${formatDate(e.date)} ${e.time || ''}`;
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

function BookingSuccessModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [showBillPreview, setShowBillPreview] = useState(false);

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
            onClick={() => setShowBillPreview(true)}
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
      <Modal open={showBillPreview} onClose={() => setShowBillPreview(false)} title={`Bill Preview — ${booking.booking_no}`} size="xl" dismissible={false}>
        <div className="-m-5 bg-slate-100 p-3 dark:bg-slate-950 sm:p-5">
          <BillInvoice booking={booking} settings={settings} />
          <div className="no-print mt-4 flex justify-end gap-3">
            <button onClick={() => setShowBillPreview(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5">
              Close Preview
            </button>
            <button onClick={handlePrint} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-amber-400">
              <Printer className="h-4 w-4" /> Print A4 Bill
            </button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}


