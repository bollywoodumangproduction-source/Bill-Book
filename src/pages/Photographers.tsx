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
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type {
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
  balance: number;
}

export function Ledger() {
  const { toast } = useToast();
  const { settings } = useSettings();
  const { refreshToken } = useRefresh();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<PhotographerLedgerEntry[]>([]);
  const [directTxns, setDirectTxns] = useState<DirectTransaction[]>([]);
  const [loading, setLoading] = useState(true);

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
    const [{ data: p }, { data: le }, { data: dt }] = await Promise.all([
      supabase.from('partners').select('*').order('created_at'),
      supabase.from('photographer_ledger').select('*').order('created_at'),
      supabase.from('direct_transactions').select('*').order('created_at'),
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
    setPartners(surviving);
    setLedgerEntries((le ?? []) as PhotographerLedgerEntry[]);
    setDirectTxns((dt ?? []) as DirectTransaction[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshToken]);

  const balances = useMemo<PartnerBalance[]>(() => {
    return partners.map((partner) => {
      const mobile = partner.mobile;
      const pLedger = ledgerEntries.filter((e) => e.mobile === mobile);
      const pDirect = directTxns.filter((d) => d.partner_id === partner.id);

      const totalCredit = pLedger.filter((e) => e.entry_type === 'SHOOT_DUTY_CREDIT').reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const totalDebit = pLedger.filter((e) => e.entry_type === 'LAB_WORK_DEBIT').reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const totalSettled = pLedger.filter((e) => e.entry_type === 'PAYMENT_SETTLED').reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const directGiven = pDirect.filter((d) => d.txn_type === 'Given').reduce((s, d) => s + Number(d.amount ?? 0), 0);
      const directReceived = pDirect.filter((d) => d.txn_type === 'Received').reduce((s, d) => s + Number(d.amount ?? 0), 0);

      const balance = totalCredit + directReceived - totalDebit - totalSettled - directGiven;

      return { partner, totalCredit, totalDebit, totalSettled, directGiven, directReceived, balance };
    });
  }, [partners, ledgerEntries, directTxns]);

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
      await supabase.from('photographer_ledger').delete().eq('mobile', partner.mobile);
    }
    await supabase.from('partners').delete().eq('id', permanentDeleteId);
    toast('Partner permanently deleted', 'success');
    setPermanentDeleteId(null);
    load();
  };

  const partnerDirectTxns = (pid: string) => directTxns.filter((d) => d.partner_id === pid);
  const partnerLedger = (mobile: string) => ledgerEntries.filter((e) => e.mobile === mobile);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Ledger</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Partner ledger — credits, debits & direct transactions</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setEditingPartner(null); setShowPartnerForm(true); }}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-amber-400"
          >
            <Plus className="h-4 w-4" /> Add Partner
          </button>
          <button
            onClick={() => setShowDirectTxn(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <Wallet className="h-4 w-4" /> Quick Entry
          </button>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex flex-wrap gap-2">
        <TabButton active={view === 'main'} onClick={() => { setView('main'); setCategoryFilter('all'); }} icon={Users} label="Partners" count={balances.filter((b) => b.partner.status === 'Active' || b.partner.status === 'Inactive').length} />
        <TabButton active={view === 'archived'} onClick={() => { setView('archived'); setCategoryFilter('all'); }} icon={FolderArchive} label="Archived" count={balances.filter((b) => b.partner.status === 'Archived').length} />
        <TabButton active={view === 'trash'} onClick={() => { setView('trash'); setCategoryFilter('all'); }} icon={Trash2} label="Recycle Bin" count={balances.filter((b) => b.partner.status === 'Trash').length} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
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
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Sparkles className="h-6 w-6 animate-pulse text-amber-500" /></div>
      ) : view === 'main' ? (
        <MainView
          active={activePartners}
          inactive={inactivePartners}
          onOpen={(p) => setDetailPartner(p)}
          onEdit={(p) => { setEditingPartner(p); setShowPartnerForm(true); }}
          onArchive={(id) => setArchiveId(id)}
        />
      ) : view === 'archived' ? (
        <ArchivedView
          items={filteredBalances}
          onOpen={(p) => setDetailPartner(p)}
          onRestore={(id) => { updatePartnerStatus(id, 'Active', { trashed_at: null }); toast('Partner restored to Active', 'success'); }}
          onTrash={(id) => setTrashId(id)}
        />
      ) : (
        <TrashView
          items={filteredBalances}
          onOpen={(p) => setDetailPartner(p)}
          onRestore={(id) => { updatePartnerStatus(id, 'Active'); toast('Partner restored from Recycle Bin', 'success'); }}
          onPermanentDelete={(id) => setPermanentDeleteId(id)}
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
          ledgerEntries={partnerLedger(detailPartner.mobile)}
          onClose={() => setDetailPartner(null)}
          onSettle={() => setSettlePartner(detailPartner)}
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
  );
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

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Credit</p>
          <p className="text-sm font-semibold text-emerald-500 dark:text-emerald-400">{formatINR(b.totalCredit + b.directReceived)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Debit</p>
          <p className="text-sm font-semibold text-rose-500 dark:text-rose-400">{formatINR(b.totalDebit + b.totalSettled + b.directGiven)}</p>
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
        <button onClick={() => onOpen(b.partner)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200">
          <CatIcon className="h-3.5 w-3.5" /> Ledger
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
  onRestore,
  onTrash,
}: {
  items: PartnerBalance[];
  onOpen: (p: Partner) => void;
  onRestore: (id: string) => void;
  onTrash: (id: string) => void;
}) {
  if (items.length === 0) {
    return <EmptyState icon={FolderArchive} title="No archived partners" subtitle="Archived partners will appear here" />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((b) => (
        <PartnerCard key={b.partner.id} b={b} onOpen={onOpen} showRestore onRestore={onRestore} showTrash onTrash={onTrash} />
      ))}
    </div>
  );
}

function TrashView({
  items,
  onOpen,
  onRestore,
  onPermanentDelete,
}: {
  items: PartnerBalance[];
  onOpen: (p: Partner) => void;
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
}) {
  if (items.length === 0) {
    return <EmptyState icon={Trash2} title="Recycle Bin is empty" subtitle={`Deleted partners are retained for ${TRASH_RETENTION_DAYS} days, then permanently purged`} />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((b) => (
        <PartnerCard key={b.partner.id} b={b} onOpen={onOpen} showRestore onRestore={onRestore} onPermanentDelete={onPermanentDelete} />
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

    const duplicate = existing.find((p) => p.mobile === cleanMobile && p.id !== editing?.id);
    if (duplicate) {
      toast(`A partner with mobile ${cleanMobile} already exists: ${duplicate.name}`, 'error');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from('partners').update({
          name: name.trim(),
          mobile: cleanMobile,
          studio_name: studioName.trim(),
          studio_address: studioAddress.trim(),
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

function PartnerDetailModal({
  partner,
  directTxns,
  ledgerEntries,
  onClose,
  onSettle,
}: {
  partner: Partner;
  directTxns: DirectTransaction[];
  ledgerEntries: PhotographerLedgerEntry[];
  onClose: () => void;
  onSettle: () => void;
}) {
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
    <Modal open={true} onClose={onClose} title={partner.name} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={CATEGORY_COLORS[partner.category]}>{partner.category}</Badge>
          <Badge color={partner.status === 'Active' ? 'emerald' : partner.status === 'On Leave' ? 'amber' : partner.status === 'Inactive' ? 'slate' : 'amber'}>{partner.status === 'Inactive' ? 'Left Studio / Inactive' : partner.status}</Badge>
          <span className="text-xs text-slate-500 dark:text-slate-400">{partner.mobile}</span>
        </div>
        <button onClick={onSettle} className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600">
          <Wallet className="h-3.5 w-3.5" /> Direct Settle
        </button>

        <div className="grid grid-cols-3 gap-3">
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
        </div>

        <div className="border-t border-slate-200 pt-3 dark:border-white/10">
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
        </div>
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
    const { error } = await supabase.from('photographer_ledger').insert({
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
