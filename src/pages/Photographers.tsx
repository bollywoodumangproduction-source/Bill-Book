import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Sparkles,
  Camera,
  Trash2,
  TrendingUp,
  TrendingDown,
  MinusCircle,
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
import { getFunctionErrorMessage } from '@/lib/functionError';
import { ImageUpload } from '@/components/ui/ImageUpload';
import type {
  Booking,
  PhotographerLedgerEntry,
  LedgerEntryType,
  Partner,
  PartnerCategory,
  PartnerStatus,
  DirectTransaction,
  DirectTxnType,
  StudioLabOrder,
} from '@/lib/types';
import { formatINR, formatDate, formatDateTime, todayISO } from '@/lib/format';
import { clientPaidTotal, clientWorkTotal, labOrderPayments, unallocatedPaidTotal } from '@/lib/labBilling';
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

const CATEGORY_ICON: Record<PartnerCategory, typeof Camera> = {
  'Studio Freelancer': Camera,
  'Photographer Freelancer': Users,
  'Other': Wallet,
};

type LedgerView = 'main' | 'archived' | 'trash';
type LedgerTab = 'partners' | 'clients' | 'archived' | 'recycle_bin';

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

export function Ledger({ mode = 'ledger' }: { mode?: 'partners' | 'ledger' }) {
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

  const [activeTab, setActiveTab] = useState<LedgerTab>(mode === 'partners' ? 'partners' : 'clients');
  const [view, setView] = useState<LedgerView>('main');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [showDirectTxn, setShowDirectTxn] = useState(false);
  const [detailPartner, setDetailPartner] = useState<Partner | null>(null);
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
        await supabase.from('photographer_ledger').delete().eq('partner_id', partner.id);
        await supabase.from('partners').delete().eq('id', partner.id);
      }
    }
    const surviving = expired.length > 0 ? purgeExpiredPartners(allPartners) : allPartners;
    setPartners(surviving);
    setBookings((bookingData ?? []) as Booking[]);
    setLabOrders((labData ?? []) as any[]);
    setLedgerEntries((le ?? []) as PhotographerLedgerEntry[]);
    setDirectTxns((dt ?? []) as DirectTransaction[]);
    setClientLedgerEntries((clientLedgerData ?? []) as BookingClientLedgerEntry[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshToken]);

  const balances = useMemo<PartnerBalance[]>(() => {
    return partners.map((partner) => {
      const mobile = partner.mobile;
      const pLedger = ledgerEntries.filter((e) => e.partner_id ? e.partner_id === partner.id : e.mobile === mobile);
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
    return balances.filter((b) => {
      const matchesView =
        view === 'main' ? b.partner.status === 'Active' || b.partner.status === 'On Leave' || b.partner.status === 'Inactive' :
        view === 'archived' ? b.partner.status === 'Archived' :
        b.partner.status === 'Trash';
      const matchesCategory = categoryFilter === 'all' || b.partner.category === categoryFilter;
      const matchesSearch = !q || (b.partner.name ?? '').toLowerCase().includes(q) || (b.partner.mobile ?? '').includes(q);
      return matchesView && matchesCategory && matchesSearch;
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

  const activePartners = filteredBalances.filter((b) => b.partner.status === 'Active');
  const inactivePartners = filteredBalances.filter((b) => b.partner.status === 'On Leave' || b.partner.status === 'Inactive');

  const updatePartnerStatus = async (id: string, status: PartnerStatus, extra?: Record<string, any>) => {
    await supabase.from('partners').update({ status, ...extra }).eq('id', id);
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
      await supabase.from('photographer_ledger').delete().eq('partner_id', partner.id);
    }
    await supabase.from('partners').delete().eq('id', permanentDeleteId);
    toast('Partner permanently deleted', 'success');
    setPermanentDeleteId(null);
    load();
  };

  const partnerDirectTxns = (pid: string) => directTxns.filter((d) => d.partner_id === pid);
  const partnerLedger = (partnerId: string, mobile: string) => ledgerEntries.filter((e) => e.partner_id ? e.partner_id === partnerId : e.mobile === mobile);

  const setLedgerTab = (tab: LedgerTab) => {
    setActiveTab(tab);
    if (tab === 'partners') { setView('main'); setCategoryFilter('all'); }
    if (tab === 'archived') { setView('archived'); setCategoryFilter('all'); }
    if (tab === 'recycle_bin') { setView('trash'); setCategoryFilter('all'); }
  };

  const [quickPayClient, setQuickPayClient] = useState<BookingClientSummary | null>(null);
  const [statementClient, setStatementClient] = useState<BookingClientSummary | null>(null);

  return (
    <div className="relative flex w-full flex-col space-y-2">
      <div className="flex w-full items-center justify-between gap-2 bg-[#0B1121]/90 px-0 py-2 sm:px-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-bold text-white sm:text-lg md:text-xl">{mode === 'partners' ? 'Partners' : 'Ledger'}</h1>
          <p className="hidden truncate text-xs text-slate-400 sm:block">{mode === 'partners' ? 'Partner profiles, access and assignments' : 'Partner and booking client accounts — credits, debits & transactions'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {mode === 'partners' && <button
            type="button"
            onClick={() => {
              setEditingPartner(null);
              setShowPartnerForm(true);
            }}
            aria-label="Add Partner"
            title="Add Partner"
            className="flex shrink-0 items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20 sm:px-3 sm:text-xs"
          >
            <Plus className="h-4 w-4" /><span className="hidden sm:inline">Add Partner</span>
          </button>}
          {mode === 'ledger' && <button
            type="button"
            onClick={() => setShowDirectTxn(true)}
            aria-label="Quick Entry"
            title="Quick Entry"
            className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-white/5 sm:px-3 sm:text-xs"
          >
            <Wallet className="h-4 w-4" /><span className="hidden sm:inline">Quick Entry</span>
          </button>}
        </div>
      </div>

      <div className="w-full space-y-2 px-0 sm:px-3 md:px-4">
      <div className="sticky top-14 z-30 space-y-1 border-b border-white/10 bg-[#0B1121]/95 pb-1 pt-0.5 shadow-md backdrop-blur-md md:top-0">
      {/* View tabs */}
      <div className="flex flex-nowrap gap-1 overflow-x-auto">
        {mode === 'partners' ? <>
          <TabButton active={activeTab === 'partners'} onClick={() => setLedgerTab('partners')} icon={Users} label="Partners" count={balances.filter((b) => b.partner.status === 'Active' || b.partner.status === 'Inactive' || b.partner.status === 'On Leave').length} />
          <TabButton active={activeTab === 'archived'} onClick={() => setLedgerTab('archived')} icon={FolderArchive} label="Archived" count={balances.filter((b) => b.partner.status === 'Archived').length} />
          <TabButton active={activeTab === 'recycle_bin'} onClick={() => setLedgerTab('recycle_bin')} icon={Trash2} label="Recycle Bin" count={balances.filter((b) => b.partner.status === 'Trash').length} />
        </> : <>
          <TabButton active={activeTab === 'partners'} onClick={() => setLedgerTab('partners')} icon={Users} label="Partner Ledger" count={balances.filter((b) => b.partner.status === 'Active' || b.partner.status === 'Inactive' || b.partner.status === 'On Leave').length} />
          <TabButton active={activeTab === 'clients'} onClick={() => setLedgerTab('clients')} icon={Wallet} label="Booking Clients" count={bookingClientSummaries.length} />
        </>}
      </div>

      {/* Filters */}
      <div className="flex flex-nowrap gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or mobile..."
            className={`${inputClass} !h-8 !py-1.5 !text-xs`}
            style={{ paddingLeft: '3rem' }}
          />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={`${selectClass} h-8 !w-32 shrink-0 !py-1.5 !text-xs sm:!w-48`}>
          <option value="all">All Categories</option>
          {PARTNER_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Sparkles className="h-6 w-6 animate-pulse text-amber-500" /></div>
      ) : activeTab === 'clients' ? (
        <BookingClientsView
          clients={filteredBookingClients}
          onPayment={(client) => setQuickPayClient(client)}
          onViewStatement={(client) => setStatementClient(client)}
        />
      ) : view === 'main' ? (
        <MainView
          active={activePartners}
          inactive={inactivePartners}
          onOpen={(p) => setDetailPartner(p)}
          onEdit={mode === 'partners' ? (p) => { setEditingPartner(p); setShowPartnerForm(true); } : undefined}
          onArchive={mode === 'partners' ? (id) => setArchiveId(id) : undefined}
          showFinancials={mode === 'ledger'}
        />
      ) : view === 'archived' ? (
        <ArchivedView
          items={filteredBalances}
          onOpen={(p) => setDetailPartner(p)}
          onRestore={(id) => { updatePartnerStatus(id, 'Active', { trashed_at: null }); toast('Partner restored to Active', 'success'); }}
          onTrash={(id) => setTrashId(id)}
          showFinancials={false}
        />
      ) : (
        <TrashView
          items={filteredBalances}
          onOpen={(p) => setDetailPartner(p)}
          onRestore={(id) => { updatePartnerStatus(id, 'Active'); toast('Partner restored from Recycle Bin', 'success'); }}
          onPermanentDelete={(id) => setPermanentDeleteId(id)}
          showFinancials={false}
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

      <PartnerForm
        open={showPartnerForm}
        onClose={() => setShowPartnerForm(false)}
        onSaved={() => { setShowPartnerForm(false); load(); }}
        editing={editingPartner}
        existing={partners}
      />

      <DirectTxnModal
        open={showDirectTxn}
        onClose={() => setShowDirectTxn(false)}
        onSaved={() => { setShowDirectTxn(false); load(); }}
        partners={partners.filter((p) => p.status === 'Active' || p.status === 'Inactive')}
      />

      {detailPartner && (
        <PartnerDetailModal
          partner={detailPartner}
          directTxns={partnerDirectTxns(detailPartner.id)}
          ledgerEntries={partnerLedger(detailPartner.id, detailPartner.mobile)}
          labOrders={labOrders.filter((order) => {
            if (order.partner_id === detailPartner.id) return true;
            const orderPartner = String(order.partner_name ?? order.studio_name ?? '').trim().toLowerCase();
            return !!orderPartner && orderPartner === String(detailPartner.name ?? '').trim().toLowerCase();
          })}
          profileOnly={mode === 'partners'}
          onClose={() => setDetailPartner(null)}
          onSettle={() => setSettlePartner(detailPartner)}
          onUpdated={(p) => { setDetailPartner(p); load(); }}
        />
      )}

      {settlePartner && (
        <SettlementModal
          partner={settlePartner}
          onClose={() => setSettlePartner(null)}
          onSaved={() => { setSettlePartner(null); setDetailPartner(null); load(); }}
        />
      )}

      <ConfirmDialog
        open={!!archiveId}
        onClose={() => setArchiveId(null)}
        onConfirm={handleArchive}
        title="Archive Partner"
        message="This partner will be moved to the Archived folder. You can restore them anytime."
        confirmLabel="Archive"
      />
      <ConfirmDialog
        open={!!trashId}
        onClose={() => setTrashId(null)}
        onConfirm={handleMoveToTrash}
        title="Move to Recycle Bin"
        message={`This partner will be moved to the Recycle Bin. All historical ledger entries are retained. The partner will be automatically and permanently deleted after ${TRASH_RETENTION_DAYS} days unless restored. You can also delete immediately. Restore is available anytime within the retention window.`}
        confirmLabel="Move to Bin"
        danger
      />
      <ConfirmDialog
        open={!!permanentDeleteId}
        onClose={() => setPermanentDeleteId(null)}
        onConfirm={handlePermanentDelete}
        title="Permanently Delete"
        message="This will permanently delete the partner AND all their ledger entries and direct transactions. This cannot be undone."
        confirmLabel="Delete Forever"
        danger
      />
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: typeof Camera; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs ${
        active
          ? 'bg-amber-500 text-slate-900'
          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-white/5'
      }`}
    >
      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      {label}
      {count > 0 && (
        <span className={`rounded-full px-1.5 py-0.5 text-xs ${active ? 'bg-slate-900/15' : 'bg-slate-100 dark:bg-white/10'}`}>{count}</span>
      )}
    </button>
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
  showFinancials = true,
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
  showFinancials?: boolean;
}) {
  const CatIcon = CATEGORY_ICON[b.partner.category];
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

      {!showFinancials && (
        <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
          {b.partner.studio_name && b.partner.studio_name !== b.partner.name && <p className="truncate">{b.partner.studio_name}</p>}
          {b.partner.studio_address && <p className="truncate">{b.partner.studio_address}</p>}
          <p>{b.partner.status === 'Inactive' ? 'Left Studio / Inactive' : b.partner.status}</p>
        </div>
      )}

      {showFinancials && <>
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
      </>}

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
        <button onClick={() => onOpen(b.partner)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200">
          <CatIcon className="h-3.5 w-3.5" /> {showFinancials ? 'Ledger' : 'Profile'}
        </button>
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
  showFinancials = true,
}: {
  active: PartnerBalance[];
  inactive: PartnerBalance[];
  onOpen: (p: Partner) => void;
  onEdit?: (p: Partner) => void;
  onArchive?: (id: string) => void;
  showFinancials?: boolean;
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((b) => (
              <PartnerCard key={b.partner.id} b={b} onOpen={onOpen} onEdit={onEdit} onArchive={onArchive} showArchive={Boolean(onArchive)} showFinancials={showFinancials} />
            ))}
          </div>
        </div>
      )}
      {inactive.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
            <span className="flex h-2 w-2 rounded-full bg-slate-400" /> Inactive Partners
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inactive.map((b) => (
              <PartnerCard key={b.partner.id} b={b} onOpen={onOpen} onEdit={onEdit} onArchive={onArchive} showArchive={Boolean(onArchive)} showFinancials={showFinancials} />
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
  onRestore,
  onTrash,
  showFinancials = true,
}: {
  items: PartnerBalance[];
  onOpen: (p: Partner) => void;
  onRestore: (id: string) => void;
  onTrash: (id: string) => void;
  showFinancials?: boolean;
}) {
  if (items.length === 0) {
    return <EmptyState icon={FolderArchive} title="No archived partners" subtitle="Archived partners will appear here" />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((b) => (
        <PartnerCard key={b.partner.id} b={b} onOpen={onOpen} showRestore onRestore={onRestore} showTrash onTrash={onTrash} showFinancials={showFinancials} />
      ))}
    </div>
  );
}

function TrashView({
  items,
  onOpen,
  onRestore,
  onPermanentDelete,
  showFinancials = true,
}: {
  items: PartnerBalance[];
  onOpen: (p: Partner) => void;
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  showFinancials?: boolean;
}) {
  if (items.length === 0) {
    return <EmptyState icon={Trash2} title="Recycle Bin is empty" subtitle={`Deleted partners are retained for ${TRASH_RETENTION_DAYS} days, then permanently purged`} />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((b) => (
        <PartnerCard key={b.partner.id} b={b} onOpen={onOpen} showRestore onRestore={onRestore} onPermanentDelete={onPermanentDelete} showFinancials={showFinancials} />
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
  onSaved: () => void;
  editing: Partner | null;
  existing: Partner[];
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [studioName, setStudioName] = useState('');
  const [mobile, setMobile] = useState('');
  const [studioAddress, setStudioAddress] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
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
      setLogoUrl(editing.logo_url ?? '');
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
      setLogoUrl('');
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

    const duplicate = existing.find((p) => p.mobile === cleanMobile && p.id !== editing?.id);
    if (duplicate) {
      toast(`A partner with mobile ${cleanMobile} already exists: ${duplicate.name}`, 'error');
      return;
    }

    if (editing && cleanMobile !== editing.mobile && existing.some((p) => p.id !== editing.id && p.mobile === editing.mobile)) {
      toast('This old mobile number belongs to another partner profile too. Resolve the duplicate profile before changing it, so ledger history is not linked to the wrong partner.', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        if (cleanMobile !== editing.mobile) {
          const { error: linkError } = await supabase.from('photographer_ledger')
            .update({ partner_id: editing.id })
            .eq('mobile', editing.mobile)
            .is('partner_id', null);
          if (linkError) throw new Error('Apply the partner ledger migration before changing this mobile number.');
        }
        const { error } = await supabase.from('partners').update({
          name: name.trim(),
          mobile: cleanMobile,
          studio_name: studioName.trim(),
          studio_address: studioAddress.trim(),
          logo_url: logoUrl,
          category,
          status,
          leave_start: status === 'On Leave' ? (leaveStart || null) : null,
          leave_end: status === 'On Leave' ? (leaveEnd || null) : null,
          note: note.trim(),
          trashed_at: status === 'Trash' ? (editing.trashed_at ?? new Date().toISOString()) : null,
        }).eq('id', editing.id);
        if (error) throw error;
        toast('Partner updated', 'success');
      } else {
        const { error } = await supabase.from('partners').insert({
          name: name.trim(),
          mobile: cleanMobile,
          studio_name: studioName.trim(),
          studio_address: studioAddress.trim(),
          logo_url: logoUrl,
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
      onSaved();
    } catch (err) {
      const details = err && typeof err === 'object' ? err as { message?: unknown; details?: unknown; code?: unknown } : null;
      const message = err instanceof Error
        ? err.message
        : typeof details?.message === 'string'
          ? [details.message, details.details].filter((part) => typeof part === 'string' && part).join(' ')
          : 'Failed to save partner. Please try again.';
      toast(details?.code ? `${message} (code: ${String(details.code)})` : message, 'error');
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
        <Field label="Mobile Number (Login & Contact)">
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} className={inputClass} placeholder="+91 98765 43210" />
        </Field>
        <Field label="Studio Address">
          <input value={studioAddress} onChange={(e) => setStudioAddress(e.target.value)} className={inputClass} placeholder="Studio address" />
        </Field>
        <ImageUpload
          value={logoUrl}
          onChange={setLogoUrl}
          label="Partner Logo"
          description="Shown on this partner’s B2B photo-selection link. You can replace or remove it anytime."
          maxMb={1}
        />
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

function PartnerDetailModal({
  partner,
  directTxns,
  ledgerEntries,
  labOrders,
  profileOnly,
  onClose,
  onSettle,
  onUpdated,
}: {
  partner: Partner;
  directTxns: DirectTransaction[];
  ledgerEntries: PhotographerLedgerEntry[];
  labOrders: StudioLabOrder[];
  profileOnly: boolean;
  onClose: () => void;
  onSettle: () => void;
  onUpdated: (p: Partner) => void;
}) {
  const { toast } = useToast();
  const [resetting, setResetting] = useState(false);
  const [togglingLogin, setTogglingLogin] = useState(false);
  const [editingPin, setEditingPin] = useState(false);
  const [editPinValue, setEditPinValue] = useState('');

  const handleResetPassword = async () => {
    setResetting(true);
    const defaultPin = partner.mobile.slice(-4);
    const { data, error } = await supabase.functions.invoke('portal-auth', { body: { action: 'set-pin', portal: 'partner', recordId: partner.id, pin: defaultPin } });
    setResetting(false);
    if (error || data?.error) { toast(await getFunctionErrorMessage(error, data, 'Failed to reset PIN'), 'error'); return; }
    onUpdated({ ...partner, password_changed: false });
    toast('PIN reset to default (last 4 digits of mobile)', 'success');
  };

  const saveEditedPin = async () => {
    if (editPinValue.length !== 4) { toast('PIN must be exactly 4 digits', 'error'); return; }
    const { data, error } = await supabase.functions.invoke('portal-auth', { body: { action: 'set-pin', portal: 'partner', recordId: partner.id, pin: editPinValue } });
    if (error || data?.error) { toast(await getFunctionErrorMessage(error, data, 'Failed to update PIN'), 'error'); return; }
    onUpdated({ ...partner, password_changed: true });
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
  type UnifiedEntry = {
    id: string;
    date: string;
    label: string;
    sublabel: string;
    amount: number;
    positive: boolean;
    icon: typeof TrendingUp;
  };

  const entries = useMemo<UnifiedEntry[]>(() => {
    const direct: UnifiedEntry[] = directTxns.map((d) => ({
      id: d.id,
      date: d.txn_date,
      label: d.note || (d.txn_type === 'Given' ? 'Direct Advance / Given' : 'Direct Received'),
      sublabel: `Direct · ${d.payment_mode}`,
      amount: Number(d.amount),
      positive: d.txn_type === 'Received',
      icon: d.txn_type === 'Given' ? ArrowUpRight : ArrowDownLeft,
    }));
    const ledger: UnifiedEntry[] = ledgerEntries.map((e) => ({
      id: e.id,
      date: e.payment_date || e.created_at,
      label: e.description || LEDGER_ENTRY_LABELS[e.entry_type],
      sublabel: `${LEDGER_ENTRY_LABELS[e.entry_type]}${e.payment_mode ? ' · ' + e.payment_mode : ''}`,
      amount: Number(e.amount),
      positive: e.entry_type === 'SHOOT_DUTY_CREDIT',
      icon: e.entry_type === 'SHOOT_DUTY_CREDIT' ? TrendingUp : e.entry_type === 'LAB_WORK_DEBIT' ? TrendingDown : MinusCircle,
    }));
    return [...direct, ...ledger].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [directTxns, ledgerEntries]);

  const totalCredit = entries.filter((e) => e.positive).reduce((s, e) => s + e.amount, 0);
  const totalDebit = entries.filter((e) => !e.positive).reduce((s, e) => s + e.amount, 0);
  const balance = totalCredit - totalDebit;
  let runningBalance = 0;

  return (
    <Modal open={true} onClose={onClose} title={profileOnly ? `${partner.name} — Profile` : partner.name} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={CATEGORY_COLORS[partner.category]}>{partner.category}</Badge>
          <Badge color={partner.status === 'Active' ? 'emerald' : partner.status === 'On Leave' ? 'amber' : partner.status === 'Inactive' ? 'slate' : 'amber'}>{partner.status === 'Inactive' ? 'Left Studio / Inactive' : partner.status}</Badge>
          <span className="text-xs text-slate-500 dark:text-slate-400">{partner.mobile}</span>
        </div>
        {profileOnly && <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-white/10 dark:bg-white/5 sm:grid-cols-2">
          <p><span className="text-slate-500 dark:text-slate-400">Partner / Studio:</span> <strong>{partner.studio_name || partner.name}</strong></p>
          {partner.studio_address && <p><span className="text-slate-500 dark:text-slate-400">Address:</span> {partner.studio_address}</p>}
          {(partner.leave_start || partner.leave_end) && <p><span className="text-slate-500 dark:text-slate-400">Leave dates:</span> {partner.leave_start ? formatDate(partner.leave_start) : '—'} to {partner.leave_end ? formatDate(partner.leave_end) : '—'}</p>}
          {partner.note && <p className="sm:col-span-2"><span className="text-slate-500 dark:text-slate-400">Notes:</span> {partner.note}</p>}
        </div>}
        <div className="flex flex-wrap items-center gap-2">
          {!profileOnly && <button onClick={onSettle} className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600">
            <Wallet className="h-3.5 w-3.5" /> Direct Settle
          </button>}
          {profileOnly && <button
            onClick={handleToggleLogin}
            disabled={togglingLogin}
            type="button"
            role="switch"
            aria-checked={Boolean(partner.is_login_allowed)}
            aria-label={`Partner login ${partner.is_login_allowed ? 'On' : 'Off'}`}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            <KeyRound className="h-3.5 w-3.5" /> Portal Login
            <span>{partner.is_login_allowed ? 'On' : 'Off'}</span>
            <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${partner.is_login_allowed ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${partner.is_login_allowed ? 'translate-x-[18px]' : 'translate-x-1'}`} />
            </span>
          </button>}
        </div>

        {/* Portal Access / PIN Management */}
        {profileOnly && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-500" />
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Access PIN</p>
                {editingPin ? (
                  <div className="mt-1 flex items-center gap-2">
                    <PinInput value={editPinValue} onChange={setEditPinValue} placeholder="0000" />
                    <button onClick={saveEditedPin} className="text-emerald-600 hover:text-emerald-500 dark:text-emerald-400" title="Save PIN">
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => { setEditingPin(false); setEditPinValue(''); }} className="text-rose-500 hover:text-rose-400" title="Cancel">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <p className="font-mono text-sm text-slate-900 dark:text-white">•••• · PIN is never displayed</p>
                )}
              </div>
            </div>
            {!editingPin && (
              <div className="flex items-center gap-2">
                <button onClick={() => { setEditPinValue(''); setEditingPin(true); }} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-white/10 dark:hover:bg-white/5" title="Set new PIN">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleResetPassword}
                  disabled={resetting}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset to Default PIN
                </button>
              </div>
            )}
          </div>
        </div>}

        {!profileOnly && <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-200 p-3 text-center dark:border-white/10">
            <p className="text-xs text-slate-500 dark:text-slate-400">Total Credit</p>
            <p className="text-sm font-semibold text-emerald-500 dark:text-emerald-400">{formatINR(totalCredit)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 text-center dark:border-white/10">
            <p className="text-xs text-slate-500 dark:text-slate-400">Total Debit</p>
            <p className="text-sm font-semibold text-rose-500 dark:text-rose-400">{formatINR(totalDebit)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 text-center dark:border-white/10">
            <p className="text-xs text-slate-500 dark:text-slate-400">Balance</p>
            <p className={`text-sm font-bold ${balance > 0 ? 'text-emerald-500 dark:text-emerald-400' : balance < 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-500'}`}>
              {formatINR(balance)}
            </p>
          </div>
        </div>}

        {!profileOnly && <div className="border-t border-slate-200 pt-3 dark:border-white/10">
          <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Lifetime Ledger</h4>
          <div className="max-h-[40vh] overflow-auto">
            {entries.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No transactions yet</p>
            ) : (
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400">
                  <tr><th className="px-2 py-2">Date</th><th className="px-2 py-2">Client / Description</th><th className="px-2 py-2">Function / Role</th><th className="px-2 py-2">Credit</th><th className="px-2 py-2">Debit</th><th className="px-2 py-2">Running Due</th></tr>
                </thead>
                <tbody>{entries.map((e) => {
                  runningBalance += e.positive ? e.amount : -e.amount;
                  const isShoot = e.sublabel.includes('Shoot');
                  return <tr key={e.id} className="border-b border-slate-100 dark:border-white/5"><td className="px-2 py-2 text-slate-600 dark:text-slate-400">{formatDate(e.date)}</td><td className="px-2 py-2 text-slate-800 dark:text-slate-200">{isShoot ? partner.name : e.label}</td><td className="px-2 py-2 text-slate-600 dark:text-slate-400">{e.label}{e.sublabel.includes('Direct') ? ` · ${e.sublabel}` : ''}</td><td className="px-2 py-2 font-medium text-emerald-600 dark:text-emerald-400">{e.positive ? formatINR(e.amount) : '—'}</td><td className="px-2 py-2 font-medium text-rose-600 dark:text-rose-400">{e.positive ? '—' : formatINR(e.amount)}</td><td className="px-2 py-2 font-semibold text-slate-800 dark:text-slate-200">{formatINR(runningBalance)}</td></tr>;
                })}</tbody>
              </table>
            )}
          </div>
        </div>}
        {!profileOnly && <PermanentLabOrderHistory orders={labOrders} />}
      </div>
    </Modal>
  );
}

function PermanentLabOrderHistory({ orders }: { orders: StudioLabOrder[] }) {
  const history = [...orders].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  return (
    <section className="border-t border-slate-200 pt-3 dark:border-white/10">
      <h4 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Permanent Lab Order &amp; Client Work History</h4>
      <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">Full order and payment record for admin review. Settled, archived and soft-deleted records remain available here.</p>
      {history.length === 0 ? <p className="py-5 text-center text-sm text-slate-400">No lab order history for this partner.</p> : (
        <div className="max-h-[45vh] space-y-2 overflow-auto">
          {history.map((order) => {
            const payments = labOrderPayments(order);
            const totalDue = Math.max(0, Number(order.master_total ?? 0) - Number(order.advance_paid ?? 0));
            return (
              <details key={order.id} className="rounded-lg border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-3">
                  <span className="min-w-0"><b className="text-xs text-slate-800 dark:text-slate-100">{order.order_no} · {order.project_name || order.work_type}</b><span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">{order.created_at ? formatDate(order.created_at) : 'Date not recorded'} · {order.order_status || 'Status unavailable'}{order.archived_at ? ' · Archived' : ''}{order.deleted_at ? ' · Deleted (retained)' : ''}</span></span>
                  <span className="shrink-0 text-right text-[11px] text-slate-600 dark:text-slate-300">Bill {formatINR(Number(order.master_total ?? 0))} · Paid {formatINR(Number(order.advance_paid ?? 0))}<b className="block text-rose-600 dark:text-rose-400">Due {formatINR(totalDue)}</b></span>
                </summary>
                <div className="space-y-2 border-t border-slate-200 p-3 text-[11px] dark:border-white/10">
                  <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-300 sm:grid-cols-4"><span>Work total: {formatINR(Number(order.current_order_total ?? 0))}</span><span>Previous balance: {formatINR(Number(order.previous_back_due ?? order.back_due ?? 0))}</span><span>Combined bill: {formatINR(Number(order.master_total ?? 0))}</span><span>Paid: {formatINR(Number(order.advance_paid ?? 0))}</span></div>
                  {(order.clients ?? []).map((client, index) => {
                    const work = clientWorkTotal(client, order.extra_items ?? [], order.clients ?? []);
                    const paid = clientPaidTotal(client, payments, order.clients ?? []);
                    const clientPayments = payments.filter((payment) => payment.client_id === client.id || (!payment.client_id && payment.client_name === client.client_name));
                    return <div key={client.id || index} className="border-t border-slate-200 pt-2 dark:border-white/10">
                      <p className="font-semibold text-cyan-700 dark:text-cyan-300">Client {index + 1}: {client.client_name || `Client ${index + 1}`} · Work {formatINR(work)} · Paid {formatINR(paid)} · Due {formatINR(Math.max(0, work - paid))}</p>
                      <div className="mt-1 space-y-0.5 text-slate-600 dark:text-slate-400">
                        {(client.video_rows ?? []).map((row, rowIndex) => <p key={`video-${rowIndex}`}>Video · {row.video_type} / {row.quality} · {row.qty} × {formatINR(Number(row.rate))} = {formatINR(Number(row.total ?? Number(row.qty) * Number(row.rate)))}</p>)}
                        {(client.album_rows ?? []).map((row, rowIndex) => <div key={`album-${rowIndex}`}><p>Album · {row.album_type} ({row.size}) · {formatINR(Number(row.total ?? 0))}</p>{(row.papers ?? []).filter((paper) => paper.paper_type).map((paper) => <p key={paper.id} className="pl-3">{paper.paper_type} · {paper.sheets} sheets × {formatINR(Number(paper.rate))} = {formatINR(Number(paper.total))}</p>)}</div>)}
                        {(order.extra_items ?? []).filter((item) => item.client_id ? item.client_id === client.id : item.client_name === client.client_name).map((item) => <p key={item.id}>Extra · {item.description} · {item.quantity} × {formatINR(item.unit_rate)} = {formatINR(item.line_amount)}</p>)}
                      </div>
                      {clientPayments.map((payment) => <p key={payment.id} className="mt-1 text-slate-500">Payment · {formatDateTime(payment.created_at || payment.payment_date)} · {payment.payment_mode || '—'} · {formatINR(Number(payment.amount))}{payment.note ? ` · ${payment.note}` : ''}</p>)}
                    </div>;
                  })}
                  {unallocatedPaidTotal(payments) > 0 && <div className="border-t border-amber-500/20 pt-2 text-amber-700 dark:text-amber-300">Unassigned / legacy payments: {formatINR(unallocatedPaidTotal(payments))}{payments.filter((payment) => !payment.client_id && !payment.client_name).map((payment) => <p key={payment.id} className="mt-1 text-slate-500">{formatDateTime(payment.created_at || payment.payment_date)} · {payment.payment_mode || '—'} · {formatINR(Number(payment.amount))}{payment.note ? ` · ${payment.note}` : ''}</p>)}</div>}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
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
    const { error } = await supabase.from('photographer_ledger').insert({
      partner_id: partner.id,
      photographer_name: partner.name,
      mobile: partner.mobile,
      entry_type: 'PAYMENT_SETTLED',
      description: note.trim() || 'Direct settlement',
      amount: value,
      payment_mode: paymentMode,
      payment_date: paymentDate,
    });
    setSaving(false);
    if (error) { toast('Failed to record settlement', 'error'); return; }
    toast('Settlement recorded', 'success');
    onSaved();
  };

  return (
    <Modal open={true} onClose={onClose} title={`Settle ${partner.name}`} size="md" dismissible={false}>
      <div className="space-y-4">
        <Field label="Settlement Amount (₹)"><input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} placeholder="0" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Payment Mode"><select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={selectClass}><option>Cash</option><option>UPI</option><option>Bank</option></select></Field>
          <Field label="Payment Date"><input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} /></Field>
        </div>
        <Field label="Remarks"><textarea value={note} onChange={(e) => setNote(e.target.value)} className={textareaClass} placeholder="Optional settlement remarks" /></Field>
        <div className="flex justify-end gap-3"><button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-white/10 dark:text-slate-300">Cancel</button><button onClick={handleSave} disabled={saving} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Record Settlement'}</button></div>
      </div>
    </Modal>
  );
}
