import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Sparkles,
  Camera,
  TrendingUp,
  TrendingDown,
  MinusCircle,
  Trash2,
  Archive,

  FolderArchive,
  Pencil,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  Users,
  Eye,
  EyeOff,
  KeyRound,
  CheckCircle2,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type {
  Booking,
  PhotographerLedgerEntry,
  LedgerEntryType,
  Partner,
  PartnerCategory,
  PartnerStatus,
  DirectTransaction,
  DirectTxnType,
} from '@/lib/types';
import { formatINR, formatDate, todayISO } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import {
  LEDGER_ENTRY_TYPES,
  LEDGER_ENTRY_LABELS,
  PAYMENT_MODES,
  PARTNER_CATEGORIES,
  DIRECT_TXN_TYPES,
  DIRECT_TXN_MODES,
  TRASH_RETENTION_DAYS,
} from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, inputClass, selectClass, textareaClass } from '@/components/ui/Field';
import { PinInput } from '@/components/ui/PinInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useRefresh } from '@/context/RefreshContext';

const ENTRY_COLORS: Record<LedgerEntryType, 'rose' | 'emerald' | 'sky'> = {
  LAB_WORK_DEBIT: 'rose',
  SHOOT_DUTY_CREDIT: 'emerald',
  PAYMENT_SETTLED: 'sky',
};

const CATEGORY_COLORS: Record<PartnerCategory, 'amber' | 'sky' | 'slate'> = {
  'Studio Freelancer': 'amber',
  'Photographer Freelancer': 'sky',
  'Other': 'slate',
};

type LedgerView = 'main' | 'on_leave' | 'inactive' | 'archived' | 'trash';
type LedgerTab = 'active' | 'on_leave' | 'inactive' | 'clients' | 'archived' | 'recycle_bin';

type PartnerLifecycleRecord = Partner & { isArchived?: boolean; isDeleted?: boolean };

const hasPartnerArchiveFlag = (partner: Partner) => (partner as PartnerLifecycleRecord).isArchived === true;
const hasPartnerDeleteFlag = (partner: Partner) => (partner as PartnerLifecycleRecord).isDeleted === true;
const isRecycledPartner = (partner: Partner) => hasPartnerDeleteFlag(partner) || partner.status === 'Trash' || !!partner.trashed_at;
const isArchivedPartner = (partner: Partner) => !isRecycledPartner(partner) && (hasPartnerArchiveFlag(partner) || partner.status === 'Archived');
export const isActivePartner = (p: any) => {
  if (p.isDeleted || p.isArchived) return false;
  const s = (p.status || '').trim().toLowerCase();
  return !s || s === 'active';
};
export const isOnLeavePartner = (p: any) => {
  if (p.isDeleted || p.isArchived) return false;
  const s = (p.status || '').trim().toLowerCase();
  return s === 'on leave' || s === 'on_leave';
};
export const isInactivePartner = (p: any) => {
  if (p.isDeleted || p.isArchived) return false;
  const s = (p.status || '').trim().toLowerCase();
  return s === 'left studio / inactive' || s === 'inactive' || s === 'left studio';
};


interface BookingClientLedgerEntry {
  id: string;
  client_id?: string | null;
  booking_id?: string | null;
  entity_type?: string | null;
  entry_type?: string | null;
  amount: number;
  description?: string | null;
  date?: string | null;
  reference_order_id?: string | null;
  created_at?: string | null;
}
interface BookingClientSummary {
  id: string;
  booking_id: string;
  client_name: string;
  phone: string;
  event_name: string;
  event_tag: string;
  event_date: string;
  debit: number;
  credit: number;
  balance: number;
  payments: BookingClientLedgerEntry[];
}
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysRemaining(trashedAt: string | null): number {
  if (!trashedAt) return TRASH_RETENTION_DAYS;
  const trashed = new Date(trashedAt).getTime();
  if (isNaN(trashed)) return TRASH_RETENTION_DAYS;
  const elapsed = Math.floor((Date.now() - trashed) / MS_PER_DAY);
  return Math.max(0, TRASH_RETENTION_DAYS - elapsed);
}

function purgeExpiredPartners(allPartners: Partner[]): Partner[] {
  return allPartners.filter((p) => {
    if (p.status !== 'Trash' || !p.trashed_at) return true;
    return daysRemaining(p.trashed_at) > 0;
  });
}

function isDemoRecord(row: { id?: string | null; is_demo?: boolean; isDemo?: boolean; order_no?: string | null }): boolean {
  const id = String(row.id ?? '').toLowerCase();
  const orderNo = String(row.order_no ?? '').toLowerCase();
  return row.is_demo === true || row.isDemo === true || id.startsWith('demo-') || orderNo.startsWith('demo-');
}

interface PartnerBalance {
  partner: Partner;
  totalCredit: number;
  totalDebit: number;
  totalSettled: number;
  directGiven: number;
  directReceived: number;
  labCredit: number;
  labDebit: number;
  balance: number;
}

export function Ledger({ mode = 'ledger' }: { mode?: 'ledger' | 'partners'; onNavigate?: (page: import('@/lib/types').PageKey) => void }) {
  const { toast } = useToast();
  const { settings } = useSettings();
  const { refreshToken } = useRefresh();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<PhotographerLedgerEntry[]>([]);
  const [directTxns, setDirectTxns] = useState<DirectTransaction[]>([]);
  const [clientLedgerEntries, setClientLedgerEntries] = useState<BookingClientLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<LedgerTab>(mode === 'partners' ? 'active' : 'clients');
  const [view, setView] = useState<LedgerView>('main');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [showDirectTxn, setShowDirectTxn] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [settlePartner, setSettlePartner] = useState<Partner | null>(null);

  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [trashId, setTrashId] = useState<string | null>(null);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: p }, { data: le }, { data: dt }, { data: bookingData }, { data: labData }, { data: clientLedgerData }] = await Promise.all([
      supabase.from('partners').select('*').order('created_at'),
      supabase.from('photographer_ledger').select('*').order('created_at'),
      supabase.from('direct_transactions').select('*').order('created_at'),
      supabase.from('bookings').select('*').order('shoot_date'),
      supabase.from('studio_lab_orders').select('*').order('created_at'),
      supabase.from('ledger_entries').select('*').order('date'),
    ]);
    const allPartners = (p ?? []) as Partner[];
    const expired = allPartners.filter((partner) => partner.status === 'Trash' && partner.trashed_at && daysRemaining(partner.trashed_at) <= 0);
    if (expired.length > 0) {
      for (const partner of expired) {
        await supabase.from('direct_transactions').delete().eq('partner_id', partner.id);
        await supabase.from('photographer_ledger').delete().eq('mobile', partner.mobile);
        await supabase.from('partners').delete().eq('id', partner.id);
      }
    }
    const surviving = expired.length > 0 ? purgeExpiredPartners(allPartners) : allPartners;
    setPartners(surviving.filter((partner) => !isDemoRecord(partner)));
    setBookings(((bookingData ?? []) as Booking[]).filter((booking) => !isDemoRecord(booking)));
    setLabOrders(((labData ?? []) as any[]).filter((order) => !isDemoRecord(order)));
    setLedgerEntries(((le ?? []) as PhotographerLedgerEntry[]).filter((entry) => !isDemoRecord(entry)));
    setDirectTxns(((dt ?? []) as DirectTransaction[]).filter((txn) => !isDemoRecord(txn)));
    setClientLedgerEntries(((clientLedgerData ?? []) as BookingClientLedgerEntry[]).filter((entry) => !isDemoRecord(entry)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshToken]);

  const balances = useMemo<PartnerBalance[]>(() => {
    return partners.map((partner) => {
      const mobile = partner.mobile;
      const pLedger = ledgerEntries.filter((e) => e.mobile === mobile);
      const pDirect = directTxns.filter((d) => d.partner_id === partner.id);
      const partnerName = (partner.name ?? '').trim().toLowerCase();
      const activeLabOrders = (labOrders ?? []).filter((order) => {
        if (order.deleted_at || order.archived_at) return false;
        if (order.partner_id && partner.id && order.partner_id === partner.id) return true;
        const orderPartner = (order.partner_name ?? order.studio_name ?? '').trim().toLowerCase();
        return !!orderPartner && orderPartner === partnerName;
      });

      const totalCredit = pLedger.filter((e) => e.entry_type === 'SHOOT_DUTY_CREDIT').reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const totalDebit = pLedger.filter((e) => e.entry_type === 'LAB_WORK_DEBIT').reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const totalSettled = pLedger.filter((e) => e.entry_type === 'PAYMENT_SETTLED').reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const directGiven = pDirect.filter((d) => d.txn_type === 'Given').reduce((s, d) => s + Number(d.amount ?? 0), 0);
      const directReceived = pDirect.filter((d) => d.txn_type === 'Received').reduce((s, d) => s + Number(d.amount ?? 0), 0);
      const labCredit = activeLabOrders.reduce((s, order) => s + Number(order.advance_paid ?? 0), 0);
      const labDebit = activeLabOrders.reduce((s, order) => s + Number(order.current_order_total ?? 0) + Number(order.previous_back_due ?? order.back_due ?? 0), 0);

      const balance = totalCredit + directReceived + labCredit - totalDebit - totalSettled - directGiven - labDebit;

      return { partner, totalCredit, totalDebit, totalSettled, directGiven, directReceived, labCredit, labDebit, balance };
    });
  }, [partners, ledgerEntries, directTxns, labOrders]);

  const filteredBalances = useMemo(() => {
    const q = search.toLowerCase().trim();
    const seenMobiles = new Set<string>();
    return balances.filter((b) => {
      const mobileKey = (b.partner.mobile ?? '').trim();
      const matchesView =
        view === 'main' ? isActivePartner(b.partner) :
        view === 'on_leave' ? isOnLeavePartner(b.partner) :
        view === 'inactive' ? isInactivePartner(b.partner) :
        view === 'archived' ? isArchivedPartner(b.partner) :
        isRecycledPartner(b.partner);
      const matchesCategory = categoryFilter === 'all' || b.partner.category === categoryFilter;
      const matchesSearch = !q || (b.partner.name ?? '').toLowerCase().includes(q) || (b.partner.mobile ?? '').includes(q);
      if (!matchesView || !matchesCategory || !matchesSearch || seenMobiles.has(mobileKey)) return false;
      seenMobiles.add(mobileKey);
      return true;
    });
  }, [balances, view, categoryFilter, search]);

  const bookingClientSummaries = useMemo<BookingClientSummary[]>(() => {
    const normalizePhone = (value?: string | null) => (value ?? '').replace(/\D/g, '');
    const normalizeText = (value?: string | null) => (value ?? '').trim().toLowerCase();
    const activeBookings = bookings.filter((booking) => !booking.deleted_at && !booking.archived_at);

    const grouped = new Map<string, {
      client_name: string;
      phone: string;
      event_name: string;
      event_tag: string;
      event_date: string;
      booking_ids: Set<string>;
      debit: number;
      credit: number;
      payments: BookingClientLedgerEntry[];
      primary_booking_id: string;
    }>();

    activeBookings.forEach((booking) => {
      const rawClientId = (booking as Booking & { client_id?: string | null }).client_id;
      const clientKey = rawClientId
        ? `client_id:${String(rawClientId)}`
        : (() => {
            const phone = normalizePhone(booking.client_mobile);
            if (phone) return `phone:${phone}`;
            const name = normalizeText(booking.client_name);
            return name ? `name:${name}` : `booking:${booking.id}`;
          })();

      const existing = grouped.get(clientKey) ?? {
        client_name: booking.client_name || 'Client',
        phone: booking.client_mobile || '—',
        event_name: booking.event_function || 'Booking',
        event_tag: (booking.event_function || 'Booking').split(',')[0].trim() || 'Booking',
        event_date: booking.shoot_date || '',
        booking_ids: new Set<string>(),
        debit: 0,
        credit: 0,
        payments: [],
        primary_booking_id: booking.id,
      };

      existing.booking_ids.add(booking.id);
      existing.debit += Number(booking.total_amount ?? 0);
      existing.credit += Number(booking.advance_paid ?? 0);
      existing.client_name = existing.client_name || booking.client_name || 'Client';
      existing.phone = existing.phone === '—' && booking.client_mobile ? booking.client_mobile : existing.phone;
      if (!existing.event_name || existing.event_name === 'Booking' || existing.event_name === 'Multiple Events') {
        existing.event_name = booking.event_function || 'Booking';
      }
      if (!existing.event_tag || existing.event_tag === 'Booking') {
        existing.event_tag = (booking.event_function || 'Booking').split(',')[0].trim() || 'Booking';
      }
      if (!existing.event_date || existing.event_date < booking.shoot_date) {
        existing.event_date = booking.shoot_date || existing.event_date;
      }
      if (booking.shoot_date && new Date(booking.shoot_date).getTime() > new Date(existing.event_date || booking.shoot_date).getTime()) {
        existing.primary_booking_id = booking.id;
      }

      grouped.set(clientKey, existing);
    });

    return Array.from(grouped.entries()).map(([clientKey, clientSummary]) => {
      const bookingIds = Array.from(clientSummary.booking_ids);
      const bookingEntries = clientLedgerEntries.filter((entry) => {
        const matchesClient = Boolean(entry.client_id && entry.client_id === clientKey);
        const matchesBooking = Boolean(entry.booking_id && bookingIds.includes(entry.booking_id));
        return entry.entity_type === 'CLIENT' && (matchesClient || matchesBooking);
      });

      const additionalCredit = bookingEntries
        .filter((entry) => (entry.entry_type ?? '').toUpperCase() === 'CREDIT')
        .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);

      const debit = clientSummary.debit;
      const credit = clientSummary.credit + additionalCredit;
      const payments = [...bookingEntries].sort((a, b) => String(b.date ?? b.created_at ?? '').localeCompare(String(a.date ?? a.created_at ?? '')));

      const primaryBooking = activeBookings.find((booking) => booking.id === clientSummary.primary_booking_id) ?? activeBookings[0];
      const primaryEventName = primaryBooking?.event_function || clientSummary.event_name || 'Booking';
      const primaryEventTag = (primaryEventName || 'Booking').split(',')[0].trim() || 'Booking';

      return {
        id: clientKey,
        booking_id: clientSummary.primary_booking_id,
        client_name: clientSummary.client_name,
        phone: clientSummary.phone,
        event_name: bookingIds.length > 1 ? 'Multiple Events' : primaryEventName,
        event_tag: bookingIds.length > 1 ? 'Multi Booking' : primaryEventTag,
        event_date: clientSummary.event_date,
        debit,
        credit,
        balance: debit - credit,
        payments,
      };
    });
  }, [bookings, clientLedgerEntries]);

  const filteredBookingClients = useMemo(() => {
    const q = search.toLowerCase().trim();
    return bookingClientSummaries.filter((client) => {
      const matchesSearch = !q ||
        (client.client_name ?? '').toLowerCase().includes(q) ||
        (client.phone ?? '').includes(q) ||
        (client.event_name ?? '').toLowerCase().includes(q) ||
        (client.event_tag ?? '').toLowerCase().includes(q);
      return matchesSearch;
    });
  }, [bookingClientSummaries, search]);

  const activePartners = filteredBalances.filter((b) => isActivePartner(b.partner));
  const onLeavePartners = balances.filter((b) => isOnLeavePartner(b.partner));
  const inactiveFolderPartners = balances.filter((b) => isInactivePartner(b.partner));
  const archivedFolderPartners = balances.filter((b) => isArchivedPartner(b.partner));
  const recycledPartners = balances.filter((b) => isRecycledPartner(b.partner));
  const inactivePartners: PartnerBalance[] = [];

  const updatePartnerStatus = async (id: string, newStatus: PartnerStatus, extra?: Record<string, any>) => {
    await supabase.from('partners').update({ ...extra, status: newStatus }).eq('id', id);
    load();
  };

  const handleArchive = async () => {
    if (!archiveId) return;
    await updatePartnerStatus(archiveId, 'Archived');
    toast('Partner archived', 'success');
    setArchiveId(null);
  };

  const handleMoveToTrash = async () => {
    if (!trashId) return;
    await updatePartnerStatus(trashId, 'Trash', { trashed_at: new Date().toISOString() });
    toast(`Partner moved to Recycle Bin — auto-deletes after ${TRASH_RETENTION_DAYS} days`, 'success');
    setTrashId(null);
  };

  const handlePermanentDelete = async () => {
    if (!permanentDeleteId) return;
    if (settings?.master_pin) {
      const enteredPin = window.prompt('Enter Master PIN to permanently delete this partner and ledger history:');
      if (enteredPin !== settings.master_pin) {
        toast('Incorrect Master PIN', 'error');
        return;
      }
    }
    const partner = partners.find((p) => p.id === permanentDeleteId);
    if (partner) {
      await supabase.from('direct_transactions').delete().eq('partner_id', permanentDeleteId);
      await supabase.from('photographer_ledger').delete().eq('mobile', partner.mobile);
    }
    await supabase.from('partners').delete().eq('id', permanentDeleteId);
    toast('Partner permanently deleted', 'success');
    setPermanentDeleteId(null);
    load();
  };

  const partnerDirectTxns = (pid: string) => directTxns.filter((txn) => txn.partner_id === pid);
  const partnerLedger = (mobile: string) => ledgerEntries.filter((entry) => entry.mobile === mobile);

  const setPartnerTab = (tab: Exclude<LedgerTab, 'clients'>) => {
    setActiveTab(tab);
    if (tab === 'active') { setView('main'); setCategoryFilter('all'); }
    if (tab === 'on_leave') { setView('on_leave'); setCategoryFilter('all'); }
    if (tab === 'inactive') { setView('inactive'); setCategoryFilter('all'); }
    if (tab === 'archived') { setView('archived'); setCategoryFilter('all'); }
    if (tab === 'recycle_bin') { setView('trash'); setCategoryFilter('all'); }
  };

  const [quickPayClient, setQuickPayClient] = useState<BookingClientSummary | null>(null);
  const [statementClient, setStatementClient] = useState<BookingClientSummary | null>(null);

  return (
    <div className="flex h-full w-full flex-col space-y-5 overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{mode === 'partners' ? 'Partners' : 'Ledger'}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{mode === 'partners' ? 'Manage studio partners' : 'Studio accounts & client transactions'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === 'partners' && <button
            type="button"
            onClick={() => {
              setEditingPartner(null);
              setShowPartnerForm(true);
            }}
            className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
          >
            <Plus className="h-4 w-4" /> Add Partner
          </button>}
          {mode === 'ledger' && <button
            type="button"
            onClick={() => setShowDirectTxn(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <Wallet className="h-4 w-4" /> Quick Entry
          </button>}
        </div>
      </div>

      {mode === 'partners' && <div className="flex flex-nowrap gap-2 overflow-x-auto">
        <TabButton active={activeTab === 'active'} onClick={() => setPartnerTab('active')} icon={Users} label="Active Partners" count={activePartners.length} />
        <TabButton active={activeTab === 'on_leave'} onClick={() => setPartnerTab('on_leave')} icon={Users} label="On Leave" count={onLeavePartners.length} />
        <TabButton active={activeTab === 'inactive'} onClick={() => setPartnerTab('inactive')} icon={Users} label="Inactive / Left Studio" count={inactiveFolderPartners.length} />
        <TabButton active={activeTab === 'archived'} onClick={() => setPartnerTab('archived')} icon={FolderArchive} label="Archived" count={archivedFolderPartners.length} />
        <TabButton active={activeTab === 'recycle_bin'} onClick={() => setPartnerTab('recycle_bin')} icon={Trash2} label="Recycle Bin" count={recycledPartners.length} />
      </div>}

      {/* Filters */}
      {mode === 'partners' && <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or mobile..."
            className={`${inputClass} pl-10`}
          />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={`${selectClass} w-48`}>
          <option value="all">All Categories</option>
          {PARTNER_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>}

      {loading ? (
        <div className="flex justify-center py-20"><Sparkles className="h-6 w-6 animate-pulse text-amber-500" /></div>
      ) : mode === 'ledger' ? (
        <StudioLedgerTable
          clients={filteredBookingClients}
          onPayment={(client) => setQuickPayClient(client)}
          onViewStatement={(client) => setStatementClient(client)}
        />
      ) : view === 'main' ? (
        <MainView
          active={activePartners}
          inactive={inactivePartners}
          onOpen={(partner) => setSelectedPartner(partner)}
          onEdit={(p) => { setEditingPartner(p); setShowPartnerForm(true); }}
          onArchive={(id) => setArchiveId(id)}
        />
      ) : view === 'on_leave' ? (
        <ArchivedView
          items={filteredBalances}
          onOpen={(partner) => setSelectedPartner(partner)}
          onEdit={(p) => { setEditingPartner(p); setShowPartnerForm(true); }}
          onRestore={(id) => { updatePartnerStatus(id, 'Active', { trashed_at: null }); toast('Partner restored to Active', 'success'); }}
          onTrash={(id) => setTrashId(id)}
          title="No partners on leave"
        />
      ) : view === 'inactive' ? (
        <ArchivedView
          items={filteredBalances}
          onOpen={(partner) => setSelectedPartner(partner)}
          onEdit={(p) => { setEditingPartner(p); setShowPartnerForm(true); }}
          onRestore={(id) => { updatePartnerStatus(id, 'Active', { trashed_at: null }); toast('Partner restored to Active', 'success'); }}
          onTrash={(id) => setTrashId(id)}
          title="No inactive partners"
        />
      ) : view === 'archived' ? (
        <ArchivedView
          items={filteredBalances}
          onOpen={(partner) => setSelectedPartner(partner)}
          onEdit={(p) => { setEditingPartner(p); setShowPartnerForm(true); }}
          onRestore={(id) => { updatePartnerStatus(id, 'Active', { trashed_at: null }); toast('Partner restored to Active', 'success'); }}
          onTrash={(id) => setTrashId(id)}
          title="No archived partners"
        />
      ) : (
        <TrashView
          items={filteredBalances}
          onOpen={(partner) => setSelectedPartner(partner)}
          onEdit={(p) => { setEditingPartner(p); setShowPartnerForm(true); }}
          onRestore={(id) => { updatePartnerStatus(id, 'Active'); toast('Partner restored from Recycle Bin', 'success'); }}
          onPermanentDelete={(id) => setPermanentDeleteId(id)}
        />
      )}

      {quickPayClient && (
        <BookingClientQuickPayModal
          client={quickPayClient}
          onClose={() => setQuickPayClient(null)}
          onSaved={(entry) => {
            setClientLedgerEntries((current) => [entry, ...current]);
            setQuickPayClient(null);
          }}
        />
      )}

      {statementClient && (
        <BookingClientStatementModal
          client={statementClient}
          onClose={() => setStatementClient(null)}
        />
      )}

      {mode === 'partners' && <PartnerForm
          open={showPartnerForm}
          onClose={() => setShowPartnerForm(false)}
          onSaved={(savedPartner) => {
            setShowPartnerForm(false);
            if (savedPartner) {
              setPartners((current) => current.map((partner) => partner.id === savedPartner.id ? savedPartner : partner));
            } else {
              load();
            }
          }}
          editing={editingPartner}
          existing={partners}
        />}

      {mode === 'ledger' && <DirectTxnModal
          open={showDirectTxn}
          onClose={() => setShowDirectTxn(false)}
          onSaved={() => { setShowDirectTxn(false); load(); }}
          partners={partners.filter((p) => p.status === 'Active' || p.status === 'Inactive')}
        />}

      {mode === 'partners' && selectedPartner && (
        <PartnerDetailModal
          partner={selectedPartner}
          directTxns={partnerDirectTxns(selectedPartner.id)}
          ledgerEntries={partnerLedger(selectedPartner.mobile)}
          onClose={() => setSelectedPartner(null)}
          onSettle={() => setSettlePartner(selectedPartner)}
          onUpdated={(partner) => { setSelectedPartner(partner); load(); }}
        />
      )}

      {mode === 'partners' && settlePartner && (
        <SettlementModal
          partner={settlePartner}
          onClose={() => setSettlePartner(null)}
          onSaved={() => { setSettlePartner(null); setSelectedPartner(null); load(); }}
        />
      )}

      {mode === 'partners' && <ConfirmDialog
        open={!!archiveId}
        onClose={() => setArchiveId(null)}
        onConfirm={handleArchive}
        title="Archive Partner"
        message="This partner will be moved to the Archived folder. You can restore them anytime."
        confirmLabel="Archive"
      />}
      {mode === 'partners' && <ConfirmDialog
        open={!!trashId}
        onClose={() => setTrashId(null)}
        onConfirm={handleMoveToTrash}
        title="Move to Recycle Bin"
        message={`This partner will be moved to the Recycle Bin. All historical ledger entries are retained. The partner will be automatically and permanently deleted after ${TRASH_RETENTION_DAYS} days unless restored. You can also delete immediately. Restore is available anytime within the retention window.`}
        confirmLabel="Move to Bin"
        danger
      />}
      {mode === 'partners' && <ConfirmDialog
        open={!!permanentDeleteId}
        onClose={() => setPermanentDeleteId(null)}
        onConfirm={handlePermanentDelete}
        title="Permanently Delete"
        message="This will permanently delete the partner AND all their ledger entries and direct transactions. This cannot be undone."
        confirmLabel="Delete Forever"
        danger
      />}
    </div>
  );
}
export function Partners() {
  return <Ledger mode="partners" />;
}

function PartnerDetailModal({ partner, directTxns, ledgerEntries, onClose, onSettle, onUpdated }: {
  partner: Partner;
  directTxns: DirectTransaction[];
  ledgerEntries: PhotographerLedgerEntry[];
  onClose: () => void;
  onSettle: () => void;
  onUpdated: (partner: Partner) => void;
}) {
  const { toast } = useToast();
  const [showPwd, setShowPwd] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [togglingLogin, setTogglingLogin] = useState(false);
  const [editingPin, setEditingPin] = useState(false);
  const [editPinValue, setEditPinValue] = useState('');

  const handleResetPassword = async () => {
    setResetting(true);
    const defaultPin = partner.mobile.slice(-4);
    const { data, error } = await supabase.from('partners').update({ portal_password: defaultPin, password_changed: false }).eq('id', partner.id).select().single();
    setResetting(false);
    if (error || !data) { toast('Failed to reset PIN', 'error'); return; }
    onUpdated(data as Partner);
    toast('PIN reset to default (last 4 digits of mobile)', 'success');
  };

  const saveEditedPin = async () => {
    if (editPinValue.length !== 4) { toast('PIN must be exactly 4 digits', 'error'); return; }
    const { data, error } = await supabase.from('partners').update({ portal_password: editPinValue, password_changed: true }).eq('id', partner.id).select().single();
    if (error || !data) { toast('Failed to update PIN', 'error'); return; }
    onUpdated(data as Partner);
    setEditingPin(false);
    setEditPinValue('');
    toast('Access PIN updated', 'success');
  };

  const handleToggleLogin = async () => {
    setTogglingLogin(true);
    const newVal = !partner.is_login_allowed;
    const { data, error } = await supabase.from('partners').update({ is_login_allowed: newVal }).eq('id', partner.id).select().single();
    setTogglingLogin(false);
    if (error || !data) { toast('Failed to update login access', 'error'); return; }
    onUpdated(data as Partner);
    toast(newVal ? 'Portal login enabled for this partner' : 'Portal login disabled for this partner', 'success');
  };

  type UnifiedEntry = { id: string; date: string; label: string; sublabel: string; amount: number; positive: boolean };
  const entries = useMemo<UnifiedEntry[]>(() => {
    const rows: UnifiedEntry[] = [
      ...directTxns.map((txn) => ({ id: txn.id, date: txn.txn_date, label: txn.note || (txn.txn_type === 'Given' ? 'Direct Advance / Given' : 'Direct Received'), sublabel: `Direct · ${txn.payment_mode}`, amount: Number(txn.amount), positive: txn.txn_type === 'Received' })),
      ...ledgerEntries.map((entry) => ({ id: entry.id, date: entry.payment_date || entry.created_at, label: entry.description || LEDGER_ENTRY_LABELS[entry.entry_type], sublabel: `${LEDGER_ENTRY_LABELS[entry.entry_type]}${entry.payment_mode ? ` · ${entry.payment_mode}` : ''}`, amount: Number(entry.amount), positive: entry.entry_type === 'SHOOT_DUTY_CREDIT' })),
    ];
    const unique = new Map<string, UnifiedEntry>();
    rows.forEach((row) => {
      const key = `${row.date}|${row.label}|${row.sublabel}|${row.amount}|${row.positive}`;
      if (!unique.has(key)) unique.set(key, row);
    });
    return [...unique.values()].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [directTxns, ledgerEntries]);
  const totalCredit = entries.filter((entry) => entry.positive).reduce((sum, entry) => sum + entry.amount, 0);
  const totalDebit = entries.filter((entry) => !entry.positive).reduce((sum, entry) => sum + entry.amount, 0);
  let runningBalance = 0;

  return (
    <Modal open={true} onClose={onClose} title={partner.name} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2"><Badge color={CATEGORY_COLORS[partner.category]}>{partner.category}</Badge><Badge color={partner.status === 'Active' ? 'emerald' : partner.status === 'On Leave' ? 'amber' : 'slate'}>{partner.status === 'Inactive' ? 'Left Studio / Inactive' : partner.status}</Badge><span className="text-xs text-slate-500 dark:text-slate-400">{partner.mobile}</span></div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onSettle} className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600"><Wallet className="h-3.5 w-3.5" /> Direct Settle</button>
          <button onClick={handleToggleLogin} disabled={togglingLogin} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${partner.is_login_allowed ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5'}`}><KeyRound className="h-3.5 w-3.5" /> {partner.is_login_allowed ? 'Login Enabled' : 'Login Disabled'}</button>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-amber-500" /><div><p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Access PIN</p>{editingPin ? <div className="mt-1 flex items-center gap-2"><PinInput value={editPinValue} onChange={setEditPinValue} placeholder="0000" /><button onClick={saveEditedPin} className="text-emerald-600" title="Save PIN"><CheckCircle2 className="h-4 w-4" /></button><button onClick={() => { setEditingPin(false); setEditPinValue(''); }} className="text-rose-500" title="Cancel"><X className="h-4 w-4" /></button></div> : <p className="font-mono text-sm text-slate-900 dark:text-white">{showPwd ? (partner.portal_password || partner.mobile.slice(-4)) : '••••'}</p>}</div></div>{!editingPin && <div className="flex items-center gap-2"><button onClick={() => setShowPwd(!showPwd)} className="rounded-lg border border-slate-200 p-2 text-slate-500 dark:border-white/10" title={showPwd ? 'Hide PIN' : 'View PIN'}>{showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button><button onClick={() => { setEditPinValue(partner.portal_password || partner.mobile.slice(-4)); setEditingPin(true); }} className="rounded-lg border border-slate-200 p-2 text-slate-500 dark:border-white/10" title="Edit PIN"><Pencil className="h-3.5 w-3.5" /></button><button onClick={handleResetPassword} disabled={resetting} className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" /> Reset to Default PIN</button></div>}</div></div>
        <div className="grid grid-cols-3 gap-3"><div className="rounded-lg border border-slate-200 p-3 text-center dark:border-white/10"><p className="text-xs text-slate-500 dark:text-slate-400">Total Credit</p><p className="text-sm font-semibold text-emerald-500">{formatINR(totalCredit)}</p></div><div className="rounded-lg border border-slate-200 p-3 text-center dark:border-white/10"><p className="text-xs text-slate-500 dark:text-slate-400">Total Debit</p><p className="text-sm font-semibold text-rose-500">{formatINR(totalDebit)}</p></div><div className="rounded-lg border border-slate-200 p-3 text-center dark:border-white/10"><p className="text-xs text-slate-500 dark:text-slate-400">Balance</p><p className="text-sm font-bold text-slate-500">{formatINR(totalCredit - totalDebit)}</p></div></div>
        <div className="border-t border-slate-200 pt-3 dark:border-white/10"><h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Lifetime Ledger</h4><div className="max-h-[40vh] overflow-auto">{entries.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No transactions yet</p> : <table className="w-full min-w-[680px] text-left text-xs"><thead className="border-b border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400"><tr><th className="px-2 py-2">Date</th><th className="px-2 py-2">Client / Description</th><th className="px-2 py-2">Function / Role</th><th className="px-2 py-2">Credit</th><th className="px-2 py-2">Debit</th><th className="px-2 py-2">Running Due</th></tr></thead><tbody>{entries.map((entry) => { runningBalance += entry.positive ? entry.amount : -entry.amount; return <tr key={entry.id} className="border-b border-slate-100 dark:border-white/5"><td className="px-2 py-2 text-slate-600 dark:text-slate-400">{formatDate(entry.date)}</td><td className="px-2 py-2 text-slate-800 dark:text-slate-200">{entry.label}</td><td className="px-2 py-2 text-slate-600 dark:text-slate-400">{entry.sublabel}</td><td className="px-2 py-2 text-emerald-600">{entry.positive ? formatINR(entry.amount) : '—'}</td><td className="px-2 py-2 text-rose-600">{entry.positive ? '—' : formatINR(entry.amount)}</td><td className="px-2 py-2 font-semibold text-slate-800 dark:text-slate-200">{formatINR(runningBalance)}</td></tr>; })}</tbody></table>}</div></div>
      </div>
    </Modal>
  );
}
function SettlementModal({ partner, onClose, onSaved }: { partner: Partner; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { toast('Enter a valid settlement amount', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('photographer_ledger').insert({ photographer_name: partner.name, mobile: partner.mobile, entry_type: 'PAYMENT_SETTLED', description: note.trim() || 'Direct settlement', amount: value, payment_mode: paymentMode, payment_date: paymentDate });
    setSaving(false);
    if (error) { toast('Failed to record settlement', 'error'); return; }
    toast('Settlement recorded', 'success');
    onSaved();
  };
  return <Modal open={true} onClose={onClose} title={`Settle ${partner.name}`} size="md" dismissible={false}><div className="space-y-4"><Field label="Settlement Amount (₹)"><input type="number" min={0} value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClass} placeholder="0" /></Field><div className="grid grid-cols-2 gap-4"><Field label="Payment Mode"><select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)} className={selectClass}><option>Cash</option><option>UPI</option><option>Bank</option></select></Field><Field label="Payment Date"><input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className={inputClass} /></Field></div><Field label="Remarks"><textarea value={note} onChange={(event) => setNote(event.target.value)} className={textareaClass} placeholder="Optional settlement remarks" /></Field><div className="flex justify-end gap-3"><button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-white/10 dark:text-slate-300">Cancel</button><button onClick={handleSave} disabled={saving} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Record Settlement'}</button></div></div></Modal>;
}

function TabButton({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: typeof Camera; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-amber-500 text-slate-900'
          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-white/5'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
      {count > 0 && (
        <span className={`rounded-full px-1.5 py-0.5 text-xs ${active ? 'bg-slate-900/15' : 'bg-slate-100 dark:bg-white/10'}`}>{count}</span>
      )}
    </button>
  );
}
function StudioLedgerTable({
  clients,
  onPayment,
  onViewStatement,
}: {
  clients: BookingClientSummary[];
  onPayment: (client: BookingClientSummary) => void;
  onViewStatement: (client: BookingClientSummary) => void;
}) {
  if (clients.length === 0) {
    return <EmptyState icon={Wallet} title="No studio ledger transactions found" subtitle="Booking and client transactions will appear here" />;
  }

  let runningDue = 0;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
      <table className="w-full min-w-[920px] text-left text-xs">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
          <tr>
            <th className="px-3 py-3">Date</th>
            <th className="px-3 py-3">Client / Description</th>
            <th className="px-3 py-3">Function / Role</th>
            <th className="px-3 py-3 text-right">Credit</th>
            <th className="px-3 py-3 text-right">Debit</th>
            <th className="px-3 py-3 text-right">Running Due</th>
            <th className="px-3 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => {
            runningDue += client.debit - client.credit;
            return (
              <tr key={client.id} className="border-b border-slate-100 last:border-0 dark:border-white/5">
                <td className="whitespace-nowrap px-3 py-3 text-slate-600 dark:text-slate-400">{formatDate(client.event_date)}</td>
                <td className="px-3 py-3 font-medium text-slate-800 dark:text-slate-200">{client.client_name}</td>
                <td className="px-3 py-3 text-slate-600 dark:text-slate-400">{client.event_name || client.event_tag}</td>
                <td className="px-3 py-3 text-right font-medium text-emerald-600 dark:text-emerald-400">{formatINR(client.credit)}</td>
                <td className="px-3 py-3 text-right font-medium text-rose-600 dark:text-rose-400">{formatINR(client.debit)}</td>
                <td className="px-3 py-3 text-right font-semibold text-slate-800 dark:text-slate-200">{formatINR(runningDue)}</td>
                <td className="px-3 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => onPayment(client)} className="rounded-lg bg-amber-500 px-2.5 py-1.5 font-medium text-slate-900 hover:bg-amber-400">Payment</button>
                    <button onClick={() => onViewStatement(client)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Statement</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BookingClientsView({
  clients,
  onPayment,
  onViewStatement,
}: {
  clients: BookingClientSummary[];
  onPayment: (client: BookingClientSummary) => void;
  onViewStatement: (client: BookingClientSummary) => void;
}) {
  if (clients.length === 0) {
    return <EmptyState icon={Wallet} title="No booking clients found" subtitle="Matching client bookings will appear here" />;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {clients.map((client) => (
        <div key={client.id} className="rounded-2xl border border-slate-200 bg-slate-950/90 p-4 shadow-sm shadow-slate-900/10 dark:border-white/10 dark:bg-slate-900/70">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-white">{client.client_name}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-300">
                <span className="rounded-full bg-amber-500/15 px-2 py-1 font-medium text-amber-300">{client.event_tag}</span>
                <span className="truncate">{client.phone}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 border-y border-white/10 py-3 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400">Debit</p>
              <p className="mt-1 text-sm font-semibold text-rose-300">{formatINR(client.debit)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400">Credit</p>
              <p className="mt-1 text-sm font-semibold text-emerald-300">{formatINR(client.credit)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400">Balance</p>
              <p className={`mt-1 text-sm font-bold ${client.balance > 0 ? 'text-rose-300' : client.balance < 0 ? 'text-emerald-300' : 'text-slate-200'}`}>
                {formatINR(client.balance)}
              </p>
            </div>
          </div>

          <div className={`mt-3 rounded-lg px-3 py-2 text-center text-xs font-medium ${client.balance === 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
            {client.balance === 0 ? 'Fully Settled' : `Client Owes Studio: ${formatINR(client.balance)}`}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => onPayment(client)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-amber-400"
            >
              <Plus className="h-4 w-4" /> Payment
            </button>
            <button
              onClick={() => onViewStatement(client)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-700"
            >
              <Eye className="h-4 w-4" /> Statement
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function BookingClientQuickPayModal({ client, onClose, onSaved }: { client: BookingClientSummary; onClose: () => void; onSaved: (entry: BookingClientLedgerEntry) => void; }) {
  const { toast } = useToast();
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast('Enter a valid payment amount', 'error');
      return;
    }

    setSaving(true);
    const safeId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
    const payload: BookingClientLedgerEntry = {
      id: safeId,
      client_id: client.id,
      booking_id: client.booking_id,
      entity_type: 'CLIENT',
      amount: Number(amount),
      entry_type: 'CREDIT',
      description: `Payment for ${client.event_name || 'Booking'} via ${paymentMode}${note ? ` — Note: ${note}` : ''}`,
      reference_order_id: client.booking_id,
      date: paymentDate,
      created_at: new Date().toISOString(),
    };

    try {
      const { error } = await supabase.from('ledger_entries').insert([{
        client_id: client.id,
        booking_id: client.booking_id,
        entity_type: 'CLIENT',
        amount: Number(paymentAmount),
        entry_type: 'CREDIT',
        description: `Payment for ${client.event_name || 'Booking'} via ${paymentMode}${note ? ` — Note: ${note}` : ''}`,
        reference_order_id: client.booking_id,
        date: paymentDate,
      }]);
      if (error) throw error;
      onSaved(payload);
      toast('Payment recorded', 'success');
      onClose();
    } catch (error) {
      toast('Failed to record payment', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={`Quick Pay — ${client.client_name}`} size="sm" dismissible={false}>
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-white/5">
          <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Deal Amount</span><span className="font-medium text-slate-900 dark:text-white">{formatINR(client.debit)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Paid So Far</span><span className="text-emerald-600 dark:text-emerald-400">{formatINR(client.credit)}</span></div>
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 dark:border-white/10"><span className="font-semibold text-slate-700 dark:text-slate-300">Remaining Due</span><span className="font-bold text-rose-500 dark:text-rose-400">{formatINR(client.balance)}</span></div>
        </div>

        <Field label="Payment Amount (₹)">
          <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className={inputClass} placeholder="0" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Mode">
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={selectClass}>
              {PAYMENT_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Note (optional)">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} className={textareaClass} placeholder="Settlement note or payment remark" />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? 'Saving...' : 'Record Payment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
function BookingClientStatementModal({ client, onClose }: { client: BookingClientSummary; onClose: () => void; }) {
  const totalPaid = client.payments.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
  const shareText = [
    `Booking Client Statement`,
    `Client: ${client.client_name}`,
    `Phone: ${client.phone}`,
    `Event: ${client.event_name}`,
    `Deal Amount: ${formatINR(client.debit)}`,
    `Paid So Far: ${formatINR(totalPaid)}`,
    `Balance Due: ${formatINR(client.balance)}`,
    '',
    ...client.payments.map((entry) => `${entry.date || '—'} • ${entry.description || 'Payment'} • ${formatINR(Number(entry.amount ?? 0))}`),
  ].join('\n');

  return (
    <Modal open={true} onClose={onClose} title={`Statement — ${client.client_name}`} size="md" dismissible={false}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-center dark:bg-white/5">
          <div><p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Debit</p><p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{formatINR(client.debit)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Credit</p><p className="mt-1 text-sm font-semibold text-emerald-500 dark:text-emerald-400">{formatINR(totalPaid)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Balance</p><p className={`mt-1 text-sm font-semibold ${client.balance > 0 ? 'text-rose-500 dark:text-rose-300' : 'text-emerald-500 dark:text-emerald-400'}`}>{formatINR(client.balance)}</p></div>
        </div>

        <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3 dark:border-white/10">
          {client.payments.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No payment entries recorded yet.</p>
          ) : client.payments.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-slate-800/40">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">{entry.date || '—'}</span>
                <span className="text-sm font-semibold text-emerald-500 dark:text-emerald-400">{formatINR(Number(entry.amount ?? 0))}</span>
              </div>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{entry.description || 'Payment received'}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => navigator.clipboard?.writeText(shareText).catch(() => undefined)}
            className="rounded-lg bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:bg-sky-600"
          >
            Copy Summary
          </button>
        </div>
      </div>
    </Modal>
  );
}

function BalanceBadge({ balance }: { balance: number }) {
  return (
    <div className={`mt-3 rounded-lg px-3 py-2 text-center text-xs font-medium ${
      balance > 0
        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
        : balance < 0
        ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400'
        : 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400'
    }`}>
      {balance > 0 ? 'Studio owes partner' : balance < 0 ? 'Partner owes studio' : 'Settled'} · {formatINR(Math.abs(balance))}
    </div>
  );
}

function PartnerCard({
  b,
  onOpen,
  onEdit,
  onArchive,
  showArchive,
  showRestore,
  showTrash,
  onRestore,
  onTrash,
  onPermanentDelete,
}: {
  b: PartnerBalance;
  onOpen: (p: Partner) => void;
  onEdit?: (p: Partner) => void;
  onArchive?: (id: string) => void;
  showArchive?: boolean;
  showRestore?: boolean;
  showTrash?: boolean;
  onRestore?: (id: string) => void;
  onTrash?: (id: string) => void;
  onPermanentDelete?: (id: string) => void;
}) {
  const partnerStatus = b.partner.status || 'Active';
  const statusLabel = partnerStatus === 'Inactive' ? 'Inactive' : partnerStatus === 'Trash' ? 'Recycle Bin' : partnerStatus;
  const statusColor = partnerStatus === 'On Leave'
    ? 'text-amber-600 dark:text-amber-400'
    : partnerStatus === 'Inactive'
    ? 'text-rose-600 dark:text-rose-400'
    : partnerStatus === 'Archived' || partnerStatus === 'Trash'
    ? 'text-slate-500 dark:text-slate-400'
    : 'text-emerald-600 dark:text-emerald-400';
  const dotColor = partnerStatus === 'On Leave'
    ? 'text-amber-500'
    : partnerStatus === 'Inactive'
    ? 'text-rose-500'
    : partnerStatus === 'Archived' || partnerStatus === 'Trash'
    ? 'text-slate-400'
    : 'text-emerald-500';
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-amber-500/30 dark:border-white/10 dark:bg-slate-900/50 dark:hover:border-amber-500/20"
    >
      <div className="mb-3 flex items-start gap-3">
        <button onClick={() => onOpen(b.partner)} className="flex flex-1 items-center gap-3 text-left">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-bold text-slate-900">
            {b.partner.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{b.partner.name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{b.partner.mobile}</p>
          </div>
        </button>
        <Badge color={CATEGORY_COLORS[b.partner.category]}>{b.partner.category}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Credit</p>
          <p className="text-sm font-semibold text-emerald-500 dark:text-emerald-400">{formatINR(b.totalCredit + b.directReceived + b.labCredit)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Debit</p>
          <p className="text-sm font-semibold text-rose-500 dark:text-rose-400">{formatINR(b.totalDebit + b.totalSettled + b.directGiven + b.labDebit)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Balance</p>
          <p className={`text-sm font-bold ${b.balance > 0 ? 'text-emerald-500 dark:text-emerald-400' : b.balance < 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-500'}`}>
            {formatINR(b.balance)}
          </p>
        </div>
      </div>

      <BalanceBadge balance={b.balance} />

      {b.partner.status === 'Trash' && (
        <div className={`mt-2 rounded-lg px-3 py-1.5 text-center text-xs font-medium ${
          daysRemaining(b.partner.trashed_at) <= 7
            ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400'
            : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
        }`}>
          Auto-deletes in {daysRemaining(b.partner.trashed_at)} day{daysRemaining(b.partner.trashed_at) === 1 ? '' : 's'}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
        {onEdit && (
          <button onClick={() => onEdit(b.partner)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        )}
        {showArchive && onArchive && (
          <button onClick={() => onArchive(b.partner.id)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-400">
            <Archive className="h-3.5 w-3.5" /> Archive
          </button>
        )}
        <span className={`ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${statusColor}`}>
          <span className={dotColor}>●</span> {statusLabel}
        </span>
        {showRestore && onRestore && (
          <button onClick={() => onRestore(b.partner.id)} className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20">
            <RotateCcw className="h-3.5 w-3.5" /> Restore / Make Active
          </button>
        )}
        {showTrash && onTrash && (
          <button onClick={() => onTrash(b.partner.id)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400">
            <Trash2 className="h-3.5 w-3.5" /> Move to Bin
          </button>
        )}
        {onPermanentDelete && (
          <button onClick={() => onPermanentDelete(b.partner.id)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/10 dark:hover:text-rose-300">
            <Trash2 className="h-3.5 w-3.5" /> Delete Forever
          </button>
        )}
      </div>
    </div>
  );
}

function MainView({
  active,
  inactive,
  onOpen,
  onEdit,
  onArchive,
}: {
  active: PartnerBalance[];
  inactive: PartnerBalance[];
  onOpen: (p: Partner) => void;
  onEdit: (p: Partner) => void;
  onArchive: (id: string) => void;
}) {
  if (active.length === 0 && inactive.length === 0) {
    return <EmptyState icon={Users} title="No partners found" subtitle="Add a partner or adjust your filters" />;
  }
  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" /> Active Partners
          </h3>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
            {active.map((b) => (
              <PartnerCard key={b.partner.id} b={b} onOpen={onOpen} onEdit={onEdit} onArchive={onArchive} showArchive />
            ))}
          </div>
        </div>
      )}
      {inactive.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
            <span className="flex h-2 w-2 rounded-full bg-slate-400" /> Inactive Partners
          </h3>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
            {inactive.map((b) => (
              <PartnerCard key={b.partner.id} b={b} onOpen={onOpen} onEdit={onEdit} onArchive={onArchive} showArchive />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ArchivedView({
  items,
  onOpen,
  onEdit,
  onRestore,
  onTrash,
  title = 'No archived partners',
}: {
  items: PartnerBalance[];
  onOpen: (p: Partner) => void;
  onEdit: (p: Partner) => void;
  onRestore: (id: string) => void;
  onTrash: (id: string) => void;
  title?: string;
}) {
  if (items.length === 0) {
    return <EmptyState icon={FolderArchive} title={title} subtitle="Archived partners will appear here" />;
  }
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
      {items.map((b) => (
        <PartnerCard key={b.partner.id} b={b} onOpen={onOpen} onEdit={onEdit} showRestore onRestore={onRestore} showTrash onTrash={onTrash} />
      ))}
    </div>
  );
}

function TrashView({
  items,
  onOpen,
  onEdit,
  onRestore,
  onPermanentDelete,
}: {
  items: PartnerBalance[];
  onOpen: (p: Partner) => void;
  onEdit: (p: Partner) => void;
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
}) {
  if (items.length === 0) {
    return <EmptyState icon={Trash2} title="Recycle Bin is empty" subtitle={`Deleted partners are retained for ${TRASH_RETENTION_DAYS} days, then permanently purged`} />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((b) => (
        <PartnerCard key={b.partner.id} b={b} onOpen={onOpen} onEdit={onEdit} showRestore onRestore={onRestore} onPermanentDelete={onPermanentDelete} />
      ))}
    </div>
  );
}

function PartnerForm({
  open,
  onClose,
  onSaved,
  editing,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (partner?: Partner) => void;
  editing: Partner | null;
  existing: Partner[];
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [studioName, setStudioName] = useState('');
  const [mobile, setMobile] = useState('');
  const [studioAddress, setStudioAddress] = useState('');
  const [category, setCategory] = useState<PartnerCategory>('Studio Freelancer');
  const [status, setStatus] = useState<PartnerStatus>('Active');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setStudioName(editing.studio_name ?? '');
      setMobile(editing.mobile);
      setStudioAddress(editing.studio_address ?? '');
      setCategory(editing.category);
      setStatus(editing.status);
      setLeaveStart(editing.leave_start ?? '');
      setLeaveEnd(editing.leave_end ?? '');
      setNote(editing.note);
    } else {
      setName('');
      setStudioName('');
      setMobile('');
      setStudioAddress('');
      setCategory('Studio Freelancer');
      setStatus('Active');
      setLeaveStart('');
      setLeaveEnd('');
      setNote('');
    }
  }, [open, editing]);

  const handleSave = async () => {
    if (saving) return;
    const cleanMobile = mobile.trim();
    if (!name.trim()) { toast('Name is required', 'error'); return; }
    if (!cleanMobile) { toast('Mobile number is required', 'error'); return; }

    const duplicate = editing
      ? existing.find((p) => p.mobile === cleanMobile && p.id !== editing.id)
      : existing.find((p) => p.mobile === cleanMobile);
    if (duplicate) {
      toast(`A partner with mobile ${cleanMobile} already exists: ${duplicate.name}`, 'error');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const updatePayload = {
          name: name.trim(),
          mobile: cleanMobile,
          studio_name: studioName?.trim() || '',
          studio_address: studioAddress?.trim() || '',
          category: category || 'Studio Freelancer',
          status: status || 'Active',
          leave_start: status === 'On Leave' ? (leaveStart || null) : null,
          leave_end: status === 'On Leave' ? (leaveEnd || null) : null,
          note: note?.trim() || '',
          trashed_at: status === 'Trash' ? (editing.trashed_at ?? new Date().toISOString()) : null,
        };
        const { error } = await supabase.from('partners').update(updatePayload).eq('id', editing.id);
        if (error) throw error;
        toast('Partner updated', 'success');
        onSaved({ ...editing, ...updatePayload });
      } else {
        const { error } = await supabase.from('partners').insert({
          name: name.trim(),
          mobile: cleanMobile,
          studio_name: studioName.trim(),
          studio_address: studioAddress.trim(),
          category,
          status,
          leave_start: status === 'On Leave' ? (leaveStart || null) : null,
          leave_end: status === 'On Leave' ? (leaveEnd || null) : null,
          note: note.trim(),
          trashed_at: status === 'Trash' ? new Date().toISOString() : null,
        });
        if (error) throw error;
        toast('Partner added', 'success');
      }
      if (!editing) onSaved();
    } catch (err) {
      console.error("Partner Save Error:", err);
      toast('Failed to save partner. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Partner' : 'Add Partner'} size="md" dismissible={false}>
      <div className="space-y-4">
        <Field label="Partner Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Enter name" />
        </Field>
        <Field label="Studio Name">
          <input value={studioName} onChange={(e) => setStudioName(e.target.value)} className={inputClass} placeholder="Studio / business name" />
        </Field>
        <Field label="Mobile Number (Primary Key)">
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} className={inputClass} placeholder="+91 98765 43210" />
        </Field>
        <Field label="Studio Address">
          <input value={studioAddress} onChange={(e) => setStudioAddress(e.target.value)} className={inputClass} placeholder="Studio address" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value as PartnerCategory)} className={selectClass}>
              {PARTNER_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as PartnerStatus)} className={selectClass}>
              <option value="Active">Active</option>
              <option value="On Leave">On Leave</option>
              <option value="Inactive">Left Studio / Inactive</option>
              <option value="Archived">Archived</option>
            </select>
          </Field>
        </div>
        {status === 'On Leave' && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Leave Start">
              <input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Leave End">
              <input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} className={inputClass} />
            </Field>
          </div>
        )}
        <Field label="Note">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} className={textareaClass} placeholder="Optional note..." />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <><Sparkles className="h-4 w-4 animate-spin" /> Saving...</> : editing ? 'Save Changes' : 'Add Partner'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DirectTxnModal({
  open,
  onClose,
  onSaved,
  partners,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  partners: Partner[];
}) {
  const { toast } = useToast();
  const [partnerId, setPartnerId] = useState('');
  const [txnType, setTxnType] = useState<DirectTxnType>('Given');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<string>('Cash');
  const [txnDate, setTxnDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPartnerId('');
    setTxnType('Given');
    setAmount('');
    setPaymentMode('Cash');
    setTxnDate(todayISO());
    setNote('');
  }, [open]);

  const selectedPartner = partners.find((p) => p.id === partnerId);

  const handleSave = async () => {
    if (saving) return;
    const amt = Number(amount);
    if (!partnerId) { toast('Select a partner', 'error'); return; }
    if (isNaN(amt) || amt <= 0) { toast('Enter a valid amount', 'error'); return; }
    if (!selectedPartner) { toast('Partner not found', 'error'); return; }

    setSaving(true);
    try {
      const { error } = await supabase.from('direct_transactions').insert({
        partner_id: partnerId,
        partner_name: selectedPartner.name,
        partner_mobile: selectedPartner.mobile,
        txn_type: txnType,
        amount: amt,
        payment_mode: paymentMode,
        txn_date: txnDate,
        note: note.trim(),
      });
      if (error) throw error;
      toast('Direct transaction recorded', 'success');
      onSaved();
    } catch (err) {
      toast('Failed to record transaction. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Quick Entry / Direct Transaction" size="md" dismissible={false}>
      <div className="space-y-4">
        <Field label="Select Partner (by Name / Mobile)">
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className={selectClass}>
            <option value="">— Select partner —</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.mobile}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Transaction Type">
            <select value={txnType} onChange={(e) => setTxnType(e.target.value as DirectTxnType)} className={selectClass}>
              {DIRECT_TXN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === 'Given' ? 'Given / Advance (Debit)' : 'Received (Credit)'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount (₹)">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }}
              className={inputClass}
              placeholder="0"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Payment Mode">
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={selectClass}>
              {DIRECT_TXN_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Note / Reason">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} className={textareaClass} placeholder="e.g., Personal Advance, Machine Advance, Petrol..." />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <><Sparkles className="h-4 w-4 animate-spin" /> Saving...</> : 'Save Transaction'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
