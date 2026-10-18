import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Sparkles, TrendingUp, TrendingDown, Wallet,
  Lock, Unlock, Trash2, ArrowDownCircle, ArrowUpCircle,
  BookOpen, IndianRupee, Calendar, Filter, PieChart, Pencil,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { DairyBookEntry, DairyOpeningBalance, DairyEntryType } from '@/lib/types';
import { formatINR, formatDate, todayISO } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import { useDraftState } from '@/lib/useDraftState';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, inputClass, selectClass, textareaClass } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { useRefresh } from '@/context/RefreshContext';

const ENTRY_TYPE_LABELS: Record<DairyEntryType, string> = {
  B2C_CASH_IN: 'B2C Cash In (Booking)',
  B2B_CASH_IN: 'B2B Cash In (Lab Order / Partner / Rental)',
  B2B_CASH_OUT: 'B2B Cash Out (Lab/Vendor)',
  MANUAL_EXPENSE: 'Extra Kharcha',
  MANUAL_INCOME: 'Extra Income',
};

const ENTRY_TYPE_COLORS: Record<DairyEntryType, 'emerald' | 'rose' | 'orange' | 'sky'> = {
  B2C_CASH_IN: 'emerald',
  B2B_CASH_IN: 'emerald',
  B2B_CASH_OUT: 'rose',
  MANUAL_EXPENSE: 'orange',
  MANUAL_INCOME: 'sky',
};

const EXPENSE_CATEGORIES = [
  'Fuel',
  'Tea/Snacks',
  'Helper Wage',
  'Studio Maintenance',
  'Equipment Repair',
  'Travel',
  'Electricity',
  'Internet',
  'Marketing',
  'Miscellaneous',
] as const;

const INCOME_CATEGORIES = [
  'Off-bill Cash',
  'Refund/Return',
  'Asset Sale',
  'Miscellaneous',
] as const;

const PAYMENT_MODES = ['Cash', 'UPI', 'Bank'] as const;

type PeriodFilter = 'daily' | 'monthly' | 'yearly' | 'custom';

export function DairyBook() {
  const { toast } = useToast();
  const { refreshToken } = useRefresh();
  const [entries, setEntries] = useState<DairyBookEntry[]>([]);
  const [partnerNamesByEntry, setPartnerNamesByEntry] = useState<Record<string, { partner: string; studio: string; orderNo?: string }>>({});
  const [opening, setOpening] = useState<DairyOpeningBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<PeriodFilter>('monthly');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showOpeningForm, setShowOpeningForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DairyBookEntry | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [entriesRes, openingRes, partnersRes, labOrdersRes] = await Promise.all([
      supabase.from('dairy_book_entries').select('*').order('entry_date', { ascending: false }),
      supabase.from('dairy_book_opening_balance').select('*').maybeSingle(),
      supabase.from('partners').select('name,mobile,studio_name'),
      supabase.from('studio_lab_orders').select('id,partner_name,studio_name'),
    ]);
    if (entriesRes.error || openingRes.error) {
      setLoadError(entriesRes.error?.message || openingRes.error?.message || 'Could not load Dairy Book data.');
      setLoading(false);
      return;
    }
    setLoadError('');
    const loadedEntries = (entriesRes.data ?? []) as DairyBookEntry[];
    const profiles = partnersRes.data ?? [];
    const orders = new Map((labOrdersRes.data ?? []).map((order) => [order.id, order]));
    const detailsByEntry: Record<string, { partner: string; studio: string; orderNo?: string }> = {};
    for (const entry of loadedEntries) {
      const sourceParts = String(entry.source_id ?? '').split(':');
      const order = sourceParts[0] === 'lab-order' ? orders.get(sourceParts[1]) : undefined;
      const party = String(entry.party_name ?? '').trim().toLocaleLowerCase();
      const profile = profiles.find((item) => String(item.name ?? '').trim().toLocaleLowerCase() === party || String(item.studio_name ?? '').trim().toLocaleLowerCase() === party);
      const partnerName = order?.partner_name || profile?.name || '';
      const studioName = order?.studio_name || profile?.studio_name || '';
      if (partnerName || studioName || order?.order_no) detailsByEntry[entry.id] = { partner: partnerName, studio: studioName, ...(order?.order_no ? { orderNo: order.order_no } : {}) };
    }
    setEntries(loadedEntries);
    setPartnerNamesByEntry(detailsByEntry);
    setOpening((openingRes.data as DairyOpeningBalance) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshToken]);

  const { dateFrom, dateTo } = useMemo(() => {
    const today = todayISO();
    if (period === 'daily') return { dateFrom: today, dateTo: today };
    if (period === 'monthly') {
      const ym = today.slice(0, 7);
      return { dateFrom: `${ym}-01`, dateTo: today };
    }
    if (period === 'yearly') {
      const y = today.slice(0, 4);
      return { dateFrom: `${y}-01-01`, dateTo: today };
    }
    return { dateFrom: customFrom, dateTo: customTo };
  }, [period, customFrom, customTo]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const q = search.toLowerCase();
      const matchesSearch = !q ||
        (e.party_name ?? '').toLowerCase().includes(q) ||
        (e.note ?? '').toLowerCase().includes(q) ||
        (e.category ?? '').toLowerCase().includes(q) ||
        (e.source_ref ?? '').toLowerCase().includes(q) ||
        (partnerNamesByEntry[e.id]?.partner ?? '').toLowerCase().includes(q) ||
        (partnerNamesByEntry[e.id]?.studio ?? '').toLowerCase().includes(q) ||
        (partnerNamesByEntry[e.id]?.orderNo ?? '').toLowerCase().includes(q);
      const matchesType = typeFilter === 'all' || e.entry_type === typeFilter;
      const matchesFrom = !dateFrom || (e.entry_date ?? '') >= dateFrom;
      const matchesTo = !dateTo || (e.entry_date ?? '') <= dateTo;
      return Boolean(e.deleted_at) === showArchived && matchesSearch && matchesType && matchesFrom && matchesTo;
    });
  }, [entries, search, typeFilter, dateFrom, dateTo, showArchived, partnerNamesByEntry]);

  const periodEntries = useMemo(() => entries.filter((entry) => {
    const matchesFrom = !dateFrom || (entry.entry_date ?? '') >= dateFrom;
    const matchesTo = !dateTo || (entry.entry_date ?? '') <= dateTo;
    return !entry.deleted_at && matchesFrom && matchesTo;
  }), [entries, dateFrom, dateTo]);

  const totals = useMemo(() => {
    const totalKamai = periodEntries
      .filter((e) => e.entry_type === 'B2C_CASH_IN' || e.entry_type === 'B2B_CASH_IN' || e.entry_type === 'MANUAL_INCOME')
      .reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const totalB2BLab = periodEntries
      .filter((e) => e.entry_type === 'B2B_CASH_OUT')
      .reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const totalExtraKharcha = periodEntries
      .filter((e) => e.entry_type === 'MANUAL_EXPENSE')
      .reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const totalKharcha = totalB2BLab + totalExtraKharcha;
    const asliFayda = totalKamai - totalKharcha;
    const totalIn = totalKamai;
    const totalOut = totalKharcha;
    const openingAmount = Number(opening?.opening_amount ?? 0);
    const effectiveDate = opening?.effective_date || '';
    const balanceAsOf = dateTo || todayISO();
    const hasOpeningBalance = !effectiveDate || balanceAsOf >= effectiveDate;
    const carriedEntries = entries.filter((entry) => !entry.deleted_at && (!effectiveDate || entry.entry_date >= effectiveDate) && entry.entry_date <= balanceAsOf);
    const carriedIn = carriedEntries.filter((entry) => entry.entry_type === 'B2C_CASH_IN' || entry.entry_type === 'B2B_CASH_IN' || entry.entry_type === 'MANUAL_INCOME').reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
    const carriedOut = carriedEntries.filter((entry) => entry.entry_type === 'B2B_CASH_OUT' || entry.entry_type === 'MANUAL_EXPENSE').reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
    const inHandBalance = hasOpeningBalance ? openingAmount + carriedIn - carriedOut : null;
    return { totalKamai, totalB2BLab, totalExtraKharcha, totalKharcha, asliFayda, totalIn, totalOut, openingAmount, inHandBalance };
  }, [periodEntries, entries, opening, dateTo]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    filtered
      .filter((e) => e.entry_type === 'MANUAL_EXPENSE')
      .forEach((e) => {
        const cat = e.category || 'Uncategorized';
        map.set(cat, (map.get(cat) ?? 0) + Number(e.amount ?? 0));
      });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const handleDelete = async () => {
    if (!deleteId) return;
    const target = entries.find((entry) => entry.id === deleteId);
    if (target?.is_auto) { toast('Automatically synced entries are managed from their source payment.', 'error'); setDeleteId(null); return; }
    const { error } = await supabase.from('dairy_book_entries').update({ deleted_at: new Date().toISOString() }).eq('id', deleteId);
    if (error) { toast(`Could not archive entry: ${error.message}`, 'error'); return; }
    toast('Entry archived', 'success');
    setDeleteId(null);
    load();
  };

  const restoreEntry = async (id: string) => {
    const { error } = await supabase.from('dairy_book_entries').update({ deleted_at: null }).eq('id', id);
    if (error) { toast(`Could not restore entry: ${error.message}`, 'error'); return; }
    toast('Entry restored', 'success');
    void load();
  };

  const toggleOpeningLock = async () => {
    if (!opening) return;
    const updated = { ...opening, is_locked: !opening.is_locked, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('dairy_book_opening_balance').update(updated).eq('id', 1);
    if (error) { toast(`Could not update opening balance lock: ${error.message}`, 'error'); return; }
    setOpening(updated);
    toast(opening.is_locked ? 'Opening balance unlocked' : 'Opening balance locked', 'success');
  };

  return (
    <div className="relative flex w-full flex-col space-y-2">
      {/* Header */}
      <div className="sticky top-0 z-30 flex w-full items-center justify-between gap-2 bg-[#0B1121]/90 px-0 py-2 shadow-md backdrop-blur-md sm:px-4 md:gap-0 md:py-2">
        <div className="min-w-0 flex-1 md:w-auto md:flex-none">
          <h1 className="truncate text-sm font-bold text-white sm:text-lg md:text-xl">Dairy Book</h1>
          <p className="hidden truncate text-xs text-slate-400 sm:block">Daily cash-flow ledger — auto-synced + manual entries</p>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-2 md:w-auto">
          <button
            onClick={() => setShowExpenseForm(true)}
            aria-label="Add Expense"
            title="Add Expense"
            className="flex shrink-0 items-center gap-1 rounded-lg bg-rose-500 px-2 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-rose-400 sm:px-3 sm:text-xs"
          >
            <Plus className="h-4 w-4" /><span className="hidden sm:inline">Add Expense</span>
          </button>
          <button
            onClick={() => setShowIncomeForm(true)}
            aria-label="Add Income"
            title="Add Income"
            className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500 px-2 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-emerald-400 sm:px-3 sm:text-xs"
          >
            <Plus className="h-4 w-4" /><span className="hidden sm:inline">Add Income</span>
          </button>
        </div>
      </div>

      <div className="w-full space-y-3 px-0 sm:px-3 md:px-4">
      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"><span>Could not load Dairy Book: {loadError}</span><button onClick={() => { void load(); }} className="font-semibold underline">Retry</button></div>}
      {/* Opening Balance Card */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-3 dark:border-white/10 dark:from-slate-900/50 dark:to-slate-900/30">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
            <Wallet className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Opening Balance · from {opening?.effective_date ? formatDate(opening.effective_date) : 'start date not set'}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{formatINR(Number(opening?.opening_amount ?? 0))}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOpeningForm(true)}
            disabled={opening?.is_locked}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Edit
          </button>
          <button
            onClick={toggleOpeningLock}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              opening?.is_locked
                ? 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300'
            }`}
          >
            {opening?.is_locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            {opening?.is_locked ? 'Locked' : 'Unlocked'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Cash Received (Collected)</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatINR(totals.totalKamai)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10">
              <TrendingDown className="h-5 w-5 text-rose-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Cash Expenses (Paid)</p>
              <p className="text-lg font-bold text-rose-600 dark:text-rose-400">{formatINR(totals.totalKharcha)}</p>
              <p className="text-[10px] text-slate-400">B2B Lab: {formatINR(totals.totalB2BLab)} + Extra: {formatINR(totals.totalExtraKharcha)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
              <IndianRupee className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Net Cash Flow (Income − Expenses)</p>
              <p className={`text-lg font-bold ${totals.asliFayda >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{formatINR(totals.asliFayda)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Wallet className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">In-Hand Closing Balance</p>
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{totals.inHandBalance == null ? 'Not available' : formatINR(totals.inHandBalance)}</p>
              <p className="text-[10px] text-slate-400">Closing cash as of {formatDate(dateTo || todayISO())}; includes entries since opening date</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2"><button onClick={() => setShowArchived(false)} className={`rounded-lg px-3 py-2 text-xs font-medium ${!showArchived ? 'bg-amber-500 text-slate-900' : 'border border-slate-200 dark:border-white/10 dark:text-slate-300'}`}>Active</button><button onClick={() => setShowArchived(true)} className={`rounded-lg px-3 py-2 text-xs font-medium ${showArchived ? 'bg-amber-500 text-slate-900' : 'border border-slate-200 dark:border-white/10 dark:text-slate-300'}`}>Archived</button></div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, category, note, or ref..."
            className={`${inputClass} pl-10`}
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-1 dark:border-white/10">
          {(['daily', 'monthly', 'yearly', 'custom'] as PeriodFilter[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                period === p
                  ? 'bg-amber-500 text-slate-900'
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={`${selectClass} w-40`}>
          <option value="all">All Types</option>
          <option value="B2C_CASH_IN">{ENTRY_TYPE_LABELS.B2C_CASH_IN}</option>
          <option value="B2B_CASH_IN">{ENTRY_TYPE_LABELS.B2B_CASH_IN}</option>
          <option value="B2B_CASH_OUT">{ENTRY_TYPE_LABELS.B2B_CASH_OUT}</option>
          <option value="MANUAL_EXPENSE">{ENTRY_TYPE_LABELS.MANUAL_EXPENSE}</option>
          <option value="MANUAL_INCOME">{ENTRY_TYPE_LABELS.MANUAL_INCOME}</option>
        </select>
        {period === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={`${inputClass} w-36`} />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={`${inputClass} w-36`} />
          </>
        )}
      </div>

      {/* Category Breakdown */}
      {!showArchived && categoryBreakdown.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900/50">
          <div className="mb-3 flex items-center gap-2">
            <PieChart className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Extra Kharcha Breakdown</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {categoryBreakdown.map(([cat, amt]) => {
              const max = categoryBreakdown[0][1] || 1;
              const pct = Math.round((amt / max) * 100);
              return (
                <div key={cat} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50" style={{ minWidth: `${Math.max(140, pct * 2.5)}px` }}>
                  <div className="h-2 w-2 rounded-full bg-orange-500" />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{cat}</span>
                  <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{formatINR(amt)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Entries Table */}
      {loading ? (
        <div className="flex justify-center py-20"><Sparkles className="h-6 w-6 animate-pulse text-amber-500" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title={showArchived ? 'No archived entries' : 'No entries found'} subtitle={showArchived ? 'Archived manual entries will appear here' : 'Add an expense or income, or change filters'} />
      ) : (
        <>
        <div className="space-y-2 md:hidden">
          {filtered.map((e) => {
            const isIn = e.entry_type === 'B2C_CASH_IN' || e.entry_type === 'B2B_CASH_IN' || e.entry_type === 'MANUAL_INCOME';
            return (
              <div key={e.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900/60">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-medium text-slate-900 dark:text-white">{e.party_name || '—'}</p>
                    {partnerNamesByEntry[e.id] && <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">{partnerNamesByEntry[e.id].orderNo ? `Order: ${partnerNamesByEntry[e.id].orderNo} · ` : ''}Partner: {partnerNamesByEntry[e.id].partner || '—'} · Studio: {partnerNamesByEntry[e.id].studio || '—'}</p>}
                    {e.note && <p className="mt-0.5 break-words text-xs text-slate-500 dark:text-slate-400">{e.note}</p>}
                    {e.source_ref && <p className="mt-0.5 break-all text-[10px] text-slate-400">Ref: {e.source_ref}</p>}
                  </div>
                  <p className={`shrink-0 text-right text-sm font-bold ${isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{isIn ? '+' : '-'}{formatINR(Number(e.amount ?? 0))}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge color={ENTRY_TYPE_COLORS[e.entry_type]} size="sm">{ENTRY_TYPE_LABELS[e.entry_type]}</Badge>
                  <span className="text-slate-500 dark:text-slate-400">{e.category || '—'}</span>
                  <Badge color="slate" size="sm">{e.payment_mode}</Badge>
                  <span className="ml-auto text-slate-500 dark:text-slate-400">{formatDate(e.entry_date)}</span>
                  {showArchived ? <button onClick={() => void restoreEntry(e.id)} className="rounded border border-emerald-500/30 px-2 py-1 text-emerald-500">Restore</button> : !e.is_auto && <><button onClick={() => { setEditingEntry(e); if (e.entry_type === 'MANUAL_EXPENSE') setShowExpenseForm(true); else setShowIncomeForm(true); }} aria-label="Edit entry" className="p-1 text-slate-400 hover:text-amber-500"><Pencil className="h-4 w-4" /></button><button onClick={() => setDeleteId(e.id)} aria-label="Archive entry" className="p-1 text-slate-400 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button></>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 md:block">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/50">
                <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                  <th className="px-2.5 py-2">Type</th>
                  <th className="px-2.5 py-2">Party / Description</th>
                  <th className="px-2.5 py-2">Category</th>
                  <th className="px-2.5 py-2">Mode</th>
                  <th className="px-2.5 py-2 text-right">Amount</th>
                  <th className="px-2.5 py-2">Date</th>
                  <th className="px-2.5 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const isIn = e.entry_type === 'B2C_CASH_IN' || e.entry_type === 'B2B_CASH_IN' || e.entry_type === 'MANUAL_INCOME';
                  return (
                    <tr key={e.id} className="border-t border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5">
                      <td className="px-2.5 py-2">
                        <div className="flex items-center gap-2">
                          {isIn ? (
                            <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <ArrowDownCircle className="h-4 w-4 text-rose-500" />
                          )}
                          <Badge color={ENTRY_TYPE_COLORS[e.entry_type]} size="sm">
                            {ENTRY_TYPE_LABELS[e.entry_type]}
                          </Badge>
                          <span className="text-[10px] text-slate-400">{e.is_auto ? 'Auto' : 'Manual'}</span>
                        </div>
                      </td>
                      <td className="px-2.5 py-2">
                        <p className="font-medium text-slate-900 dark:text-white">{e.party_name || '—'}</p>
                        {partnerNamesByEntry[e.id] && <p className="text-[11px] text-amber-600 dark:text-amber-400">{partnerNamesByEntry[e.id].orderNo ? `Order: ${partnerNamesByEntry[e.id].orderNo} · ` : ''}Partner: {partnerNamesByEntry[e.id].partner || '—'} · Studio: {partnerNamesByEntry[e.id].studio || '—'}</p>}
                        {e.note && <p className="text-xs text-slate-400">{e.note}</p>}
                        {e.source_ref && <p className="text-[10px] text-slate-400">Ref: {e.source_ref}</p>}
                      </td>
                      <td className="px-2.5 py-2 text-slate-600 dark:text-slate-300">{e.category || '—'}</td>
                      <td className="px-2.5 py-2"><Badge color="slate" size="sm">{e.payment_mode}</Badge></td>
                      <td className={`px-2.5 py-2 text-right font-semibold ${isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {isIn ? '+' : '-'}{formatINR(Number(e.amount ?? 0))}
                      </td>
                      <td className="px-2.5 py-2 text-slate-500 dark:text-slate-400">{formatDate(e.entry_date)}</td>
                      <td className="px-2.5 py-2">
                        {showArchived ? <button onClick={() => void restoreEntry(e.id)} className="text-emerald-500">Restore</button> : !e.is_auto && <div className="flex items-center gap-2"><button onClick={() => { setEditingEntry(e); if (e.entry_type === 'MANUAL_EXPENSE') setShowExpenseForm(true); else setShowIncomeForm(true); }} aria-label="Edit entry" className="text-slate-400 hover:text-amber-500"><Pencil className="h-4 w-4" /></button><button onClick={() => setDeleteId(e.id)} aria-label="Archive entry" className="text-slate-400 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button></div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {/* Manual Entry Forms */}
      <ManualEntryForm
        open={showExpenseForm}
        onClose={() => { setShowExpenseForm(false); setEditingEntry(null); }}
        onSaved={() => { setShowExpenseForm(false); setEditingEntry(null); void load(); }}
        entryType="MANUAL_EXPENSE"
        categories={[...EXPENSE_CATEGORIES]}
        existing={editingEntry?.entry_type === 'MANUAL_EXPENSE' ? editingEntry : null}
      />
      <ManualEntryForm
        open={showIncomeForm}
        onClose={() => { setShowIncomeForm(false); setEditingEntry(null); }}
        onSaved={() => { setShowIncomeForm(false); setEditingEntry(null); void load(); }}
        entryType="MANUAL_INCOME"
        categories={[...INCOME_CATEGORIES]}
        existing={editingEntry?.entry_type === 'MANUAL_INCOME' ? editingEntry : null}
      />

      {/* Opening Balance Form */}
      <OpeningBalanceForm
        open={showOpeningForm}
        onClose={() => setShowOpeningForm(false)}
        onSaved={() => { setShowOpeningForm(false); load(); }}
        current={opening}
      />

      {/* Delete Confirm */}
      {deleteId && (
        <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Archive Entry" size="sm">
          <p className="text-sm text-slate-600 dark:text-slate-300">Archive this entry? You can restore it later from Archived entries.</p>
          <div className="mt-4 flex justify-end gap-3">
            <button onClick={() => setDeleteId(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
            <button onClick={handleDelete} className="rounded-lg bg-rose-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-400">Archive</button>
          </div>
        </Modal>
      )}
      </div>
    </div>
  );
}

function ManualEntryForm({
  open, onClose, onSaved, entryType, categories, existing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  entryType: DairyEntryType;
  categories: string[];
  existing: DairyBookEntry | null;
}) {
  const { toast } = useToast();
  const isExpense = entryType === 'MANUAL_EXPENSE';
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useDraftState<string>(`dairy-${entryType}-amount`, String(existing?.amount ?? ''));
  const [category, setCategory] = useDraftState<string>(`dairy-${entryType}-category`, existing?.category || categories[0]);
  const [note, setNote] = useDraftState<string>(`dairy-${entryType}-note`, existing?.note || '');
  const [paymentMode, setPaymentMode] = useDraftState<string>(`dairy-${entryType}-mode`, existing?.payment_mode || 'Cash');
  const [entryDate, setEntryDate] = useDraftState<string>(`dairy-${entryType}-date`, existing?.entry_date || todayISO());
  const [partyName, setPartyName] = useDraftState<string>(`dairy-${entryType}-party`, existing?.party_name || '');

  useEffect(() => {
    if (!open) return;
    setAmount(String(existing?.amount ?? ''));
    setCategory(existing?.category || categories[0]);
    setNote(existing?.note || '');
    setPaymentMode(existing?.payment_mode || 'Cash');
    setEntryDate(existing?.entry_date || todayISO());
    setPartyName(existing?.party_name || '');
  }, [open, existing, categories, setAmount, setCategory, setNote, setPaymentMode, setEntryDate, setPartyName]);

  const clearDraft = () => {
    setAmount('');
    setCategory(categories[0]);
    setNote('');
    setPaymentMode('Cash');
    setEntryDate(todayISO());
    setPartyName('');
  };

  const handleSave = async () => {
    if (saving) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast('Valid amount is required', 'error'); return; }
    const payload: Omit<DairyBookEntry, 'id' | 'created_at' | 'updated_at' | 'is_demo' | 'isDemo'> = {
      entry_type: entryType,
      is_auto: false,
      source_table: null,
      source_id: null,
      source_ref: null,
      party_name: partyName,
      amount: amt,
      category,
      payment_mode: paymentMode,
      note,
      entry_date: entryDate,
    };
    setSaving(true);
    try {
      const { error } = existing
        ? await supabase.from('dairy_book_entries').update(payload).eq('id', existing.id)
        : await supabase.from('dairy_book_entries').insert(payload);
      if (error) throw error;
      toast(existing ? 'Entry updated' : isExpense ? 'Expense recorded' : 'Income recorded', 'success');
      clearDraft();
      onSaved();
    } catch (error) {
      toast(`Could not save entry: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    clearDraft();
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={existing ? `Edit ${isExpense ? 'Expense' : 'Income'}` : isExpense ? 'Add Extra Expense' : 'Add Extra Income'} size="md" dismissible={false}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount (₹)">
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }} className={inputClass} placeholder="0" />
          </Field>
          <Field label="Date">
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
              {category && !categories.includes(category) && <option value={category}>{category}</option>}
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Payment Mode">
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={selectClass}>
              {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Party / Description (optional)">
          <input value={partyName} onChange={(e) => setPartyName(e.target.value)} className={inputClass} placeholder={isExpense ? 'e.g. Ravi Helper, Petrol Pump' : 'e.g. Cash sale, Refund from vendor'} />
        </Field>
        <Field label="Note">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} className={textareaClass} placeholder="Optional note..." />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={handleClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium text-white ${isExpense ? 'bg-rose-500 hover:bg-rose-400' : 'bg-emerald-500 hover:bg-emerald-400'}`}
          >
            {saving ? 'Saving…' : existing ? 'Save Changes' : isExpense ? 'Record Expense' : 'Record Income'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function OpeningBalanceForm({
  open, onClose, onSaved, current,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  current: DairyOpeningBalance | null;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useDraftState<string>('dairy-opening-amount', String(current?.opening_amount ?? '0'));
  const [effectiveDate, setEffectiveDate] = useDraftState<string>('dairy-opening-date', current?.effective_date || todayISO());

  useEffect(() => {
    if (open) {
      setAmount(String(current?.opening_amount ?? '0'));
      setEffectiveDate(current?.effective_date || todayISO());
    }
  }, [open, current, setAmount, setEffectiveDate]);

  const handleSave = async () => {
    if (saving) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) { toast('Valid amount is required', 'error'); return; }
    const payload = {
      id: 1,
      opening_amount: amt,
      is_locked: current?.is_locked ?? false,
      effective_date: effectiveDate,
      updated_at: new Date().toISOString(),
    };
    setSaving(true);
    try {
      const { error } = await supabase.from('dairy_book_opening_balance').upsert(payload);
      if (error) throw error;
      toast('Opening balance updated', 'success');
      onSaved();
    } catch (error) {
      toast(`Could not save opening balance: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Set Daily Opening Balance" size="sm" dismissible={false}>
      <div className="space-y-4">
        <Field label="Opening Amount (₹)">
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }} className={inputClass} placeholder="0" />
        </Field>
        <Field label="Effective From">
          <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={inputClass} />
        </Field>
        <p className="text-xs text-slate-400">Lock the opening balance from the main screen to prevent accidental changes.</p>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-amber-400 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </Modal>
  );
}
