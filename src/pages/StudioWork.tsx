import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, Sparkles, Clapperboard, CreditCard as Edit3, Trash2, Truck, MessageCircle, Eye, X, Archive, Video, Book, User, Phone, MapPin, Printer, Copy, CircleCheck as CheckCircle2, Download, FileText, Wallet, TriangleAlert as AlertTriangle, Zap, CalendarClock, Images, HardDrive } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { StudioLabOrder, VideoRow, AlbumRow, PaperRow, LabClientRow, StudioSettings, Partner, LabPaymentInstallment, LabClientDeliveryStatus, LabClientDispatchMode, StorageLocation } from '@/lib/types';
import { formatINR, formatDate, todayISO, defaultPinFromPhone } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import { useDraftState } from '@/lib/useDraftState';
import {
  LAB_VIDEO_TYPES,
  LAB_VIDEO_QUALITIES,
  LAB_ALBUM_TYPES,
  LAB_ALBUM_SIZES,
  LAB_ALBUM_PAPERS,
  LAB_ALBUM_COVERS,
  LAB_ORDER_STATUSES,
  DELIVERY_MODES,
  LAB_PAYMENT_MODES,
  STORAGE_DEVICES,
  STORAGE_DRIVES,
  STORAGE_WORK_TYPES,
} from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { copyToClipboard } from '@/lib/clipboard';
import type { ClientSelectionSession } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MasterPinDialog } from '@/components/ui/MasterPinDialog';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useRefresh } from '@/context/RefreshContext';
import { buildPdfFilename, downloadA4Pdf, PrintableDualCopies } from '@/lib/pdf';

const STATUS_COLORS: Record<string, 'amber' | 'emerald' | 'sky' | 'slate'> = {
  Pending: 'slate',
  'In Design': 'amber',
  'Printed/Ready': 'sky',
  Processing: 'amber',
  Ready: 'sky',
  Delivered: 'emerald',
};

const DEFAULT_PRODUCTION_TERMS = `1. रॉ डाटा बैकअप व सुरक्षा (Raw Data Backup): जब तक तैयार प्रोजेक्ट/डाटा आपको नहीं मिल जाता, तब तक रॉ फुटेज की एक बैकअप कॉपी अपने पास सुरक्षित रखें।
2. एल्बम डिजाइन व प्रिंट अप्रूवल (Album Approval): एल्बम प्रिंटिंग से पूर्व डिजाइन अप्रूवल अनिवार्य है। शीट प्रिंट होने के बाद किसी भी प्रकार का स्पेलिंग या फोटो बदलाव नहीं होगा।
3. सॉन्ग सिलेक्शन व एडिटिंग (Songs Selection & Re-edits): टीज़र/हाइलाइट्स व वेडिंग के लिए मनपसंद गाने काम शुरू होने से पूर्व देना अनिवार्य है। प्रोजेक्ट फाइनल रेंडर के बाद कोई बदलाव नहीं किया जाएगा।
4. अग्रिम भुगतान (50% Advance Mandatory): प्रोडक्शन से जुड़े किसी भी कार्य के कुल मूल्य का 50% राशि एडवांस जमा करना अनिवार्य होगा, अन्यथा काम को आगे नहीं बढ़ाया जाएगा।
5. डिलीवरी व पूर्ण भुगतान (Final Delivery & Due Settlement): तैयार मास्टर वीडियो / पेन ड्राइव / एल्बम प्राप्त करने से पूर्व शेष बकाया राशि (Net Final Due) का पूर्ण भुगतान करना अनिवार्य है।`;

const toNum = (v: string | number | undefined) => { const n = Number(v); return isNaN(n) ? 0 : n; };

function getDatabaseErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function sanitizePayload<T>(payload: T): T {
  return JSON.parse(JSON.stringify(payload)) as T;
}

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

function getOrderKey(order: Partial<StudioLabOrder> | null | undefined): string {
  return String(order?.id ?? order?.order_no ?? (order as any)?.bup_no ?? '').trim();
}

function nextOrderNo(existing: StudioLabOrder[]): string {
  const realOrders = existing.filter((o) => {
    const value = String(o.order_no ?? '');
    return !o.isDemo && !o.is_demo && !value.startsWith('DEMO-') && !value.startsWith('demo-') && /^BUP-\d{3}$/i.test(value);
  });
  const max = realOrders.reduce((m, o) => {
    const n = parseInt(String(o.order_no).replace(/\D/g, ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `BUP-${String(max + 1).padStart(3, '0')}`;
}

function computeRowTotal(r: { qty: number; rate: number }): number {
  return (toNum(r.qty) || 0) * (toNum(r.rate) || 0);
}

function computeClientVideoTotal(rows: VideoRow[]): number {
  return rows.reduce((s, r) => s + computeRowTotal(r), 0);
}
function computeAlbumTotal(r: AlbumRow): number {
  return toNum(r.packaging_total) + toNum(r.mini_total) + r.papers.reduce((s, p) => s + toNum(p.total), 0);
}
function computeClientAlbumTotal(rows: AlbumRow[]): number {
  return rows.reduce((s, r) => s + computeAlbumTotal(r), 0);
}

const EMPTY_VIDEO_ROW: VideoRow = { video_type: '', quality: '', qty: 0, rate: 0, total: 0 };
const EMPTY_ALBUM_ROW: AlbumRow = { id: uid(), album_type: '', size: '', packaging: '', packaging_rate: 0, packaging_total: 0, mini_album: false, mini_qty: 0, mini_rate: 0, mini_total: 0, papers: [{ id: uid(), paper_type: '', sheets: 0, rate: 0, total: 0 }], total: 0 };
const EMPTY_PAPER_ROW: PaperRow = { id: uid(), paper_type: '', sheets: 0, rate: 0, total: 0 };

const EMPTY_STORAGE_LOCATION: StorageLocation = { id: '', device: '', drive: '', work: '', client_name: '' };

function buildStoragePath(loc: StorageLocation, studioOrProject: string): string {
  const parts = [loc.device, loc.drive, loc.work, studioOrProject, loc.client_name].filter(Boolean);
  return parts.join(' / ');
}

function emptyClient(): LabClientRow {
  return { id: uid(), client_name: '', event_address: '', video_rows: [], album_rows: [], video_total: 0, album_total: 0, delivery_status: 'In Design', dispatch_mode: 'By Hand' };
}

function hasAlbumWork(order: Partial<StudioLabOrder>): boolean {
  return toNum(order.total_album_bill) > 0 || (Array.isArray(order.album_rows) && order.album_rows.length > 0);
}

function hasVideoWork(order: Partial<StudioLabOrder>): boolean {
  return toNum(order.total_video_bill) > 0 || (Array.isArray(order.video_rows) && order.video_rows.length > 0);
}

function normalizeLabOrder(raw: Partial<StudioLabOrder>): StudioLabOrder {
  const clients = (Array.isArray(raw.clients) ? raw.clients : []).map((client) => ({
    ...emptyClient(),
    ...client,
    delivery_status: client.delivery_status ?? 'In Design',
    dispatch_mode: client.dispatch_mode ?? 'By Hand',
    video_rows: Array.isArray(client.video_rows) ? client.video_rows : [],
    album_rows: (Array.isArray(client.album_rows) ? client.album_rows : []).map((album) => ({
      ...EMPTY_ALBUM_ROW,
      ...album,
      papers: Array.isArray(album.papers) ? album.papers : [],
    })),
  }));
  return {
    ...raw,
    id: raw.id ?? '',
    order_no: raw.order_no ?? '',
    partner_id: raw.partner_id ?? null,
    partner_name: raw.partner_name ?? '',
    studio_name: raw.studio_name ?? '',
    studio_mobile: raw.studio_mobile ?? '',
    studio_address: raw.studio_address ?? '',
    project_name: raw.project_name ?? '',
    work_type: raw.work_type ?? '',
    clients,
    total_album_bill: raw.total_album_bill ?? 0,
    total_video_bill: raw.total_video_bill ?? 0,
    current_order_total: raw.current_order_total ?? 0,
    previous_back_due: raw.previous_back_due ?? 0,
    master_total: raw.master_total ?? 0,
    advance_paid: raw.advance_paid ?? 0,
    net_final_due: raw.net_final_due ?? 0,
    payment_mode: raw.payment_mode ?? '',
    payment_date: raw.payment_date ?? '',
    payment_note: raw.payment_note ?? '',
    order_status: raw.order_status ?? 'Pending',
    album_status: raw.album_status || (hasAlbumWork(raw) && raw.order_status !== 'Pending' ? raw.order_status : 'Pending'),
    video_status: raw.video_status || (hasVideoWork(raw) && raw.order_status !== 'Pending' ? raw.order_status : 'Pending'),
    delivery_mode: raw.delivery_mode ?? 'By Hand',
    parcel_tracking_details: raw.parcel_tracking_details ?? '',
    video_rows: Array.isArray(raw.video_rows) ? raw.video_rows : [],
    album_rows: Array.isArray(raw.album_rows) ? raw.album_rows : [],
    access_pin: raw.access_pin ?? '',
    pin_changed: raw.pin_changed ?? false,
    is_login_allowed: raw.is_login_allowed ?? false,
    is_emergency: raw.is_emergency ?? false,
    album_required_date: raw.album_required_date ?? '',
    video_delivery_date: raw.video_delivery_date ?? '',
    date_pending: raw.date_pending ?? false,
    storage_locations: Array.isArray(raw.storage_locations) ? raw.storage_locations : [],
    created_at: raw.created_at ?? '',
  } as StudioLabOrder;
}

function getEarliestDeadline(o: StudioLabOrder): string | null {
  if (o.date_pending) return null;
  const dates: string[] = [];
  if (o.album_required_date) dates.push(o.album_required_date);
  if (o.video_delivery_date) dates.push(o.video_delivery_date);
  if (dates.length === 0) return null;
  return dates.sort()[0];
}

function isDeadlineUrgent(o: StudioLabOrder, deadlineAlerts: Array<{ type: 'album' | 'video'; severity: 'overdue' | 'today' | 'soon'; order: StudioLabOrder }>): boolean {
  return deadlineAlerts.some(a => a.order.id === o.id && (a.severity === 'overdue' || a.severity === 'today'));
}

const DELIVERED_STATUSES = ['Delivered'];

function sortOrdersByPriority(orders: StudioLabOrder[], deadlineAlerts: Array<{ type: 'album' | 'video'; severity: 'overdue' | 'today' | 'soon'; order: StudioLabOrder }>): StudioLabOrder[] {
  return [...orders].sort((a, b) => {
    const aDelivered = DELIVERED_STATUSES.includes(a.order_status);
    const bDelivered = DELIVERED_STATUSES.includes(b.order_status);
    if (aDelivered !== bDelivered) return aDelivered ? 1 : -1;
    if (a.is_emergency !== b.is_emergency) return a.is_emergency ? -1 : 1;
    const aPending = !!a.date_pending;
    const bPending = !!b.date_pending;
    const aDeadline = getEarliestDeadline(a);
    const bDeadline = getEarliestDeadline(b);
    if (!aPending && !bPending && aDeadline && bDeadline) return aDeadline.localeCompare(bDeadline);
    if (!aPending && aDeadline && bPending) return -1;
    if (aPending && !bPending && bDeadline) return 1;
    return 0;
  });
}

export function LabOrders() {
  const { toast } = useToast();
  const { settings } = useSettings();
  const { refreshToken } = useRefresh();
  const [orders, setOrders] = useState<StudioLabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'station' | 'partners'>('station');
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<StudioLabOrder | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<StudioLabOrder | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewBillOrder, setViewBillOrder] = useState<StudioLabOrder | null>(null);
  const [printOrder, setPrintOrder] = useState<StudioLabOrder | null>(null);
  const [successOrder, setSuccessOrder] = useState<StudioLabOrder | null>(null);
  const [settleOrder, setSettleOrder] = useState<StudioLabOrder | null>(null);
  const [viewSlipOrder, setViewSlipOrder] = useState<StudioLabOrder | null>(null);
  const [dualPrintOrder, setDualPrintOrder] = useState<StudioLabOrder | null>(null);
  const [quickPayOrder, setQuickPayOrder] = useState<StudioLabOrder | null>(null);
  const [view, setView] = useState<'active' | 'archived' | 'recycle'>('active');
  const [showPin, setShowPin] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<'soft' | 'permanent'>('soft');
  const [photoSessions, setPhotoSessions] = useState<Record<string, ClientSelectionSession | null>>({});

  const loadPhotoSessions = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('photo_selection_sessions').select('*');
      if (error) throw error;
      const map: Record<string, ClientSelectionSession | null> = {};
      for (const row of (data ?? []) as ClientSelectionSession[]) {
        if (row.billId) { (map as any)[row.billId] = row; }
      }
      setPhotoSessions(map);
    } catch (error) {
      toast(getDatabaseErrorMessage(error), 'error');
    }
  }, [toast]);

  useEffect(() => { void loadPhotoSessions(); }, [loadPhotoSessions, refreshToken]);

  const handlePhotoSelectionAction = async (o: StudioLabOrder) => {
    const billId = o.order_no;
    if (!billId) { toast('Order number missing', 'error'); return; }
    const session = photoSessions[billId];
    if (session) {
      const ok = await copyToClipboard(session.shareableUrl);
      toast(ok ? `Selection link copied — PIN: ${session.pinCode}` : 'Could not copy link', ok ? 'success' : 'error');
    } else {
      toast('No photo selection session found for this order. Create one in the Photo Selection page.', 'info');
    }
  };

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('studio_lab_orders').select('*').order('created_at');
      if (error) throw error;
      const allNormalized = (data ?? []).map((order: Partial<StudioLabOrder>, index: number) => {
        const base = normalizeLabOrder(order);
        const candidateId = String(base.id || base.order_no || (order as any)?.bup_no || '').trim();
        return { ...base, id: candidateId || `BUP-${index + 1}` } as StudioLabOrder;
      });
      // If real (non-demo) orders exist, hide demo orders to prevent duplicate/phantom cards
      const hasRealOrders = allNormalized.some((o: StudioLabOrder) => !o.isDemo && !o.is_demo && !String(o.order_no ?? '').startsWith('DEMO-') && !String(o.id ?? '').startsWith('demo-'));
      const visibleOrders = hasRealOrders
        ? allNormalized.filter((o: StudioLabOrder) => !o.isDemo && !o.is_demo && !String(o.order_no ?? '').startsWith('DEMO-') && !String(o.id ?? '').startsWith('demo-'))
        : allNormalized;
      setOrders(visibleOrders);
    } catch (error) {
      toast(getDatabaseErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load, refreshToken]);

  const filtered = orders.filter((o) => {
    const q = search.toLowerCase();
    const matchSearch = (o.studio_name ?? '').toLowerCase().includes(q) || (o.project_name ?? '').toLowerCase().includes(q) || (o.order_no ?? '').toLowerCase().includes(q) || (o.partner_name ?? '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || o.order_status === statusFilter;
    const lifecycleMatch = view === 'recycle' ? !!o.deleted_at : view === 'archived' ? !!o.archived_at && !o.deleted_at : !o.archived_at && !o.deleted_at;
    return lifecycleMatch && matchSearch && matchStatus;
  });

  const ordersByPartner = useMemo(() => {
    const groups = new Map<string, { studioName: string; partnerName: string; orders: StudioLabOrder[] }>();
    for (const order of orders) {
      const key = String(order.partner_id ?? order.partner_name ?? order.studio_name ?? 'unassigned').trim() || 'unassigned';
      const studioName = (order.studio_name || order.partner_name || 'Unassigned Studio').trim() || 'Unassigned Studio';
      const partnerName = (order.partner_name || 'Unassigned Partner').trim() || 'Unassigned Partner';
      const group = groups.get(key) ?? { studioName, partnerName, orders: [] };
      group.orders.push(order);
      groups.set(key, group);
    }
    return Array.from(groups.entries()).sort(([, a], [, b]) => a.studioName.localeCompare(b.studioName));
  }, [orders]);

  const selectedPartnerGroup = selectedPartner ? ordersByPartner.find(([key]) => key === selectedPartner)?.[1] : null;

  // Deadline alerts
  const deadlineAlerts = useMemo(() => {
    const today = todayISO();
    const todayMs = new Date(today + 'T00:00:00').getTime();
    const fiveDayMs = 5 * 24 * 60 * 60 * 1000;
    const alerts: Array<{ type: 'album' | 'video'; severity: 'overdue' | 'today' | 'soon'; order: StudioLabOrder; date: string }> = [];
    for (const o of orders) {
      if (o.archived_at || o.deleted_at || o.order_status === 'Delivered') continue;
      if (o.album_required_date) {
        const dMs = new Date(o.album_required_date + 'T00:00:00').getTime();
        const diff = dMs - todayMs;
        if (diff < 0) alerts.push({ type: 'album', severity: 'overdue', order: o, date: o.album_required_date });
        else if (diff === 0) alerts.push({ type: 'album', severity: 'today', order: o, date: o.album_required_date });
        else if (diff <= fiveDayMs) alerts.push({ type: 'album', severity: 'soon', order: o, date: o.album_required_date });
      }
      if (o.video_delivery_date) {
        const dMs = new Date(o.video_delivery_date + 'T00:00:00').getTime();
        const diff = dMs - todayMs;
        if (diff < 0) alerts.push({ type: 'video', severity: 'overdue', order: o, date: o.video_delivery_date });
        else if (diff === 0) alerts.push({ type: 'video', severity: 'today', order: o, date: o.video_delivery_date });
        else if (diff <= fiveDayMs) alerts.push({ type: 'video', severity: 'soon', order: o, date: o.video_delivery_date });
      }
    }
    // Sort: emergency first, then overdue, today, soon
    const severityOrder = { overdue: 0, today: 1, soon: 2 };
    alerts.sort((a, b) => {
      if (a.order.is_emergency !== b.order.is_emergency) return a.order.is_emergency ? -1 : 1;
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
    return alerts;
  }, [orders]);

  const liveStationItems = sortOrdersByPriority(filtered, deadlineAlerts).flatMap((order) => [
    ...(hasAlbumWork(order) && order.album_status !== 'Pending' ? [{ order, workType: 'album' as const }] : []),
    ...(hasVideoWork(order) && order.video_status !== 'Pending' ? [{ order, workType: 'video' as const }] : []),
  ]);

  const handleArchiveOrder = async (orderIdOrNo: string) => {
    const targetKey = String(orderIdOrNo ?? '').trim();
    if (!targetKey) return;
    const targetOrder = orders.find((item) => getOrderKey(item) === targetKey) ?? null;
    if (!targetOrder) return;
    try {
      const archivedAt = new Date().toISOString();
      const isDemo = !targetOrder.id || String(targetOrder.id).startsWith('DEMO-') || String(targetOrder.id).startsWith('demo-');
      const { error } = !isDemo && targetOrder.id
        ? await supabase.from('studio_lab_orders').update({ archived_at: archivedAt, deleted_at: null }).eq('id', targetOrder.id)
        : await supabase.from('studio_lab_orders').update({ archived_at: archivedAt, deleted_at: null }).eq('order_no', targetOrder.order_no);
      if (error) throw error;
      setOrders((prev) => prev.map((item) => (getOrderKey(item) === targetKey ? { ...item, archived_at: archivedAt, deleted_at: null } : item)));
      toast('Order archived', 'success');
      setDeleteId(null); setShowPin(false);
    } catch (error) {
      toast(getDatabaseErrorMessage(error), 'error');
    }
  };

  const handleDeleteOrder = async (orderIdOrNo: string) => {
    const targetKey = String(orderIdOrNo ?? '').trim();
    if (!targetKey) return;
    const targetOrder = orders.find((item) => getOrderKey(item) === targetKey) ?? null;
    if (!targetOrder) return;

    try {
      const deletedAt = new Date().toISOString();
      const isDemo = !targetOrder.id || String(targetOrder.id).startsWith('DEMO-') || String(targetOrder.id).startsWith('demo-');
      const { error } = !isDemo && targetOrder.id
        ? await supabase.from('studio_lab_orders').update({ deleted_at: deletedAt, archived_at: null }).eq('id', targetOrder.id)
        : await supabase.from('studio_lab_orders').update({ deleted_at: deletedAt, archived_at: null }).eq('order_no', targetOrder.order_no);
      if (error) throw error;
      setOrders((prev) => prev.map((item) => (getOrderKey(item) === targetKey ? { ...item, deleted_at: deletedAt, archived_at: null } : item)));
      toast('Order moved to Recycle Bin', 'success');
      setDeleteId(null); setShowPin(false);
    } catch (error) {
      toast(getDatabaseErrorMessage(error), 'error');
    }
  };

  const handleRestoreOrder = async (orderIdOrNo: string) => {
    const targetKey = String(orderIdOrNo ?? '').trim();
    if (!targetKey) return;
    const targetOrder = orders.find((item) => getOrderKey(item) === targetKey) ?? null;
    if (!targetOrder) return;

    try {
      const isDemo = !targetOrder.id || String(targetOrder.id).startsWith('DEMO-') || String(targetOrder.id).startsWith('demo-');
      const { error } = !isDemo && targetOrder.id
        ? await supabase.from('studio_lab_orders').update({ archived_at: null, deleted_at: null }).eq('id', targetOrder.id)
        : await supabase.from('studio_lab_orders').update({ archived_at: null, deleted_at: null }).eq('order_no', targetOrder.order_no);
      if (error) throw error;
      setOrders((prev) => prev.map((item) => (getOrderKey(item) === targetKey ? { ...item, archived_at: null, deleted_at: null } : item)));
      toast('Order restored to Active', 'success');
    } catch (error) {
      toast(getDatabaseErrorMessage(error), 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await handleDeleteOrder(deleteId);
  };

  const restoreOrder = async (id: string) => { await handleRestoreOrder(id); };
  const permanentlyDeleteOrder = async () => {
    if (!deleteId) return;
    const targetKey = String(deleteId ?? '').trim();
    if (!targetKey) return;
    const targetOrder = orders.find((item) => getOrderKey(item) === targetKey) ?? null;
    if (!targetOrder) return;

    try {
      const isDemo = !targetOrder.id || String(targetOrder.id).startsWith('DEMO-') || String(targetOrder.id).startsWith('demo-');
      const { error } = !isDemo && targetOrder.id
        ? await supabase.from('studio_lab_orders').delete().eq('id', targetOrder.id)
        : await supabase.from('studio_lab_orders').delete().eq('order_no', targetOrder.order_no);
      if (error) throw error;
      setOrders((prev) => prev.filter((item) => getOrderKey(item) !== targetKey));
      toast('Order permanently deleted', 'success');
      setDeleteId(null); setShowPin(false);
    } catch (error) {
      toast(getDatabaseErrorMessage(error), 'error');
    }
  };

  const copyOrderSummary = async (o: StudioLabOrder) => {
    const text = buildLabOrderSummaryText(o, settings);
    const ok = await copyToClipboard(text);
    toast(ok ? 'Bill summary copied to clipboard' : 'Failed to copy bill summary', ok ? 'success' : 'error');
  };

  const handleWorkStationToggle = async (workType: 'album' | 'video') => {
    if (!selectedOrder) return;
    try {
      const statusField = workType === 'album' ? 'album_status' : 'video_status';
      const currentStatus = selectedOrder[statusField] ?? 'Pending';
      const nextStatus = currentStatus !== 'Pending' ? 'Pending' : 'Processing';
      const isDemo = !selectedOrder.id || String(selectedOrder.id).startsWith('DEMO-') || String(selectedOrder.id).startsWith('demo-');
      const result = isDemo
        ? await supabase.from('studio_lab_orders').update({ [statusField]: nextStatus }).eq('order_no', selectedOrder.order_no)
        : await supabase.from('studio_lab_orders').update({ [statusField]: nextStatus }).eq('id', selectedOrder.id);
      if (result.error) throw result.error;
      const updatedOrder = { ...selectedOrder, [statusField]: nextStatus };
      setSelectedOrder(updatedOrder);
      setOrders((prev) => prev.map((order) => (getOrderKey(order) === getOrderKey(selectedOrder) ? { ...order, [statusField]: nextStatus } : order)));
      toast(`${workType === 'album' ? 'Album' : 'Video'} ${nextStatus === 'Processing' ? 'sent to Live Station' : 'moved back to Pending'}`, 'success');
    } catch (error) {
      toast(getDatabaseErrorMessage(error), 'error');
    }
  };

  const renderOrderCard = (o: StudioLabOrder, stationWork?: 'album' | 'video') => {
    const clientCount = (o.clients ?? []).length;
    const totalVideo = toNum(o.total_video_bill);
    const totalAlbum = toNum(o.total_album_bill);
    return (
      <div key={`${o.id}-${stationWork ?? 'order'}`} className={`rounded-xl border bg-white p-3 dark:bg-slate-900/50 ${o.is_emergency ? 'border-rose-300 dark:border-rose-500/40 ring-1 ring-rose-200 dark:ring-rose-500/20' : 'border-slate-200 dark:border-white/10'}`}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {o.is_emergency && <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white"><Zap className="h-2.5 w-2.5" />EMERGENCY</span>}
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{o.project_name}</p>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{o.order_no}</p>
          </div>
          {view === 'recycle' && <span className="text-[11px] text-amber-600 dark:text-amber-400">Expires in {recycleDaysRemaining(o.deleted_at)} days</span>}
          <div className="flex gap-1.5">
            <button onClick={() => { setEditing(o); setShowForm(true); }} className="rounded-md p-2 text-slate-400 transition-colors hover:bg-zinc-700 hover:text-amber-400" title="Edit order">
              <Edit3 className="h-4 w-4" />
            </button>
            <button onClick={() => handleArchiveOrder(getOrderKey(o))} className="rounded-md p-2 text-slate-400 transition-colors hover:bg-zinc-700 hover:text-amber-400" title="Archive order">
              <Archive className="h-4 w-4" />
            </button>
            <button onClick={() => { const key = getOrderKey(o); if (!key) return; setDeleteId(key); setPendingDelete('soft'); setShowPin(true); }} className="rounded-md p-2 text-slate-400 transition-colors hover:bg-zinc-700 hover:text-rose-400" title="Delete order">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {stationWork && <Badge color="amber">{stationWork === 'album' ? 'Album' : 'Video'} Live</Badge>}
          <Badge color={STATUS_COLORS[o.order_status] ?? 'slate'}>{o.order_status}</Badge>
          <Badge color="slate">{o.delivery_mode}</Badge>
          {o.promised_delivery_date && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400">
              <CalendarClock className="h-2.5 w-2.5" /> Promised: {formatDate(o.promised_delivery_date)}
            </span>
          )}
          {(() => {
            const allClients = o.clients ?? [];
            const deliveredCount = allClients.filter((c) => c.delivery_status === 'Delivered').length;
            const total = allClients.length;
            if (total > 0) {
              if (deliveredCount === total) {
                return <Badge color="emerald">Delivered</Badge>;
              } else if (deliveredCount > 0) {
                return <Badge color="amber">Partially Delivered ({deliveredCount}/{total})</Badge>;
              }
            }
            return null;
          })()}
        </div>
        <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">{o.studio_name} · {o.studio_mobile}</p>
        {o.partner_name && (
          <p className="mb-1 text-xs text-amber-600 dark:text-amber-400">Partner: {o.partner_name}</p>
        )}
        {(o.is_emergency || o.date_pending || o.album_required_date || o.video_delivery_date) && (
          <div className="mb-1 flex flex-wrap gap-2 text-[11px]">
            {o.is_emergency && <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white"><Zap className="h-2.5 w-2.5" />EMERGENCY</span>}
            {o.date_pending ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"><CalendarClock className="h-2.5 w-2.5" />Date Pending</span>
            ) : (() => {
              const earliest = getEarliestDeadline(o);
              if (!earliest) return null;
              const isUrgent = isDeadlineUrgent(o, deadlineAlerts);
              return (
                <span className={`flex items-center gap-0.5 ${isUrgent ? 'text-rose-500 dark:text-rose-400 font-medium' : 'text-slate-500 dark:text-slate-400'}`}><CalendarClock className="h-3 w-3" /> Due: {formatDate(earliest)}</span>
              );
            })()}
          </div>
        )}
        {o.parcel_tracking_details && (
          <p className="mb-2 flex items-center gap-1 text-xs text-sky-500 dark:text-sky-400">
            <Truck className="h-3 w-3" /> {o.parcel_tracking_details}
          </p>
        )}
        {o.storage_locations && o.storage_locations.length > 0 && (
          <div className="mb-2 space-y-0.5">
            {o.storage_locations.map((loc) => {
              const studioOrProject = o.studio_name || o.project_name || '';
              return (
                <p key={loc.id} className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <HardDrive className="h-3 w-3 shrink-0" /> {buildStoragePath(loc, studioOrProject)}
                </p>
              );
            })}
          </div>
        )}
        {o.order_no && photoSessions[o.order_no] && (
          <a
            href={photoSessions[o.order_no]!.shareableUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-2 flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-500 dark:text-amber-400"
          >
            <Images className="h-3 w-3" /> Photo Selection: {photoSessions[o.order_no]!.photos.filter((p) => p.selected).length}/{photoSessions[o.order_no]!.photos.length} selected{photoSessions[o.order_no]!.isLocked ? ' · Locked' : ''}
          </a>
        )}
          {clientCount > 0 && (
          <div className="mb-2 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            <p>Users: {clientCount}</p>
            {totalVideo > 0 && (!stationWork || stationWork === 'video') && <p>Video Bill: {formatINR(totalVideo)}</p>}
            {totalAlbum > 0 && (!stationWork || stationWork === 'album') && <p>Album Bill: {formatINR(totalAlbum)}</p>}
          </div>
        )}
        <div className="border-t border-slate-100 pt-2 dark:border-white/5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Order Total</span>
            <span className="font-medium text-slate-900 dark:text-white">{formatINR(toNum(o.current_order_total))}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Back Due</span>
            <span className="text-rose-500 dark:text-rose-400">{formatINR(toNum(o.previous_back_due))}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Advance Paid</span>
            <span className="text-emerald-500 dark:text-emerald-400">{formatINR(toNum(o.advance_paid))}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-slate-100 pt-1 dark:border-white/5">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Net Due</span>
            <span className={`text-sm font-bold ${toNum(o.net_final_due) > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
              {formatINR(toNum(o.net_final_due))}
            </span>
          </div>
        </div>
        {view !== 'active' && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => handleRestoreOrder(getOrderKey(o))} className="rounded-lg border border-emerald-500/30 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">Restore</button>
            {view === 'recycle' && <button onClick={() => { const key = getOrderKey(o); if (!key) return; setDeleteId(key); setPendingDelete('permanent'); setShowPin(true); }} className="rounded-lg border border-rose-500/30 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">Delete Forever</button>}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => setSettleOrder(o)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Settle Balance
          </button>
          <button
            onClick={() => setQuickPayOrder(o)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/20"
          >
            <Plus className="h-3.5 w-3.5" /> + Pay
          </button>
          <button
            onClick={() => { setViewBillOrder(o); }}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-white/5"
            title="View Bill"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setViewSlipOrder(o); }}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-white/5"
            title="View Slip"
          >
            <FileText className="h-4 w-4" />
          </button>
          <button
            onClick={() => { sendLabWhatsApp(o, settings); }}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-white/5"
            title="WhatsApp"
          >
            <MessageCircle className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  const renderWorkToggle = (workType: 'album' | 'video') => {
    if (!selectedOrder) return null;
    const statusField = workType === 'album' ? 'album_status' : 'video_status';
    const isLive = selectedOrder[statusField] !== 'Pending';
    const label = workType === 'album' ? 'Album' : 'Video';
    return (
      <button
        key={workType}
        type="button"
        onClick={() => handleWorkStationToggle(workType)}
        className="flex cursor-pointer items-center gap-3 rounded-full border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm transition-colors hover:bg-zinc-700"
        aria-pressed={isLive}
      >
        <span className={isLive ? 'text-green-400' : 'text-zinc-400'}>{isLive ? `${label} on Station` : `Send ${label} Live`}</span>
        <span className={`h-6 w-12 rounded-full p-1 transition-colors duration-200 ease-in-out ${isLive ? 'bg-green-500' : 'bg-zinc-600'}`} aria-hidden="true">
          <span className={`block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ease-in-out ${isLive ? 'translate-x-6' : 'translate-x-0'}`} />
        </span>
      </button>
    );
  };

  return (
    <div className="w-full flex flex-col relative">
      <div className="sticky top-0 z-30 w-full mt-0 bg-[#0B1121]/90 backdrop-blur-md py-2 px-4 shadow-md flex flex-col md:flex-row justify-between items-center">
        <div>
          <h1 className="whitespace-nowrap text-lg font-bold text-white md:text-xl">Lab Order Form</h1>
          <p className="text-xs text-slate-400">Photolab & Media Production Order Sheet</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('station')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${activeTab === 'station' ? 'bg-amber-500 text-slate-900' : 'border border-slate-200 dark:border-white/10 dark:text-slate-300'}`}
          >
            🛠️ On Live Station
          </button>
          <button
            onClick={() => setActiveTab('partners')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${activeTab === 'partners' ? 'bg-amber-500 text-slate-900' : 'border border-slate-200 dark:border-white/10 dark:text-slate-300'}`}
          >
            👥 Partner Folders
          </button>
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-slate-900 transition-colors hover:bg-amber-400"
          >
            <Plus className="h-4 w-4" /> New Order
          </button>
        </div>
      </div>

      <div className="-mt-2 w-full space-y-3 rounded-xl border border-gray-800 p-2 md:p-3">
        {activeTab === 'station' ? <>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by studio, partner, project, or order no..."
                className={`${inputClass} pl-10`}
              />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${selectClass} sm:w-auto`}>
              <option value="all">All Statuses</option>
              {LAB_ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex gap-2"><button onClick={() => setView('active')} className={`rounded-lg px-3 py-2 text-xs font-medium ${view === 'active' ? 'bg-amber-500 text-slate-900' : 'border border-slate-200 dark:border-white/10 dark:text-slate-300'}`}>Active</button><button onClick={() => setView('archived')} className={`rounded-lg px-3 py-2 text-xs font-medium ${view === 'archived' ? 'bg-amber-500 text-slate-900' : 'border border-slate-200 dark:border-white/10 dark:text-slate-300'}`}>Archived</button><button onClick={() => setView('recycle')} className={`rounded-lg px-3 py-2 text-xs font-medium ${view === 'recycle' ? 'bg-amber-500 text-slate-900' : 'border border-slate-200 dark:border-white/10 dark:text-slate-300'}`}>Recycle Bin</button></div>

          {loading ? (
            <div className="flex justify-center py-20"><Sparkles className="h-6 w-6 animate-pulse text-amber-500" /></div>
          ) : liveStationItems.length === 0 ? (
            <EmptyState icon={Clapperboard} title="No lab orders found" subtitle="Create a new lab order to get started" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-2">
              {liveStationItems.map(({ order, workType }) => renderOrderCard(order, workType))}
            </div>
          )}
        </> : (
          <div className="space-y-3">
            {selectedPartner ? (
              <>
                <button
                  type="button"
                  onClick={() => { setSelectedOrder(null); setSelectedPartner(null); }}
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
                >
                  🔙 Back to Partners
                </button>
                {selectedOrder ? (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setSelectedOrder(null)}
                      className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
                    >
                      🔙 Back to Client List
                    </button>
                    {renderOrderCard(selectedOrder)}
                    <div className="flex flex-wrap gap-3">
                      {hasAlbumWork(selectedOrder) && renderWorkToggle('album')}
                      {hasVideoWork(selectedOrder) && renderWorkToggle('video')}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-2">
                    {(selectedPartnerGroup?.orders ?? []).map((order) => {
                      const partyName = order.project_name || order.clients?.map((client) => client.client_name).filter(Boolean).join(', ') || 'Untitled Project';
                      const deliveryDate = order.promised_delivery_date || order.album_required_date || order.video_delivery_date;
                      return (
                        <button
                          key={order.id}
                          type="button"
                          onClick={() => setSelectedOrder(order)}
                          className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-3 text-left transition-colors hover:border-amber-500/60 hover:bg-zinc-800"
                        >
                          <p className="mb-2 truncate text-sm font-semibold text-zinc-100">{partyName}</p>
                          <div className="space-y-1.5 text-xs text-zinc-400">
                            <div className="flex justify-between gap-3"><span>Delivery Date</span><span className="text-right text-zinc-200">{deliveryDate ? formatDate(deliveryDate) : 'Not set'}</span></div>
                            <div className="flex justify-between gap-3"><span>Master Total</span><span className="text-right text-zinc-200">{formatINR(toNum(order.master_total))}</span></div>
                            <div className="flex justify-between gap-3"><span>Advance Paid</span><span className="text-right text-emerald-400">{formatINR(toNum(order.advance_paid))}</span></div>
                            <div className="flex justify-between gap-3 border-t border-zinc-700 pt-1.5"><span>Net Final Due</span><span className="text-right font-semibold text-amber-400">{formatINR(toNum(order.net_final_due))}</span></div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-2">
                {ordersByPartner.map(([key, group]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedPartner(key)}
                    className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-3 text-left transition-colors hover:border-amber-500/60 hover:bg-zinc-800"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xl" aria-hidden="true">📁</span>
                      <span className="rounded-full bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-400">{group.orders.length} orders</span>
                    </div>
                    <p className="truncate text-sm font-semibold text-zinc-100">{group.studioName}</p>
                    <p className="mt-1 truncate text-xs text-zinc-400">{group.partnerName}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ErrorBoundary>
        <LabOrderForm open={showForm} onClose={() => setShowForm(false)} editing={editing} existing={orders} onSaved={(saved) => { setShowForm(false); load(); setSuccessOrder(saved); toast('Saved Successfully!', 'success'); }} />
      </ErrorBoundary>
      <ErrorBoundary>
        <ViewBillModal order={viewBillOrder} onClose={() => setViewBillOrder(null)} settings={settings} onCopySummary={copyOrderSummary} />
      </ErrorBoundary>
      <LabWorkSlipModal order={viewSlipOrder} onClose={() => setViewSlipOrder(null)} settings={settings} onDualPrint={() => { if (viewSlipOrder) { setDualPrintOrder(viewSlipOrder); setTimeout(() => { window.print(); setDualPrintOrder(null); }, 100); } }} />
      {dualPrintOrder && createPortal(<div id="printable-bill-sheet"><PrintableDualCopies><LabOrderPrintTemplate order={dualPrintOrder} settings={settings} compact /></PrintableDualCopies></div>, document.body)}
      {settleOrder && <LabSettlementModal order={settleOrder} onClose={() => setSettleOrder(null)} onSaved={(updated) => { setSettleOrder(null); setOrders((prev) => prev.map((order) => (getOrderKey(order) === getOrderKey(updated) ? updated : order))); setSelectedOrder((current) => current && getOrderKey(current) === getOrderKey(updated) ? updated : current); load(); }} />}
      {quickPayOrder && <LabQuickPayModal order={quickPayOrder} onClose={() => setQuickPayOrder(null)} onSaved={(updated) => { setQuickPayOrder(null); setOrders((prev) => prev.map((order) => (getOrderKey(order) === getOrderKey(updated) ? updated : order))); setSelectedOrder((current) => current && getOrderKey(current) === getOrderKey(updated) ? updated : current); load(); }} />}
      {successOrder && (
        <ErrorBoundary>
          <LabOrderSuccessModal
            order={successOrder}
            onClose={() => setSuccessOrder(null)}
            onView={() => { setViewBillOrder(successOrder); setSuccessOrder(null); }}
          />
        </ErrorBoundary>
      )}
      {createPortal(
        <div id="printable-bill-sheet" aria-hidden>
          {(printOrder || successOrder) && <LabOrderPrintTemplate order={(printOrder || successOrder)!} settings={settings} />}
        </div>,
        document.body,
      )}
      {printOrder && <PrintTrigger order={printOrder} onDone={() => setPrintOrder(null)} />}
      <ConfirmDialog
        open={false}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Order"
        message="This will permanently delete the lab order. This cannot be undone."
        confirmLabel="Delete"
        danger
      />
      <MasterPinDialog open={showPin} settings={settings} onClose={() => { setShowPin(false); setDeleteId(null); }} onVerified={() => { if (pendingDelete === 'permanent') permanentlyDeleteOrder(); else handleDelete(); }} />
    </div>
  );
}

function sendLabWhatsApp(o: StudioLabOrder, settings: StudioSettings | null) {
  let phone = (o.studio_mobile ?? '').replace(/\D/g, '');
  if (phone.length === 10) phone = '91' + phone;
  const clientNames = (o.clients ?? []).map((c) => c.client_name || '—').join(', ');
  const msg =
    `*${settings?.production_title ?? 'Bollywood Umang Production'}*\n` +
    `Bill No: ${o.order_no}\n` +
    `Studio: ${o.studio_name}\n` +
    (o.partner_name ? `Partner: ${o.partner_name}\n` : '') +
    `Clients: ${clientNames || '—'}\n\n` +
    `Current Bill: ${formatINR(toNum(o.current_order_total))}\n` +
    `Back Due: ${formatINR(toNum(o.previous_back_due))}\n` +
    `Master Total: ${formatINR(toNum(o.master_total))}\n` +
    `Advance Paid: ${formatINR(toNum(o.advance_paid))}\n` +
    `Balance Due: ${formatINR(toNum(o.net_final_due))}\n\n` +
    (o.payment_mode ? `Payment: ${o.payment_mode}${o.payment_note ? ` (${o.payment_note})` : ''}\n` : '') +
    `Status: ${o.order_status} · Delivery: ${o.delivery_mode}` +
    (o.parcel_tracking_details ? `\nTracking: ${o.parcel_tracking_details}` : '') +
    `\n\nThank you — ${settings?.production_title ?? 'Bollywood Umang Production'}`;
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function sanitizeLabOrderFilenamePart(value: string): string {
  return (value || 'Document').trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Document';
}

function buildLabOrderDocumentFilename(order: StudioLabOrder): string {
  const orderNo = sanitizeLabOrderFilenamePart(order.order_no || 'Order');
  const labPartner = sanitizeLabOrderFilenamePart(order.partner_name || order.studio_name || 'Partner');
  const projectName = sanitizeLabOrderFilenamePart(order.project_name || (order.clients ?? []).map((client) => client.client_name).filter(Boolean).join('-') || 'Project');
  return `${orderNo}_${labPartner}_${projectName}.pdf`;
}

function getStoredLabTerms(): string {
  if (typeof window === 'undefined') return DEFAULT_PRODUCTION_TERMS;
  try {
    const saved = window.localStorage.getItem('lab_terms_conditions');
    return saved && saved.trim() ? saved : DEFAULT_PRODUCTION_TERMS;
  } catch {
    return DEFAULT_PRODUCTION_TERMS;
  }
}

function LabDigitalStamp({ order }: { order: StudioLabOrder }) {
  const isFullyPaid = Number(order.net_final_due ?? order.net_due ?? 0) <= 0;
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const fill = isFullyPaid ? 'bg-emerald-50 border-emerald-600 text-emerald-700' : 'bg-amber-50 border-sky-600 text-sky-700';
  const statusText = isFullyPaid ? 'PAID' : 'CONFIRMED';
  const title = isFullyPaid
    ? 'BOLLYWOOD UMANG PRODUCTION • FULLY PAID & VERIFIED • KAMTAUL / DARBHANGA'
    : 'BOLLYWOOD UMANG PRODUCTION • AUTHORIZED LAB SLIP • CONFIRMED';

  return (
    <div className={`flex items-center justify-center ${isFullyPaid ? 'text-emerald-700' : 'text-sky-700'}`}>
      <div className={`relative flex h-32 w-32 items-center justify-center rounded-full border-[3px] p-3 text-center shadow-inner ${fill}`}>
        <div className="absolute inset-2 rounded-full border border-current/70" />
        <div className="absolute inset-x-3 top-4 text-[7px] font-bold uppercase leading-tight tracking-[0.12em]">{title}</div>
        <div className="absolute inset-x-0 bottom-8 text-center text-[18px] font-black tracking-widest">{statusText}</div>
        <div className="absolute inset-x-0 bottom-2 text-center text-[8px] font-semibold uppercase tracking-[0.12em]">{today}</div>
      </div>
    </div>
  );
}

function ViewBillModal({ order, onClose, settings, onCopySummary }: { order: StudioLabOrder | null; onClose: () => void; settings: StudioSettings | null; onCopySummary: (o: StudioLabOrder) => void }) {
  const { toast } = useToast();
  const { triggerRefresh } = useRefresh();
  const [paymentHistory, setPaymentHistory] = useState<LabPaymentInstallment[]>([]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [printPreview, setPrintPreview] = useState(false);
  const [showStamp, setShowStamp] = useState(true);
  const [termsText, setTermsText] = useState(getStoredLabTerms());
  const [editingTerms, setEditingTerms] = useState(false);
  const printId = `lab-bill-print-${order?.id ?? 'preview'}`;
  const exportFilename = order ? buildLabOrderDocumentFilename(order) : 'lab-order.pdf';
  useEffect(() => {
    if (!order) return;
    setPaymentHistory(order.payment_history ?? (order.advance_paid ? [{ id: uid(), amount: toNum(order.advance_paid), payment_date: order.payment_date || '', payment_mode: order.payment_mode || 'Cash', note: order.payment_note || 'Existing payment' }] : []));
  }, [order]);
  useEffect(() => {
    try { window.localStorage.setItem('lab_terms_conditions', termsText); } catch { /* noop */ }
  }, [termsText]);
  if (!order) return null;

  const clients = (order.clients ?? []).map((client) => ({
    ...emptyClient(),
    ...client,
    delivery_status: client.delivery_status ?? 'In Design',
    dispatch_mode: client.dispatch_mode ?? 'By Hand',
    video_rows: Array.isArray(client.video_rows) ? client.video_rows : [],
    album_rows: (Array.isArray(client.album_rows) ? client.album_rows : []).map((album) => ({ ...EMPTY_ALBUM_ROW, ...album, papers: Array.isArray(album.papers) ? album.papers : [] })),
  }));
  const totalPaid = paymentHistory.reduce((sum, payment) => sum + toNum(payment.amount), 0);
  const labDue = toNum(order.master_total) - totalPaid;

  const recordPayment = async () => {
    const amount = toNum(paymentAmount);
    if (amount <= 0) return;
    const payment: LabPaymentInstallment = { id: uid(), amount, payment_date: paymentDate, payment_mode: paymentMode, note: paymentNote };
    const nextHistory = [...paymentHistory, payment];
    try {
      const { error } = await supabase.from('studio_lab_orders').update({ payment_history: nextHistory, advance_paid: totalPaid + amount, net_final_due: toNum(order.master_total) - totalPaid - amount, payment_mode: paymentMode, payment_date: paymentDate, payment_note: paymentNote }).eq('id', order.id);
      if (error) throw error;
      setPaymentHistory(nextHistory);
      setPaymentAmount('');
      setPaymentNote('');
      toast('Payment saved instantly!', 'success');
    } catch (error) {
      toast(getDatabaseErrorMessage(error), 'error');
    }
  };

  const handlePrintA4 = () => {
    setPrintPreview(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrintPreview(false), 400);
    }, 120);
  };

  const handleDownloadPdf = async () => {
    setPrintPreview(true);
    setTimeout(async () => {
      const element = document.getElementById(printId);
      if (element) {
        await downloadA4Pdf(element, exportFilename);
      }
      setPrintPreview(false);
    }, 120);
  };

  return (
    <Modal open={!!order} onClose={onClose} title={`Bill — ${order.order_no}`} size="xl" dismissible>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 pb-3 dark:border-white/10">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{settings?.production_title ?? 'Bollywood Umang Production'}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{settings?.production_subtitle ?? ''}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{settings?.address ?? ''}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Bill No: {order.order_no}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Date: {formatDate(order.created_at)}</p>
          </div>
        </div>

        {/* Partner / Studio info */}
        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          {order.partner_name && (
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <User className="h-3.5 w-3.5 text-amber-500" /> Partner: {order.partner_name}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            <span className="font-medium">Studio:</span> {order.studio_name}
          </div>
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            <Phone className="h-3.5 w-3.5 text-amber-500" /> {order.studio_mobile}
          </div>
          {order.studio_address && (
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <MapPin className="h-3.5 w-3.5 text-amber-500" /> {order.studio_address}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            <span className="font-medium">Project:</span> {order.project_name}
          </div>
        </div>

        {/* Per-client tables */}
        {clients.map((c, ci) => (
          <div key={c.id} className="rounded-lg border border-slate-200 p-3 dark:border-white/10">
            <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
              Client {ci + 1}: {c.client_name || '—'}
              {c.event_address ? <span className="ml-2 text-xs font-normal text-slate-400">({c.event_address})</span> : ''}
            </h3>
            {c.video_rows.length > 0 && (
              <div className="mb-2">
                <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Video Items</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-400 dark:border-white/10">
                      <th className="py-1">Type</th>
                      <th className="py-1">Quality</th>
                      <th className="py-1 text-right">Qty</th>
                      <th className="py-1 text-right">Rate</th>
                      <th className="py-1 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.video_rows.map((v, vi) => (
                      <tr key={vi} className="border-b border-slate-100 dark:border-white/5">
                        <td className="py-1 text-slate-700 dark:text-slate-300">{v.video_type}</td>
                        <td className="py-1 text-slate-500 dark:text-slate-400">{v.quality}</td>
                        <td className="py-1 text-right text-slate-700 dark:text-slate-300">{v.qty}</td>
                        <td className="py-1 text-right text-slate-700 dark:text-slate-300">{formatINR(toNum(v.rate))}</td>
                        <td className="py-1 text-right font-medium text-slate-900 dark:text-white">{formatINR(computeRowTotal(v))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-right text-xs font-medium text-slate-600 dark:text-slate-400">Video Subtotal: {formatINR(computeClientVideoTotal(c.video_rows))}</p>
              </div>
            )}
            {c.album_rows.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Album Items</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-400 dark:border-white/10">
                      <th className="py-1">Item / Description</th>
                      <th className="py-1 text-right">Sheets / Qty</th>
                      <th className="py-1 text-right">Rate</th>
                      <th className="py-1 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.album_rows.map((a, ai) => (
                      <Fragment key={ai}>
                        <tr className="border-b border-slate-100 dark:border-white/5">
                          <td className="py-1 text-slate-700 dark:text-slate-300">{a.album_type} ({a.size}) - {a.packaging}</td>
                          <td className="py-1 text-right text-slate-700 dark:text-slate-300">1</td>
                          <td className="py-1 text-right text-slate-700 dark:text-slate-300">{formatINR(toNum(a.packaging_rate))}</td>
                          <td className="py-1 text-right font-medium text-slate-900 dark:text-white">{formatINR(toNum(a.packaging_total))}</td>
                        </tr>
                        {a.mini_album && (
                          <tr className="border-b border-slate-100 dark:border-white/5">
                            <td className="py-1 pl-4 text-slate-500 dark:text-slate-400">↳ Mini Album</td>
                            <td className="py-1 text-right text-slate-700 dark:text-slate-300">{a.mini_qty}</td>
                            <td className="py-1 text-right text-slate-700 dark:text-slate-300">{formatINR(toNum(a.mini_rate))}</td>
                            <td className="py-1 text-right font-medium text-slate-900 dark:text-white">{formatINR(toNum(a.mini_total))}</td>
                          </tr>
                        )}
                        {a.papers.map((p, pi) => p.paper_type && (
                          <tr key={pi} className="border-b border-slate-100 dark:border-white/5">
                            <td className="py-1 pl-4 text-slate-500 dark:text-slate-400">↳ {p.paper_type} Paper</td>
                            <td className="py-1 text-right text-slate-700 dark:text-slate-300">{p.sheets}</td>
                            <td className="py-1 text-right text-slate-700 dark:text-slate-300">{formatINR(toNum(p.rate))}</td>
                            <td className="py-1 text-right font-medium text-slate-900 dark:text-white">{formatINR(toNum(p.total))}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-right text-xs font-medium text-slate-600 dark:text-slate-400">Album Subtotal: {formatINR(computeClientAlbumTotal(c.album_rows))}</p>
              </div>
            )}
          </div>
        ))}

        {/* Summary */}
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Total Video Bill</span><span className="font-medium text-slate-900 dark:text-white">{formatINR(toNum(order.total_video_bill))}</span></div>
            <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Total Album Bill</span><span className="font-medium text-slate-900 dark:text-white">{formatINR(toNum(order.total_album_bill))}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1 dark:border-white/10"><span className="text-slate-500 dark:text-slate-400">Current Order Total</span><span className="font-semibold text-slate-900 dark:text-white">{formatINR(toNum(order.current_order_total))}</span></div>
            <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Back Due</span><span className="text-rose-500 dark:text-rose-400">{formatINR(toNum(order.previous_back_due))}</span></div>
            <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Master Total</span><span className="font-semibold text-slate-900 dark:text-white">{formatINR(toNum(order.master_total))}</span></div>
            <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Advance Paid</span><span className="text-emerald-500 dark:text-emerald-400">{formatINR(totalPaid)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1 dark:border-white/10"><span className="font-semibold text-slate-700 dark:text-slate-300">Net Final Due</span><span className={`font-bold ${labDue > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-500 dark:text-emerald-400'}`}>{formatINR(labDue)}</span></div>
          </div>
        </div>

        {/* Payment info */}
        {(order.payment_mode || order.payment_date || order.payment_note) && (
          <div className="rounded-lg border border-slate-200 p-3 text-xs dark:border-white/10">
            <p className="mb-1 font-medium text-slate-700 dark:text-slate-300">Payment Details</p>
            {order.payment_mode && <p className="text-slate-500 dark:text-slate-400">Mode: {order.payment_mode}</p>}
            {order.payment_date && <p className="text-slate-500 dark:text-slate-400">Date: {formatDate(order.payment_date)}</p>}
            {order.payment_note && <p className="text-slate-500 dark:text-slate-400">Note: {order.payment_note}</p>}
          </div>
        )}

        <div className="border-t border-slate-200 pt-3 dark:border-white/10">
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Payment History</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <input type="number" min={0} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className={inputClass} placeholder="Amount Paid (₹)" />
            <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} />
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={selectClass}><option>Cash</option><option>UPI</option><option>Bank</option></select>
            <input value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} className={inputClass} placeholder="Custom Note" />
          </div>
          <button onClick={recordPayment} className="mt-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600">Record Installment</button>
          {paymentHistory.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-xs"><thead><tr className="border-b border-slate-200 text-left text-slate-400 dark:border-white/10"><th className="px-2 py-1">Date</th><th className="px-2 py-1">Mode</th><th className="px-2 py-1">Note</th><th className="px-2 py-1 text-right">Amount</th><th className="px-2 py-1 text-right">Running Due</th></tr></thead><tbody>{(() => { let runningPaid = 0; return paymentHistory.map((payment) => { runningPaid += toNum(payment.amount); return <tr key={payment.id} className="border-b border-slate-100 dark:border-white/5"><td className="px-2 py-1">{formatDate(payment.payment_date)}</td><td className="px-2 py-1">{payment.payment_mode}</td><td className="px-2 py-1">{payment.note || '—'}</td><td className="px-2 py-1 text-right text-emerald-600">{formatINR(toNum(payment.amount))}</td><td className="px-2 py-1 text-right">{formatINR(toNum(order.master_total) - runningPaid)}</td></tr>; }); })()}</tbody></table></div>}
        </div>

        <div className="border-t border-slate-200 pt-3 dark:border-white/10">
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Lab Partner Khata Breakdown</h3>
          <div className="space-y-2 text-xs">
            {(order.album_rows ?? []).length > 0 && <div className="rounded-lg border border-slate-200 p-2 dark:border-white/10"><p className="font-semibold text-amber-600 dark:text-amber-400">Album Designing &amp; Printing</p>{order.album_rows.map((row, index) => <p key={index} className="text-slate-500 dark:text-slate-400">{row.album_type || 'Album'} · {row.size} · {row.papers.reduce((sum, paper) => sum + toNum(paper.sheets), 0)} sheets · {row.packaging || 'Cover'} · {formatINR(computeAlbumTotal(row))}</p>)}</div>}
            {(order.video_rows ?? []).length > 0 && <div className="rounded-lg border border-slate-200 p-2 dark:border-white/10"><p className="font-semibold text-amber-600 dark:text-amber-400">Video Editing</p>{order.video_rows.map((row, index) => <p key={index} className="text-slate-500 dark:text-slate-400">{row.video_type || 'Video Edit'} · {row.quality} · Qty {row.qty} · {formatINR(computeRowTotal(row))}</p>)}</div>}
            {(order.album_rows ?? []).length === 0 && (order.video_rows ?? []).length === 0 && <p className="text-slate-400">No itemized work recorded.</p>}
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4 dark:border-white/10">
          <div className="mb-4 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">File: {exportFilename}</span>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setShowStamp((value) => !value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-white/10 dark:text-slate-300">{showStamp ? 'Stamp On' : 'Stamp Off'}</button>
              <button type="button" onClick={() => setEditingTerms((value) => !value)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-white/10 dark:text-slate-300"><Edit3 className="h-3.5 w-3.5" /> Edit Terms</button>
            </div>
          </div>
          {editingTerms && (
            <div className="mb-4 rounded-xl border border-slate-200 p-3 dark:border-white/10">
              <textarea value={termsText} onChange={(e) => setTermsText(e.target.value)} rows={8} className="w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200" />
              <div className="mt-2 flex justify-end">
                <button type="button" onClick={() => setEditingTerms(false)} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white">Save Terms</button>
              </div>
            </div>
          )}
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => sendLabWhatsApp(order, settings)} className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"><MessageCircle className="h-4 w-4" /> Send on WhatsApp</button>
              <button onClick={handleDownloadPdf} className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"><Download className="h-4 w-4" /> Download PDF</button>
              <button onClick={handlePrintA4} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-400">Print A4</button>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => onCopySummary(order)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">
              <Copy className="h-4 w-4" /> Copy Bill Summary
            </button>
            <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Close</button>
          </div>
        </div>
        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Terms & Conditions</p>
              <div className="whitespace-pre-line text-xs leading-5 text-slate-600 dark:text-slate-300">{termsText || DEFAULT_PRODUCTION_TERMS}</div>
            </div>
            {showStamp && <LabDigitalStamp order={order} />}
          </div>
        </div>
      </div>
      {printPreview && createPortal(
        <div id={printId} aria-hidden>
          <LabOrderPrintTemplate order={order} settings={settings} termsText={termsText} />
        </div>,
        document.body,
      )}
    </Modal>
  );
}

function LabWorkSlipModal({ order, onClose, settings, onDualPrint }: { order: StudioLabOrder | null; onClose: () => void; settings: StudioSettings | null; onDualPrint?: () => void }) {
  if (!order) return null;
  const slipId = `lab-slip-${order.id}`;
  const exportFilename = buildLabOrderDocumentFilename(order);
  const [printPreview, setPrintPreview] = useState(false);
  const [showStamp, setShowStamp] = useState(true);
  const [termsText, setTermsText] = useState(getStoredLabTerms());
  const [editingTerms, setEditingTerms] = useState(false);
  const download = async () => {
    setPrintPreview(true);
    setTimeout(async () => {
      const element = document.getElementById(slipId);
      if (element) await downloadA4Pdf(element, exportFilename);
      setPrintPreview(false);
    }, 120);
  };
  useEffect(() => {
    try { window.localStorage.setItem('lab_terms_conditions', termsText); } catch { /* noop */ }
  }, [termsText]);
  const albumRows = (order.clients ?? []).flatMap((client) => client.album_rows ?? []);
  const videoRows = (order.clients ?? []).flatMap((client) => client.video_rows ?? []);
  const shareSlip = () => {
    let phone = (order.studio_mobile ?? '').replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;
    const albums = albumRows.map((row) => `Album: ${row.album_type || 'Album'} | Size: ${row.size || '—'} | Sheets: ${row.papers.reduce((sum, paper) => sum + toNum(paper.sheets), 0)} | Paper: ${row.papers.map((paper) => paper.paper_type).filter(Boolean).join(', ') || '—'} | Cover/Box: ${row.packaging || '—'}`).join('\n');
    const videos = videoRows.map((row) => `Video: ${row.video_type || 'Edit'} | Format: ${row.quality || '—'} | Output specs: ${row.quality || '—'}`).join('\n');
    const message = `*Lab Work Slip*\nProject: ${order.project_name}\nLab Partner: ${order.partner_name || '—'}\n${albums}\n${videos}\nPromised Delivery: ${order.promised_delivery_date ? formatDate(order.promised_delivery_date) : '—'}\nDrive / Delivery Link: ${order.parcel_tracking_details || '—'}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };
  const handlePrintA4 = () => {
    setPrintPreview(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrintPreview(false), 400);
    }, 120);
  };

  return (
    <Modal open={true} onClose={onClose} title={`Work Slip — ${order.order_no}`} size="xl" dismissible={false}>
      <div id={slipId} className="space-y-4 bg-white p-4 text-black sm:p-6">
        <div className="border-b-2 border-black pb-3">
          <h2 className="text-xl font-bold">{settings?.production_title ?? 'Bollywood Umang Production'}</h2>
          <p className="text-xs">{settings?.production_subtitle ?? ''}</p>
          <p className="text-xs">{settings?.address ?? ''}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm"><p><strong>Lab Partner:</strong> {order.partner_name || '—'}</p><p><strong>Work Order:</strong> {order.order_no}</p><p><strong>Project:</strong> {order.project_name}</p><p><strong>Promised Delivery:</strong> {order.promised_delivery_date ? formatDate(order.promised_delivery_date) : '—'}</p></div>
        {albumRows.length > 0 && <div><h3 className="mb-2 font-semibold">Album Designing &amp; Printing</h3><div className="space-y-1 text-sm">{albumRows.map((row, index) => <p key={index}>{row.album_type || 'Album'} · Size {row.size || '—'} · {row.papers.reduce((sum, paper) => sum + toNum(paper.sheets), 0)} sheets · Paper {row.papers.map((paper) => paper.paper_type).filter(Boolean).join(', ') || '—'} · Cover/Box {row.packaging || '—'}</p>)}</div></div>}
        {videoRows.length > 0 && <div><h3 className="mb-2 font-semibold">Video Editing</h3><div className="space-y-1 text-sm">{videoRows.map((row, index) => <p key={index}>{row.video_type || 'Video Edit'} · Format {row.quality || '—'} · Output specs {row.quality || '—'}</p>)}</div></div>}
        <div><h3 className="mb-2 font-semibold">Delivery / Drive Links</h3><p className="break-all text-sm">{order.parcel_tracking_details || 'No link provided'}</p></div>
        <div className="border-t border-black pt-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="mb-1 font-semibold">Production &amp; Lab Terms &amp; Conditions</h3>
            <button type="button" onClick={() => setEditingTerms((value) => !value)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-700"> <Edit3 className="h-3 w-3" /> Edit Terms </button>
          </div>
          {editingTerms && (
            <div className="mb-3 rounded-lg border border-slate-200 p-3">
              <textarea value={termsText} onChange={(e) => setTermsText(e.target.value)} rows={8} className="w-full rounded border border-slate-200 p-2 text-xs text-slate-700" />
              <div className="mt-2 flex justify-end"><button type="button" onClick={() => setEditingTerms(false)} className="rounded bg-slate-800 px-3 py-2 text-[10px] font-medium text-white">Save Terms</button></div>
            </div>
          )}
          <p className="whitespace-pre-line text-xs">{termsText || DEFAULT_PRODUCTION_TERMS}</p>
        </div>
        <div className="mt-4 border-t border-black pt-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 text-xs text-slate-600">Authorized Signatory</div>
            {showStamp && <LabDigitalStamp order={order} />}
          </div>
        </div>
      </div>
      <div className="mt-4 border-t border-slate-200 pt-4 dark:border-white/10">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">File: {exportFilename}</span>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setShowStamp((value) => !value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-white/10 dark:text-slate-300">{showStamp ? 'Stamp On' : 'Stamp Off'}</button>
            <button onClick={handlePrintA4} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900">Print A4</button>
            <button onClick={download} className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-white/10 dark:text-slate-300"><Download className="h-4 w-4" /> Download PDF</button>
            <button onClick={shareSlip} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white">Send via WhatsApp</button>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {onDualPrint && <button onClick={onDualPrint} className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white">🖨️ Print 2-in-1</button>}
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-white/10 dark:text-slate-300">Close</button>
        </div>
      </div>
      {printPreview && createPortal(
        <div id={slipId} aria-hidden>
          <LabOrderPrintTemplate order={order} settings={settings} termsText={termsText} />
        </div>,
        document.body,
      )}
    </Modal>
  );
}

function LabSettlementModal({ order, onClose, onSaved }: { order: StudioLabOrder; onClose: () => void; onSaved: (updated: StudioLabOrder) => void }) {
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { toast('Enter a valid settlement amount', 'error'); return; }
    setSaving(true);
    try {
      const nextAdvance = toNum(order.advance_paid) + value;
      const paymentHistory: LabPaymentInstallment[] = [...(order.payment_history ?? []), { id: uid(), amount: value, payment_date: paymentDate, payment_mode: paymentMode, note: reference.trim() || 'Balance settlement' }];
      const { error } = await supabase.from('studio_lab_orders').update({
        advance_paid: nextAdvance,
        net_final_due: toNum(order.master_total) - nextAdvance,
        payment_mode: paymentMode,
        payment_date: paymentDate,
        payment_note: reference.trim(),
        payment_history: paymentHistory,
      }).eq('id', order.id);
      if (error) throw error;
      toast('Lab settlement recorded instantly!', 'success');
      onSaved({
        ...order,
        advance_paid: nextAdvance,
        net_final_due: toNum(order.master_total) - nextAdvance,
        payment_mode: paymentMode,
        payment_date: paymentDate,
        payment_note: reference.trim(),
        payment_history: paymentHistory,
      });
    } catch (error) {
      toast(getDatabaseErrorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  return <Modal open={true} onClose={onClose} title={`Settle ${order.partner_name || order.studio_name}`} size="md" dismissible={false}>
    <div className="space-y-4">
      <Field label="Amount (₹)"><input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} placeholder="0" /></Field>
      <div className="grid grid-cols-2 gap-4"><Field label="Payment Date"><input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} /></Field><Field label="Payment Mode"><select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={selectClass}><option>Cash</option><option>UPI</option><option>Bank Transfer</option></select></Field></div>
      <Field label="Reference / UTR / Reason"><input value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} placeholder="Optional reference or notes" /></Field>
      <div className="flex justify-end gap-3"><button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-white/10 dark:text-slate-300">Cancel</button><button onClick={handleSave} disabled={saving} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Settle Balance'}</button></div>
    </div>
  </Modal>;
}

function LabQuickPayModal({ order, onClose, onSaved }: { order: StudioLabOrder; onClose: () => void; onSaved: (updated: StudioLabOrder) => void }) {
  const { toast } = useToast();
  const paymentOptions = ['Cash', 'UPI / Online', 'Bank Transfer', 'Cheque'];
  const [currentOrder, setCurrentOrder] = useState<StudioLabOrder>(order);
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentMode, setPaymentMode] = useState<string>('Cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCurrentOrder(order);
  }, [order]);

  const orderTotal = Number(currentOrder.current_order_total ?? currentOrder.total_album_bill ?? currentOrder.total_video_bill ?? 0);
  const previousBackDue = Number(currentOrder.previous_back_due ?? currentOrder.back_due ?? 0);
  const orderPaid = Number(currentOrder.advance_paid || 0);
  const orderDue = Math.max(0, orderTotal - orderPaid);
  const netDue = Number(currentOrder.net_final_due ?? currentOrder.net_due ?? Math.max(0, orderTotal + previousBackDue - orderPaid));
  const paymentAmount = Number(amount || 0);
  const remainingBalance = Math.max(0, Number(currentOrder.net_due || currentOrder.net_final_due || netDue) - paymentAmount);
  const isOverPayment = paymentAmount > Number(currentOrder.net_due || currentOrder.net_final_due || netDue);
  const totalPaidAfterPay = Number(currentOrder.advance_paid || 0) + paymentAmount;
  const paymentHistoryList = currentOrder.payment_history ?? [];

  const handleSave = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { toast('Enter a valid payment amount', 'error'); return; }
    const selectedMode = paymentMode || 'Cash';
    const trimmedNote = paymentNote.trim();
    setSaving(true);
    try {
      const currentNetDue = Number(currentOrder.net_due ?? currentOrder.net_final_due ?? netDue ?? 0);
      const nextAdvance = Number(currentOrder.advance_paid || 0) + value;
      const nextNetDue = Math.max(0, currentNetDue - value);
      const nextHistory: LabPaymentInstallment[] = [...(currentOrder.payment_history ?? []), {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : uid(),
        amount: value,
        payment_date: paymentDate,
        payment_mode: selectedMode,
        note: trimmedNote || '',
      }];

      const nextOrder: StudioLabOrder = {
        ...currentOrder,
        advance_paid: nextAdvance,
        net_due: nextNetDue,
        net_final_due: nextNetDue,
        payment_mode: selectedMode,
        payment_date: paymentDate,
        payment_note: trimmedNote,
        payment_history: nextHistory,
      };

      const { error } = await supabase.from('studio_lab_orders').update({
        advance_paid: nextAdvance,
        net_due: nextNetDue,
        net_final_due: nextNetDue,
        payment_mode: selectedMode,
        payment_date: paymentDate,
        payment_note: trimmedNote,
        payment_history: nextHistory,
      }).eq('id', currentOrder.id);
      if (error) throw error;
      setCurrentOrder(nextOrder);

      if (currentOrder.partner_id) {
        const ledgerDescription = `Order #${currentOrder.order_no} (${currentOrder.project_name || 'Project'}) payment via ${selectedMode}${trimmedNote ? ` - Note: ${trimmedNote}` : ''}`;
        const ledgerPayload = {
          partner_id: currentOrder.partner_id,
          amount: value,
          entry_type: 'CREDIT',
          description: ledgerDescription,
          reference_order_id: currentOrder.id,
          date: paymentDate,
        };
        try {
          const { error: ledgerError } = await supabase.from('ledger_entries').insert([ledgerPayload]);
          if (ledgerError) throw ledgerError;
        } catch {
          try {
            const { error: fallbackError } = await supabase.from('photographer_ledger').insert([{ photographer_name: currentOrder.partner_name || currentOrder.studio_name, mobile: currentOrder.studio_mobile, entry_type: 'PAYMENT_SETTLED', description: ledgerDescription, amount: value, created_at: new Date().toISOString() }]);
            if (fallbackError) throw fallbackError;
          } catch (ledgerError) {
            toast(getDatabaseErrorMessage(ledgerError), 'error');
          }
        }
      }

      toast('Payment recorded instantly!', 'success');
      onSaved(nextOrder);
      onClose();
    } catch (error) {
      toast(getDatabaseErrorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  return <Modal open={true} onClose={onClose} title={`Quick Pay — ${currentOrder.partner_name || currentOrder.studio_name}`} size="sm" dismissible={false}>
    <div className="space-y-4">
      <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-white/5">
        <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">This Order Total</span><span className="font-medium text-slate-900 dark:text-white">{formatINR(orderTotal)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Already Paid (This Order)</span><span className="text-emerald-600 dark:text-emerald-400">{formatINR(orderPaid)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">This Order Due</span><span className="font-medium text-slate-900 dark:text-white">{formatINR(orderDue)}</span></div>
        {previousBackDue > 0 && <div className="flex justify-between"><span className="text-rose-500 dark:text-rose-400">Previous Back Due</span><span className="font-semibold text-rose-500 dark:text-rose-400">{formatINR(previousBackDue)}</span></div>}
        <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 dark:border-white/10"><span className="font-semibold text-slate-700 dark:text-slate-300">Net Due</span><span className="font-bold text-rose-500 dark:text-rose-400">{formatINR(netDue)}</span></div>
      </div>

      <div className={`rounded-xl border-2 p-3 ${remainingBalance === 0 ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200' : 'border-emerald-200 bg-emerald-50/70 text-slate-700 dark:border-emerald-500/30 dark:bg-emerald-500/5 dark:text-slate-200'}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide">Remaining Balance</span>
          <span className={`text-base font-bold ${remainingBalance === 0 ? 'text-emerald-700 dark:text-emerald-300' : isOverPayment ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-300'}`}>
            {formatINR(remainingBalance)}
          </span>
        </div>
        {paymentAmount > 0 && (
          <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
            {remainingBalance === 0 ? 'FULL SETTLE' : isOverPayment ? `This payment exceeds the current due by ${formatINR(paymentAmount - Number(currentOrder.net_due || currentOrder.net_final_due || netDue))}.` : `Total paid after this entry: ${formatINR(totalPaidAfterPay)}.`}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Payment History</span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">{paymentHistoryList.length} entries</span>
        </div>
        <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
          {paymentHistoryList.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No advance payments recorded yet.</p>
          ) : (
            paymentHistoryList.map((entry) => {
              const entryDate = entry.payment_date || '';
              const entryMode = entry.payment_mode || 'Cash';
              const entryNote = entry.note || '';
              return (
                <div key={entry.id} className="rounded-lg border border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-slate-900/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{entryDate ? formatDate(entryDate) : '—'}</span>
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">{entryMode}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">₹{formatINR(entry.amount)}</span>
                    {entryNote && <span className="text-[10px] text-slate-500 dark:text-slate-400">{entryNote}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <Field label="Payment Amount (₹)"><input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} placeholder="0" autoFocus /></Field>
      <Field label="Payment Note / Kab Dega"><input value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} className={inputClass} placeholder="Optional note for this payment" /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date"><input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} /></Field>
        <Field label="Mode">
          <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={selectClass}>
            {paymentOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-white/10 dark:text-slate-300">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Record Payment'}</button>
      </div>
    </div>
  </Modal>;
}

function partnerMobile(partner: Partner) {
  const contact = partner as Partner & {
    mobile_number?: string | number | null;
    phone?: string | number | null;
    whatsapp?: string | number | null;
    whatsapp_number?: string | number | null;
  };
  return [contact.mobile, contact.mobile_number, contact.phone, contact.whatsapp, contact.whatsapp_number]
    .map((value) => value == null ? '' : String(value).trim())
    .find(Boolean) ?? '';
}

function partnerNameWithoutMobile(partner: Partner) {
  return partner.name.trim().replace(/\s*\(\s*[\d\s+().-]{7,}\s*\)\s*$/, '').trim();
}

function LabOrderForm({ open, onClose, editing, existing, onSaved }: { open: boolean; onClose: () => void; editing: StudioLabOrder | null; existing: StudioLabOrder[]; onSaved: (saved: StudioLabOrder) => void }) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [ledgerBalances, setLedgerBalances] = useState<Record<string, number>>({});
  const draftKey = editing ? `lab-edit-${editing.id}` : 'lab-new';
  const [selectedPartnerId, setSelectedPartnerId] = useDraftState<string>(`${draftKey}-partnerId`, '');
  const [partnerName, setPartnerName] = useDraftState<string>(`${draftKey}-partnerName`, '');
  const [studioName, setStudioName] = useDraftState<string>(`${draftKey}-studioName`, '');
  const [studioMobile, setStudioMobile] = useDraftState<string>(`${draftKey}-studioMobile`, '');
  const [studioAddress, setStudioAddress] = useDraftState<string>(`${draftKey}-studioAddress`, '');
  const [backDue, setBackDue] = useDraftState<string>(`${draftKey}-backDue`, '');
  const [projectName, setProjectName] = useDraftState<string>(`${draftKey}-projectName`, '');
  const [orderStatus, setOrderStatus] = useDraftState<string>(`${draftKey}-orderStatus`, 'Processing');
  const [deliveryMode, setDeliveryMode] = useDraftState<string>(`${draftKey}-deliveryMode`, 'By Hand');
  const [parcelTracking, setParcelTracking] = useDraftState<string>(`${draftKey}-parcelTracking`, '');
  const [clients, setClients] = useDraftState<LabClientRow[]>(`${draftKey}-clients`, []);
  const [advancePaid, setAdvancePaid] = useDraftState<string>(`${draftKey}-advancePaid`, '');
  const [paymentMode, setPaymentMode] = useDraftState<string>(`${draftKey}-paymentMode`, '');
  const [paymentDate, setPaymentDate] = useDraftState<string>(`${draftKey}-paymentDate`, '');
  const [paymentNote, setPaymentNote] = useDraftState<string>(`${draftKey}-paymentNote`, '');
  const [promisedDeliveryDate, setPromisedDeliveryDate] = useDraftState<string>(`${draftKey}-promisedDeliveryDate`, '');
  const [paymentHistory, setPaymentHistory] = useDraftState<LabPaymentInstallment[]>(`${draftKey}-paymentHistory`, []);
  const [isEmergency, setIsEmergency] = useDraftState<boolean>(`${draftKey}-isEmergency`, false);
  const [albumRequiredDate, setAlbumRequiredDate] = useDraftState<string>(`${draftKey}-albumRequiredDate`, '');
  const [videoDeliveryDate, setVideoDeliveryDate] = useDraftState<string>(`${draftKey}-videoDeliveryDate`, '');
  const [datePending, setDatePending] = useDraftState<boolean>(`${draftKey}-datePending`, false);
  const [storageLocations, setStorageLocations] = useDraftState<StorageLocation[]>(`${draftKey}-storageLocations`, []);

  const clearDraft = () => {
    setSelectedPartnerId('');
    setPartnerName('');
    setStudioName('');
    setStudioMobile('');
    setStudioAddress('');
    setBackDue('');
    setProjectName('');
    setOrderStatus('Processing');
    setDeliveryMode('By Hand');
    setParcelTracking('');
    setClients([]);
    setAdvancePaid('');
    setPaymentMode('');
    setPaymentDate('');
    setPaymentNote('');
    setPromisedDeliveryDate('');
    setPaymentHistory([]);
    setIsEmergency(false);
    setAlbumRequiredDate('');
    setVideoDeliveryDate('');
    setDatePending(false);
    setStorageLocations([]);
  };

  useEffect(() => {
    (async () => {
      try {
        const [partnersResult, ledgerResult, transactionsResult] = await Promise.all([
          supabase.from('partners').select('*').order('name'),
          supabase.from('photographer_ledger').select('*'),
          supabase.from('direct_transactions').select('*'),
        ]);
        if (partnersResult.error) throw partnersResult.error;
        if (ledgerResult.error) throw ledgerResult.error;
        if (transactionsResult.error) throw transactionsResult.error;
        const partnerList = (partnersResult.data ?? []) as Partner[];
        setPartners(partnerList);
        const balances: Record<string, number> = {};
        for (const partner of partnerList) {
          const entries = (ledgerResult.data ?? []).filter((e: any) => e.mobile === partner.mobile);
          const txns = (transactionsResult.data ?? []).filter((t: any) => t.partner_id === partner.id);
          const credits = entries.filter((e: any) => e.entry_type === 'SHOOT_DUTY_CREDIT').reduce((s: number, e: any) => s + toNum(e.amount), 0);
          const debits = entries.filter((e: any) => e.entry_type === 'LAB_WORK_DEBIT').reduce((s: number, e: any) => s + toNum(e.amount), 0);
          const settled = entries.filter((e: any) => e.entry_type === 'PAYMENT_SETTLED').reduce((s: number, e: any) => s + toNum(e.amount), 0);
          const given = txns.filter((t: any) => t.txn_type === 'Given').reduce((s: number, t: any) => s + toNum(t.amount), 0);
          const received = txns.filter((t: any) => t.txn_type === 'Received').reduce((s: number, t: any) => s + toNum(t.amount), 0);
          balances[partner.id] = credits - debits - settled + given - received;
        }
        setLedgerBalances(balances);
      } catch (error) {
        toast(getDatabaseErrorMessage(error), 'error');
      }
    })();
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setSelectedPartnerId(editing?.partner_id ?? '');
      setPartnerName(editing?.partner_name ?? '');
      setStudioName(editing?.studio_name ?? '');
      setStudioMobile(editing?.studio_mobile ?? '');
      setStudioAddress(editing?.studio_address ?? '');
      setBackDue(editing && toNum(editing.previous_back_due) ? String(editing.previous_back_due) : '');
      setProjectName(editing?.project_name ?? '');
      setOrderStatus(editing?.order_status ?? 'Processing');
      setDeliveryMode(editing?.delivery_mode ?? 'By Hand');
      setParcelTracking(editing?.parcel_tracking_details ?? '');
      setClients(editing?.clients ?? [emptyClient()]);
      setAdvancePaid(editing && toNum(editing.advance_paid) ? String(editing.advance_paid) : '');
      setPaymentMode(editing?.payment_mode ?? '');
      setPaymentDate(editing?.payment_date ?? '');
      setPaymentNote(editing?.payment_note ?? '');
      setPromisedDeliveryDate(editing?.promised_delivery_date ?? '');
      setPaymentHistory(editing?.payment_history ?? []);
      setIsEmergency(editing?.is_emergency ?? false);
      setAlbumRequiredDate(editing?.album_required_date ?? '');
      setVideoDeliveryDate(editing?.video_delivery_date ?? '');
      setDatePending(editing?.date_pending ?? false);
      setStorageLocations(editing?.storage_locations ?? []);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  useEffect(() => {
    if (paymentHistory.length > 0) setAdvancePaid(String(paymentHistory.reduce((sum, payment) => sum + toNum(payment.amount), 0)));
  }, [paymentHistory, setAdvancePaid]);

  const handlePartnerSelect = (id: string) => {
    setSelectedPartnerId(id);
    if (!id) {
      setPartnerName('');
      return;
    }
    const partner = partners.find((p) => p.id === id);
    if (partner) {
      const name = partnerNameWithoutMobile(partner);
      setPartnerName(name);
      setStudioName(partner.studio_name || name);
      setStudioMobile(partnerMobile(partner));
      setStudioAddress(partner.studio_address || '');
      const bal = ledgerBalances[partner.id] ?? 0;
      setBackDue(bal !== 0 ? String(Math.abs(bal)) : '');
    }
  };

  const updateClient = (ci: number, patch: Partial<LabClientRow>) => {
    setClients((prev) => {
      const next = prev.map((c, idx) => {
        if (idx !== ci) return c;
        const updated = { ...c, ...patch };
        updated.video_total = computeClientVideoTotal(updated.video_rows);
        updated.album_total = computeClientAlbumTotal(updated.album_rows);
        return updated;
      });
      if ('client_name' in patch) {
        const joined = next.map((c) => c.client_name.trim()).filter(Boolean).join(' + ');
        setProjectName(joined);
      }
      return next;
    });
  };

  const addClient = () => setClients((prev) => [...prev, emptyClient()]);
  const removeClient = (ci: number) => setClients((prev) => prev.filter((_, idx) => idx !== ci));

  const addVideoRow = (ci: number) => updateClient(ci, { video_rows: [...(clients[ci]?.video_rows ?? []), { ...EMPTY_VIDEO_ROW }] });
  const removeVideoRow = (ci: number, vi: number) => updateClient(ci, { video_rows: (clients[ci]?.video_rows ?? []).filter((_, idx) => idx !== vi) });
  const updateVideoRow = (ci: number, vi: number, patch: Partial<VideoRow>) => {
    const client = clients[ci];
    if (!client) return;
    const newRows = client.video_rows.map((r, idx) => {
      if (idx !== vi) return r;
      const updated = { ...r, ...patch };
      updated.total = computeRowTotal(updated);
      return updated;
    });
    updateClient(ci, { video_rows: newRows });
  };

  const addAlbumRow = (ci: number) => updateClient(ci, { album_rows: [...(clients[ci]?.album_rows ?? []), { ...EMPTY_ALBUM_ROW, id: uid(), papers: [{ ...EMPTY_PAPER_ROW, id: uid() }] }] });
  const removeAlbumRow = (ci: number, ai: number) => updateClient(ci, { album_rows: (clients[ci]?.album_rows ?? []).filter((_, idx) => idx !== ai) });
  const updateAlbumRow = (ci: number, ai: number, patch: Partial<AlbumRow>) => {
    const client = clients[ci];
    if (!client) return;
    const newRows = client.album_rows.map((r, idx) => {
      if (idx !== ai) return r;
      const updated = { ...r, ...patch };
      updated.packaging_total = toNum(updated.packaging_rate);
      updated.mini_total = toNum(updated.mini_qty) * toNum(updated.mini_rate);
      updated.total = computeAlbumTotal(updated);
      return updated;
    });
    updateClient(ci, { album_rows: newRows });
  };
  const updatePaperRow = (ci: number, ai: number, pi: number, patch: Partial<PaperRow>) => {
    const client = clients[ci];
    if (!client) return;
    const newRows = client.album_rows.map((r, idx) => {
      if (idx !== ai) return r;
      const newPapers = r.papers.map((p, pidx) => {
        if (pidx !== pi) return p;
        const updated = { ...p, ...patch };
        updated.total = toNum(updated.sheets) * toNum(updated.rate);
        return updated;
      });
      const updated = { ...r, papers: newPapers };
      updated.total = computeAlbumTotal(updated);
      return updated;
    });
    updateClient(ci, { album_rows: newRows });
  };
  const addPaperRow = (ci: number, ai: number) => {
    const client = clients[ci];
    if (!client) return;
    const newRows = client.album_rows.map((r, idx) => {
      if (idx !== ai) return r;
      const updated = { ...r, papers: [...r.papers, { ...EMPTY_PAPER_ROW, id: uid() }] };
      updated.total = computeAlbumTotal(updated);
      return updated;
    });
    updateClient(ci, { album_rows: newRows });
  };
  const removePaperRow = (ci: number, ai: number, pi: number) => {
    const client = clients[ci];
    if (!client) return;
    const newRows = client.album_rows.map((r, idx) => {
      if (idx !== ai) return r;
      const updated = { ...r, papers: r.papers.filter((_, pidx) => pidx !== pi) };
      updated.total = computeAlbumTotal(updated);
      return updated;
    });
    updateClient(ci, { album_rows: newRows });
  };

  const totalVideoBill = useMemo(() => clients.reduce((s, c) => s + computeClientVideoTotal(c.video_rows), 0), [clients]);
  const totalAlbumBill = useMemo(() => clients.reduce((s, c) => s + computeClientAlbumTotal(c.album_rows), 0), [clients]);
  const currentOrderTotal = totalVideoBill + totalAlbumBill;
  const masterTotal = currentOrderTotal + toNum(backDue);
  const netFinalDue = masterTotal - toNum(advancePaid);

  const handleSave = async () => {
    if (isSubmitting) return;
    if (!studioName || !studioMobile || !projectName) { toast('Studio name, mobile, and project are required', 'error'); return; }
    setIsSubmitting(true);
    try {
      const allVideoRows = clients.flatMap((c) => c.video_rows);
      const allAlbumRows = clients.flatMap((c) => c.album_rows);
      const payload = sanitizePayload({
        id: editing?.id ?? uid(),
        order_no: editing?.order_no ?? nextOrderNo(existing),
        partner_id: selectedPartnerId || null,
        partner_name: partnerName,
        studio_name: studioName,
        studio_mobile: studioMobile,
        studio_address: studioAddress,
        project_name: projectName,
        work_type: allVideoRows.length > 0 ? 'Video Mixing' : allAlbumRows.length > 0 ? 'Album Design' : 'Other',
        clients,
        is_demo: editing?.is_demo ?? false,
        isDemo: false,
        total_album_bill: totalAlbumBill,
        total_video_bill: totalVideoBill,
        current_order_total: currentOrderTotal,
        previous_back_due: toNum(backDue),
        master_total: masterTotal,
        advance_paid: toNum(advancePaid),
        net_final_due: netFinalDue,
        payment_mode: paymentMode,
        payment_date: paymentDate,
        payment_note: paymentNote,
        payment_history: paymentHistory,
        promised_delivery_date: promisedDeliveryDate || null,
        order_status: orderStatus,
        album_status: editing?.album_status ?? (totalAlbumBill > 0 && orderStatus !== 'Pending' ? orderStatus : 'Pending'),
        video_status: editing?.video_status ?? (totalVideoBill > 0 && orderStatus !== 'Pending' ? orderStatus : 'Pending'),
        archived_at: orderStatus === 'Delivered' ? (editing?.archived_at ?? new Date().toISOString()) : null,
        delivery_mode: deliveryMode,
        parcel_tracking_details: parcelTracking,
        video_rows: allVideoRows,
        album_rows: allAlbumRows,
        access_pin: editing?.access_pin || defaultPinFromPhone(studioMobile),
        pin_changed: editing?.pin_changed ?? false,
        is_login_allowed: editing?.is_login_allowed ?? false,
        is_emergency: isEmergency,
        album_required_date: albumRequiredDate || null,
        video_delivery_date: videoDeliveryDate || null,
        date_pending: datePending,
        storage_locations: storageLocations,
      });
      let savedOrder: StudioLabOrder | null = null;
      const { data, error } = await supabase.from('studio_lab_orders').upsert(payload).select().single();
      if (error) throw error;
      savedOrder = data as StudioLabOrder | null;
      clearDraft();
      if (savedOrder) onSaved(savedOrder);
    } catch (err) {
      toast(getDatabaseErrorMessage(err), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    clearDraft();
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={editing ? 'Edit Lab Order' : 'New Lab Order'} size="xl" dismissible={false}>
      <div className="space-y-5">
        {/* Partner Sync */}
        <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Partner Profile Sync</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Partner (from Ledger)">
              <select value={selectedPartnerId} onChange={(e) => handlePartnerSelect(e.target.value)} className={selectClass}>
                <option value="">— No Partner —</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{partnerNameWithoutMobile(p)} ({partnerMobile(p)})</option>)}
              </select>
            </Field>
            <Field label="Partner Name">
              <input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} className={inputClass} placeholder="Auto-filled from partner" />
            </Field>
            <Field label="Studio Name">
              <input value={studioName} onChange={(e) => setStudioName(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Studio Mobile (WhatsApp)">
              <input value={studioMobile} onChange={(e) => setStudioMobile(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Studio Address">
              <input value={studioAddress} onChange={(e) => setStudioAddress(e.target.value)} className={inputClass} placeholder="Studio address" />
            </Field>
            <Field label="Back Due (from Ledger balance)">
              <input type="number" value={backDue} onChange={(e) => setBackDue(e.target.value)} onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }} className={inputClass} placeholder="0" />
            </Field>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Project / Party Name"><input value={projectName} onChange={(e) => setProjectName(e.target.value)} className={inputClass} /></Field>
            <Field label="Delivery Mode">
              <select value={deliveryMode} onChange={(e) => setDeliveryMode(e.target.value)} className={selectClass}>
                {DELIVERY_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Order Status">
              <select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)} className={selectClass}>
                {LAB_ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          {deliveryMode !== 'By Hand' && (
            <div className="mt-4">
              <Field label="Courier Name & Tracking ID"><input value={parcelTracking} onChange={(e) => setParcelTracking(e.target.value)} placeholder="e.g. DTDC: P123456789" className={inputClass} /></Field>
            </div>
          )}
          {/* Emergency + Deadline Fields */}
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-500/20 dark:bg-rose-500/5">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
              <input type="checkbox" checked={isEmergency} onChange={(e) => setIsEmergency(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-rose-500 focus:ring-rose-400" />
              <Zap className="h-4 w-4 text-rose-500" /> Emergency Order
            </label>
            <p className="mt-1 text-xs text-slate-400">Visual priority only — does not affect pricing, payments, or status.</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Album Required Date"><input type="date" value={albumRequiredDate} onChange={(e) => setAlbumRequiredDate(e.target.value)} disabled={datePending} className={`${inputClass} ${datePending ? 'opacity-50 cursor-not-allowed' : ''}`} /></Field>
              <Field label="Video Delivery Date"><input type="date" value={videoDeliveryDate} onChange={(e) => setVideoDeliveryDate(e.target.value)} disabled={datePending} className={`${inputClass} ${datePending ? 'opacity-50 cursor-not-allowed' : ''}`} /></Field>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
              <input type="checkbox" checked={datePending} onChange={(e) => setDatePending(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400" />
              <CalendarClock className="h-4 w-4 text-amber-500" /> Date Pending (Client to Confirm Later)
            </label>
            <p className="mt-1 text-xs text-slate-400">When enabled, delivery date inputs are disabled but saved values are preserved.</p>
          </div>
        </div>

        {/* Multi-Client Repeater */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">End-Clients</h3>
            <button onClick={addClient} className="flex items-center gap-1 rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 hover:bg-amber-500/20 dark:text-amber-400">
              <Plus className="h-3.5 w-3.5" /> Add Another Client Data
            </button>
          </div>
          {clients.map((client, ci) => (
            <div key={client.id} className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Client {ci + 1}</h4>
                {clients.length > 1 && (
                  <button onClick={() => removeClient(ci)} className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-600">
                    <X className="h-3.5 w-3.5" /> Remove Client
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Client Name"><input value={client.client_name} onChange={(e) => updateClient(ci, { client_name: e.target.value })} className={inputClass} /></Field>
                <Field label="Event Address"><input value={client.event_address} onChange={(e) => updateClient(ci, { event_address: e.target.value })} className={inputClass} /></Field>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Delivery Status">
                  <select
                    value={client.delivery_status || 'In Design'}
                    onChange={(e) => updateClient(ci, { delivery_status: e.target.value as LabClientDeliveryStatus })}
                    className={`${selectClass} text-xs`}
                  >
                    <option value="In Design">In Design</option>
                    <option value="Ready">Ready</option>
                    <option value="Delivered">Delivered</option>
                  </select>
                </Field>
                <Field label="Dispatch Mode">
                  <select
                    value={client.dispatch_mode || 'By Hand'}
                    onChange={(e) => updateClient(ci, { dispatch_mode: e.target.value as LabClientDispatchMode })}
                    className={`${selectClass} text-xs`}
                  >
                    <option value="By Hand">By Hand</option>
                    <option value="Courier">Courier</option>
                    <option value="Drive">Drive</option>
                  </select>
                </Field>
              </div>

              {/* Action buttons */}
              <div className="mt-3 flex gap-2">
                <button onClick={() => addVideoRow(ci)} className="flex items-center gap-1 rounded-lg bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-600 hover:bg-sky-500/20 dark:text-sky-400">
                  <Video className="h-3.5 w-3.5" /> + Video
                </button>
                <button onClick={() => addAlbumRow(ci)} className="flex items-center gap-1 rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 hover:bg-amber-500/20 dark:text-amber-400">
                  <Book className="h-3.5 w-3.5" /> + Album
                </button>
              </div>

              {/* Video repeater */}
              {client.video_rows.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-sky-600 dark:text-sky-400">Video Items</p>
                  {client.video_rows.map((r, vi) => (
                      <div key={vi}>
                        <div className="grid grid-cols-12 items-center gap-2">
                          <select value={r.video_type} onChange={(e) => updateVideoRow(ci, vi, { video_type: e.target.value })} className={`${selectClass} col-span-12 sm:col-span-3`}>
                            <option value="">Video</option>
                            {LAB_VIDEO_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <select value={r.quality} onChange={(e) => updateVideoRow(ci, vi, { quality: e.target.value })} className={`${selectClass} col-span-6 sm:col-span-2`}>
                            <option value="">Resolutions</option>
                            {LAB_VIDEO_QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
                          </select>
                          <input type="number" value={r.qty || ''} onChange={(e) => updateVideoRow(ci, vi, { qty: Number(e.target.value) })} onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }} className={`${inputClass} col-span-3 sm:col-span-1`} placeholder="Qty" />
                          <input type="number" value={r.rate || ''} onChange={(e) => updateVideoRow(ci, vi, { rate: Number(e.target.value) })} onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }} className={`${inputClass} col-span-3 sm:col-span-2`} placeholder="Rate" />
                          <span className="col-span-4 sm:col-span-3 flex items-center text-sm font-medium text-slate-700 dark:text-slate-300">{formatINR(computeRowTotal(r))}</span>
                          <button onClick={() => removeVideoRow(ci, vi)} className="col-span-2 sm:col-span-1 flex items-center justify-center text-slate-400 hover:text-rose-500">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                  ))}
                  <p className="text-right text-xs font-medium text-slate-600 dark:text-slate-400">Client Video Total: {formatINR(computeClientVideoTotal(client.video_rows))}</p>
                </div>
              )}

              {/* Album repeater */}
              {client.album_rows.length > 0 && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Album Items</p>
                  {client.album_rows.map((r, ai) => {
                    return (
                      <div key={ai} className="rounded-lg border border-slate-200 p-2.5 dark:border-white/10">
                        {/* Master row */}
                        <div>
                          <div className="grid grid-cols-12 items-center gap-2">
                            <select value={r.album_type} onChange={(e) => updateAlbumRow(ci, ai, { album_type: e.target.value })} className={`${selectClass} col-span-12 sm:col-span-3`}>
                              <option value="">Album</option>
                              {LAB_ALBUM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <select value={r.size} onChange={(e) => updateAlbumRow(ci, ai, { size: e.target.value })} className={`${selectClass} col-span-6 sm:col-span-2`}>
                              <option value="">Size</option>
                              {LAB_ALBUM_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <select value={r.packaging} onChange={(e) => updateAlbumRow(ci, ai, { packaging: e.target.value })} className={`${selectClass} col-span-6 sm:col-span-2`}>
                              <option value="">Packaging</option>
                              {LAB_ALBUM_COVERS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <input type="number" value={r.packaging_rate || ''} onChange={(e) => updateAlbumRow(ci, ai, { packaging_rate: Number(e.target.value) })} onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }} className={`${inputClass} col-span-3 sm:col-span-1`} placeholder="Rate" />
                            <span className="col-span-3 sm:col-span-1 flex items-center text-sm font-medium text-slate-700 dark:text-slate-300">{formatINR(toNum(r.packaging_total))}</span>
                            <button onClick={() => removeAlbumRow(ci, ai)} className="col-span-2 sm:col-span-1 flex items-center justify-center text-slate-400 hover:text-rose-500">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          {/* Mini album checkbox */}
                          <div className="mt-2 flex items-center gap-3">
                            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                              <input type="checkbox" checked={r.mini_album} onChange={(e) => updateAlbumRow(ci, ai, { mini_album: e.target.checked })} className="h-3.5 w-3.5 rounded border-slate-300 text-amber-500 focus:ring-amber-400" />
                              Mini Album
                            </label>
                            {r.mini_album && (
                              <div className="flex items-center gap-2">
                                <input type="number" value={r.mini_qty || ''} onChange={(e) => updateAlbumRow(ci, ai, { mini_qty: Number(e.target.value) })} onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }} className={`${inputClass} w-16`} placeholder="Qty" />
                                <input type="number" value={r.mini_rate || ''} onChange={(e) => updateAlbumRow(ci, ai, { mini_rate: Number(e.target.value) })} onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }} className={`${inputClass} w-20`} placeholder="Rate" />
                                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{formatINR(toNum(r.mini_total))}</span>
                              </div>
                            )}
                          </div>
                          {/* Paper sub-rows */}
                          <div className="mt-2 space-y-1.5 border-l-2 border-amber-200 pl-3 dark:border-amber-500/20">
                            {r.papers.map((p, pi) => (
                              <div key={p.id} className="grid grid-cols-12 items-center gap-2">
                                <select value={p.paper_type} onChange={(e) => updatePaperRow(ci, ai, pi, { paper_type: e.target.value })} className={`${selectClass} col-span-12 sm:col-span-3`}>
                                  <option value="">Paper</option>
                                  {LAB_ALBUM_PAPERS.map((pp) => <option key={pp} value={pp}>{pp}</option>)}
                                </select>
                                <input type="number" value={p.sheets || ''} onChange={(e) => updatePaperRow(ci, ai, pi, { sheets: Number(e.target.value) })} onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }} className={`${inputClass} col-span-4 sm:col-span-2`} placeholder="Sheets" />
                                <input type="number" value={p.rate || ''} onChange={(e) => updatePaperRow(ci, ai, pi, { rate: Number(e.target.value) })} onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }} className={`${inputClass} col-span-4 sm:col-span-2`} placeholder="Rate/Sheet" />
                                <span className="col-span-3 sm:col-span-2 flex items-center text-sm font-medium text-slate-700 dark:text-slate-300">{formatINR(toNum(p.total))}</span>
                                {r.papers.length > 1 && (
                                  <button onClick={() => removePaperRow(ci, ai, pi)} className="col-span-1 flex items-center justify-center text-slate-400 hover:text-rose-500">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            ))}
                            <button onClick={() => addPaperRow(ci, ai)} className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400">
                              <Plus className="h-3 w-3" /> Add Paper
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-right text-xs font-medium text-slate-600 dark:text-slate-400">Client Album Total: {formatINR(computeClientAlbumTotal(client.album_rows))}</p>
                </div>
              )}

              {client.video_rows.length === 0 && client.album_rows.length === 0 && (
                <p className="mt-2 py-2 text-center text-xs text-slate-400">No items added yet — use + Video or + Album above</p>
              )}
            </div>
          ))}
        </div>

        {/* Master Billing */}
        <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Master Billing &amp; Payment</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Total Album Bill (₹)"><input type="number" value={totalAlbumBill || ''} readOnly className={`${inputClass} font-semibold`} /></Field>
            <Field label="Total Video Bill (₹)"><input type="number" value={totalVideoBill || ''} readOnly className={`${inputClass} font-semibold`} /></Field>
            <Field label="Current Order Total (₹)"><input type="number" value={currentOrderTotal || ''} readOnly className={`${inputClass} font-semibold`} /></Field>
            <Field label="Back Due (₹)"><input type="number" value={backDue} onChange={(e) => setBackDue(e.target.value)} onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }} className={inputClass} placeholder="0" /></Field>
            <Field label="Master Total (₹)"><input type="number" value={masterTotal || ''} readOnly className={`${inputClass} font-semibold`} /></Field>
            <Field label="Advance Paid (₹)"><input type="number" value={advancePaid} onChange={(e) => setAdvancePaid(e.target.value)} onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }} className={inputClass} placeholder="0" /></Field>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Net Final Due (₹)">
              <input type="number" value={netFinalDue || ''} readOnly className={`${inputClass} font-bold ${netFinalDue > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
            </Field>
            <Field label="Promised Delivery Date">
              <input type="date" value={promisedDeliveryDate} onChange={(e) => setPromisedDeliveryDate(e.target.value)} className={inputClass} />
            </Field>
          </div>
        </div>

        {/* Storage Locations */}
        <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white"><HardDrive className="h-4 w-4 text-slate-500" /> Storage Location</h3>
            <button onClick={() => setStorageLocations((prev) => [...prev, { ...EMPTY_STORAGE_LOCATION, id: uid() }])} className="flex items-center gap-1 rounded-lg bg-slate-500/10 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-500/20 dark:text-slate-400">
              <Plus className="h-3.5 w-3.5" /> Add Location
            </button>
          </div>
          {(() => {
            const studioOrProject = studioName || projectName || '';
            const clientNames = clients.map((c) => c.client_name.trim()).filter(Boolean);
            return storageLocations.length === 0 ? (
              <p className="py-2 text-center text-xs text-slate-400">No storage locations added — click + Add Location</p>
            ) : (
              <div className="space-y-2">
                {storageLocations.map((loc, si) => (
                  <div key={loc.id} className="rounded-lg border border-slate-200 p-2.5 dark:border-white/10">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                      <Field label="PC / Device">
                        <select value={loc.device} onChange={(e) => setStorageLocations((prev) => prev.map((l, idx) => idx === si ? { ...l, device: e.target.value } : l))} className={`${selectClass} text-xs`}>
                          <option value="">— Device —</option>
                          {STORAGE_DEVICES.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </Field>
                      <Field label="Drive">
                        <select value={loc.drive} onChange={(e) => setStorageLocations((prev) => prev.map((l, idx) => idx === si ? { ...l, drive: e.target.value } : l))} className={`${selectClass} text-xs`}>
                          <option value="">— Drive —</option>
                          {STORAGE_DRIVES.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </Field>
                      <Field label="Work">
                        <select value={loc.work} onChange={(e) => setStorageLocations((prev) => prev.map((l, idx) => idx === si ? { ...l, work: e.target.value } : l))} className={`${selectClass} text-xs`}>
                          <option value="">— Work —</option>
                          {STORAGE_WORK_TYPES.map((w) => <option key={w} value={w}>{w}</option>)}
                        </select>
                      </Field>
                      <Field label="Client">
                        <select value={loc.client_name} onChange={(e) => setStorageLocations((prev) => prev.map((l, idx) => idx === si ? { ...l, client_name: e.target.value } : l))} className={`${selectClass} text-xs`}>
                          <option value="">— Client —</option>
                          {clientNames.map((cn) => <option key={cn} value={cn}>{cn}</option>)}
                        </select>
                      </Field>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <HardDrive className="h-3 w-3 shrink-0" /> {buildStoragePath(loc, studioOrProject) || '—'}
                      </p>
                      <button onClick={() => setStorageLocations((prev) => prev.filter((_, idx) => idx !== si))} className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Payment Section */}
        <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Payment Details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Payment Mode">
              <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={selectClass}>
                <option value="">— Payment Mode —</option>
                {LAB_PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Payment Date"><input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} /></Field>
            <Field label="Transaction ID / UTR / Payer Name / Note"><input value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} className={inputClass} placeholder="e.g. UTR: 123456789" /></Field>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button onClick={handleClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
          <button
            onClick={handleSave}
            disabled={isSubmitting}
            className="flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <><Sparkles className="h-4 w-4 animate-spin" /> Saving...</>
            ) : (
              <>{editing ? 'Update' : 'Create'} Order</>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function buildLabOrderSummaryText(o: StudioLabOrder, settings: StudioSettings | null): string {
  const clientNames = (o.clients ?? []).map((c) => c.client_name || '—').join(', ');
  return (
    `${settings?.production_title ?? 'Bollywood Umang Production'}\n` +
    `Bill No: ${o.order_no}\n` +
    `Date: ${formatDate(o.created_at)}\n\n` +
    `Studio: ${o.studio_name || '—'}\n` +
    `Mobile: ${o.studio_mobile || '—'}\n` +
    (o.partner_name ? `Partner: ${o.partner_name}\n` : '') +
    `Clients: ${clientNames || '—'}\n` +
    `Project: ${o.project_name || '—'}\n\n` +
    `Total Video Bill: ${formatINR(toNum(o.total_video_bill))}\n` +
    `Total Album Bill: ${formatINR(toNum(o.total_album_bill))}\n` +
    `Current Order Total: ${formatINR(toNum(o.current_order_total))}\n` +
    `Back Due: ${formatINR(toNum(o.previous_back_due))}\n` +
    `Master Total: ${formatINR(toNum(o.master_total))}\n` +
    `Advance Paid: ${formatINR(toNum(o.advance_paid))}\n` +
    `Balance Due: ${formatINR(toNum(o.net_final_due))}\n` +
    `Status: ${o.order_status} · Delivery: ${o.delivery_mode}` +
    (o.parcel_tracking_details ? `\nTracking: ${o.parcel_tracking_details}` : '') +
    `\n`
  );
}

function LabOrderSuccessModal({ order, onClose, onView }: { order: StudioLabOrder; onClose: () => void; onView: () => void }) {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handlePrint = () => {
    setTimeout(() => window.print(), 300);
  };

  const handleWhatsApp = () => {
    sendLabWhatsApp(order, settings);
  };

  const handleCopySummary = async () => {
    const text = buildLabOrderSummaryText(order, settings);
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
            Order <span className="font-semibold text-slate-900 dark:text-white">{order.order_no}</span> for <span className="font-semibold text-slate-900 dark:text-white">{order.studio_name}</span> has been saved.
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

function PrintTrigger({ order, onDone }: { order: StudioLabOrder; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => {
      window.print();
      onDone();
    }, 300);
    return () => clearTimeout(t);
  }, [order, onDone]);
  return null;
}

function LabOrderPrintTemplate({ order, settings, compact = false, termsText }: { order: StudioLabOrder; settings: StudioSettings | null; compact?: boolean; termsText?: string }) {
  const s = settings;
  const clients = order.clients ?? [];
  const cn = compact ? 'compact-bill' : '';
  const resolvedTerms = termsText || settings?.production_terms || DEFAULT_PRODUCTION_TERMS;
  const isFullyPaid = Number(order.net_final_due ?? 0) <= 0;
  return (
    <div className={`bill-page bg-white text-black ${cn}`} style={{ userSelect: 'text', padding: compact ? '3mm 4mm' : undefined }}>
      {/* Header */}
      <div className={compact ? "mb-2 flex items-center justify-between border-b-2 border-black pb-2" : "mb-6 flex items-center justify-between border-b-2 border-black pb-4"}>
        <div className="flex items-center gap-2">
          {s?.production_logo_url && (
            <img src={s.production_logo_url} alt="logo" className={compact ? "h-10 w-10 rounded object-cover" : "h-16 w-16 rounded-lg object-cover"} />
          )}
          <div>
            <h1 className={compact ? "text-base font-bold" : "text-2xl font-bold"}>{s?.production_title ?? 'Bollywood Umang Production'}</h1>
            <p className="text-xs">{s?.production_subtitle ?? ''}</p>
            <p className="text-xs">{s?.address ?? ''} · {s?.phone ?? ''}</p>
            {s?.production_insta && <p className="text-xs">{s.production_insta}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className={compact ? "text-xs font-bold" : "text-sm font-bold"}>Bill No: {order.order_no}</p>
          <p className="text-xs">Date: {formatDate(order.created_at)}</p>
        </div>
      </div>

      {/* Party / Studio info */}
      <div className={compact ? "mb-2 flex justify-between text-xs" : "mb-4 flex justify-between text-sm"}>
        <div>
          {order.partner_name && <p><strong>Partner:</strong> {order.partner_name}</p>}
          <p><strong>Studio:</strong> {order.studio_name || '—'}</p>
          <p><strong>Mobile:</strong> {order.studio_mobile || '—'}</p>
          {order.studio_address && <p><strong>Address:</strong> {order.studio_address}</p>}
        </div>
        <div className="text-right">
          <p><strong>Project:</strong> {order.project_name || '—'}</p>
          <p><strong>Work Type:</strong> {order.work_type || '—'}</p>
          <p><strong>Status:</strong> {order.order_status}</p>
          <p><strong>Delivery:</strong> {order.delivery_mode}</p>
          {order.parcel_tracking_details && <p><strong>Tracking:</strong> {order.parcel_tracking_details}</p>}
        </div>
      </div>

      {/* Per-client tables */}
      {clients.map((c, ci) => (
        <div key={c.id} className={compact ? "mb-2" : "mb-4"}>
          <h3 className={compact ? "mb-0.5 text-xs font-bold" : "mb-1 text-sm font-bold"}>Client {ci + 1}: {c.client_name || '—'}{c.event_address ? ` (${c.event_address})` : ''}</h3>
          {c.video_rows.length > 0 && (
            <table className={compact ? "mb-1 w-full border-collapse border border-black text-xs" : "mb-2 w-full border-collapse border border-black text-sm"}>
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-black px-2 py-1 text-left">Video Type</th>
                  <th className="border border-black px-2 py-1 text-left">Quality</th>
                  <th className="border border-black px-2 py-1 text-right">Qty</th>
                  <th className="border border-black px-2 py-1 text-right">Rate</th>
                  <th className="border border-black px-2 py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {c.video_rows.map((v, vi) => (
                  <tr key={vi}>
                    <td className="border border-black px-2 py-1">{v.video_type}</td>
                    <td className="border border-black px-2 py-1">{v.quality}</td>
                    <td className="border border-black px-2 py-1 text-right">{v.qty}</td>
                    <td className="border border-black px-2 py-1 text-right">{formatINR(toNum(v.rate))}</td>
                    <td className="border border-black px-2 py-1 text-right">{formatINR(computeRowTotal(v))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {c.album_rows.length > 0 && (
            <table className={compact ? "mb-1 w-full border-collapse border border-black text-xs" : "mb-2 w-full border-collapse border border-black text-sm"}>
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-black px-2 py-1 text-left">Item / Description</th>
                  <th className="border border-black px-2 py-1 text-right">Sheets / Qty</th>
                  <th className="border border-black px-2 py-1 text-right">Rate</th>
                  <th className="border border-black px-2 py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {c.album_rows.map((a, ai) => (
                  <Fragment key={ai}>
                    <tr>
                      <td className="border border-black px-2 py-1">{a.album_type} ({a.size}) - {a.packaging}</td>
                      <td className="border border-black px-2 py-1 text-right">1</td>
                      <td className="border border-black px-2 py-1 text-right">{formatINR(toNum(a.packaging_rate))}</td>
                      <td className="border border-black px-2 py-1 text-right">{formatINR(toNum(a.packaging_total))}</td>
                    </tr>
                    {a.mini_album && (
                      <tr>
                        <td className="border border-black px-2 py-1 pl-4">↳ Mini Album</td>
                        <td className="border border-black px-2 py-1 text-right">{a.mini_qty}</td>
                        <td className="border border-black px-2 py-1 text-right">{formatINR(toNum(a.mini_rate))}</td>
                        <td className="border border-black px-2 py-1 text-right">{formatINR(toNum(a.mini_total))}</td>
                      </tr>
                    )}
                    {a.papers.map((p, pi) => p.paper_type && (
                      <tr key={pi}>
                        <td className="border border-black px-2 py-1 pl-4">↳ {p.paper_type} Paper</td>
                        <td className="border border-black px-2 py-1 text-right">{p.sheets}</td>
                        <td className="border border-black px-2 py-1 text-right">{formatINR(toNum(p.rate))}</td>
                        <td className="border border-black px-2 py-1 text-right">{formatINR(toNum(p.total))}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {/* Compact: Financial summary + Payment info side-by-side */}
      {compact ? (
        <div className="mb-2 flex justify-between gap-4">
          {(order.payment_mode || order.payment_date || order.payment_note) && (
            <div className="flex-1 text-xs">
              <p className="font-bold">Payment Details:</p>
              {order.payment_mode && <p>Mode: {order.payment_mode}</p>}
              {order.payment_date && <p>Date: {formatDate(order.payment_date)}</p>}
              {order.payment_note && <p>Note: {order.payment_note}</p>}
            </div>
          )}
          <div className="w-48 space-y-0.5 text-xs">
            <div className="flex justify-between"><span>Video Bill:</span><span>{formatINR(toNum(order.total_video_bill))}</span></div>
            <div className="flex justify-between"><span>Album Bill:</span><span>{formatINR(toNum(order.total_album_bill))}</span></div>
            <div className="flex justify-between border-t border-black pt-0.5"><span>Order Total:</span><span>{formatINR(toNum(order.current_order_total))}</span></div>
            <div className="flex justify-between"><span>Back Due:</span><span>{formatINR(toNum(order.previous_back_due))}</span></div>
            <div className="flex justify-between"><span>Master Total:</span><span>{formatINR(toNum(order.master_total))}</span></div>
            <div className="flex justify-between"><span>Advance:</span><span>- {formatINR(toNum(order.advance_paid))}</span></div>
            <div className="flex justify-between border-t-2 border-black pt-0.5 font-bold"><span>Net Due:</span><span>{formatINR(toNum(order.net_final_due))}</span></div>
          </div>
        </div>
      ) : (
        <>
          {/* Financial summary */}
          <div className="ml-auto w-64 space-y-1 text-sm">
            <div className="flex justify-between"><span>Total Video Bill:</span><span>{formatINR(toNum(order.total_video_bill))}</span></div>
            <div className="flex justify-between"><span>Total Album Bill:</span><span>{formatINR(toNum(order.total_album_bill))}</span></div>
            <div className="flex justify-between border-t border-black pt-1"><span>Current Order Total:</span><span>{formatINR(toNum(order.current_order_total))}</span></div>
            <div className="flex justify-between"><span>Back Due:</span><span>{formatINR(toNum(order.previous_back_due))}</span></div>
            <div className="flex justify-between"><span>Master Total:</span><span>{formatINR(toNum(order.master_total))}</span></div>
            <div className="flex justify-between"><span>Advance Paid:</span><span>- {formatINR(toNum(order.advance_paid))}</span></div>
            <div className="flex justify-between border-t-2 border-black pt-1 font-bold"><span>Net Final Due:</span><span>{formatINR(toNum(order.net_final_due))}</span></div>
          </div>

          {/* Payment info */}
          {(order.payment_mode || order.payment_date || order.payment_note) && (
            <div className="mt-4 border-t border-black pt-2 text-xs">
              <p className="font-bold">Payment Details:</p>
              {order.payment_mode && <p>Mode: {order.payment_mode}</p>}
              {order.payment_date && <p>Date: {formatDate(order.payment_date)}</p>}
              {order.payment_note && <p>Note: {order.payment_note}</p>}
            </div>
          )}
        </>
      )}

      {/* Footer: UPI QR + Stamp + Signature */}
      <div className={compact ? "mt-2 flex items-end justify-between border-t border-black pt-1" : "mt-6 flex items-end justify-between border-t border-black pt-4"}>
        <div className="flex flex-col items-center gap-0.5">
          {s?.upi_id ? (
            <>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=upi://pay?pa=${encodeURIComponent(s.upi_id)}`}
                alt="UPI QR"
                className={compact ? "h-16 w-16" : "h-28 w-28"}
              />
              <p className="text-[10px] font-semibold">Scan to Pay via UPI</p>
              <p className="text-[10px]">{s.upi_id}</p>
            </>
          ) : (
            <p className="text-[10px] text-gray-500">UPI ID not configured</p>
          )}
        </div>
        {s?.stamp_image_url && (
          <img src={s.stamp_image_url} alt="stamp" className={compact ? "h-12 w-12 rounded-full object-cover opacity-80" : "h-20 w-20 rounded-full object-cover opacity-80"} />
        )}
        <div className="flex flex-col items-center justify-center">
          <div className={`relative flex h-24 w-24 items-center justify-center rounded-full border-[3px] text-center shadow-inner ${isFullyPaid ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-sky-600 bg-amber-50 text-sky-700'}`}>
            <div className="absolute inset-2 rounded-full border border-current/70" />
            <div className="absolute inset-x-1 top-3 text-[7px] font-bold uppercase leading-tight tracking-[0.12em]">BOLLYWOOD UMANG PRODUCTION</div>
            <div className="absolute inset-x-0 bottom-7 text-center text-[15px] font-black tracking-widest">{isFullyPaid ? 'PAID' : 'CONFIRMED'}</div>
            <div className="absolute inset-x-0 bottom-2 text-center text-[7px] font-semibold uppercase tracking-[0.12em]">{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          </div>
        </div>
        {compact && (
          <div className="text-right text-xs">
            <div className="border-t border-black pt-0.5 px-2">Production Signature</div>
          </div>
        )}
      </div>

      {/* Terms */}
      {(resolvedTerms) && (
        <div className={compact ? "mt-1 border-t border-black pt-0.5" : "mt-4 border-t border-black pt-2"}>
          <p className={compact ? "mb-0 text-[10px] font-bold" : "mb-1 text-xs font-bold"}>Production &amp; Lab Terms &amp; Conditions:</p>
          <div className={compact ? "whitespace-pre-line text-[10px] text-gray-700 max-h-12 overflow-hidden" : "whitespace-pre-line text-xs text-gray-700"}>{resolvedTerms}</div>
        </div>
      )}
    </div>
  );
}
