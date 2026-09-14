import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Sparkles, TrendingUp, TrendingDown, Wallet,
  Lock, Unlock, Trash2, ArrowDownCircle, ArrowUpCircle,
  BookOpen, IndianRupee, Calendar, Filter, PieChart,
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
  B2B_CASH_OUT: 'B2B Cash Out (Lab/Vendor)',
  MANUAL_EXPENSE: 'Extra Kharcha',
  MANUAL_INCOME: 'Extra Income',
};

const ENTRY_TYPE_COLORS: Record<DairyEntryType, 'emerald' | 'rose' | 'orange' | 'sky'> = {
  B2C_CASH_IN: 'emerald',
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
  const [opening, setOpening] = useState<DairyOpeningBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<PeriodFilter>('monthly');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showOpeningForm, setShowOpeningForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [entriesRes, openingRes] = await Promise.all([
      supabase.from('dairy_book_entries').select('*').order('entry_date', { ascending: false }),
      supabase.from('dairy_book_opening_balance').select('*').maybeSingle(),
    ]);
    setEntries((entriesRes.data ?? []) as DairyBookEntry[]);
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
        (e.source_ref ?? '').toLowerCase().includes(q);
      const matchesType = typeFilter === 'all' || e.entry_type === typeFilter;
      const matchesFrom = !dateFrom || (e.entry_date ?? '') >= dateFrom;
      const matchesTo = !dateTo || (e.entry_date ?? '') <= dateTo;
      return matchesSearch && matchesType && matchesFrom && matchesTo;
    });
  }, [entries, search, typeFilter, dateFrom, dateTo]);

  const totals = useMemo(() => {
    const totalKamai = filtered
      .filter((e) => e.entry_type === 'B2C_CASH_IN' || e.entry_type === 'MANUAL_INCOME')
      .reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const totalB2BLab = filtered
      .filter((e) => e.entry_type === 'B2B_CASH_OUT')
      .reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const totalExtraKharcha = filtered
      .filter((e) => e.entry_type === 'MANUAL_EXPENSE')
      .reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const totalKharcha = totalB2BLab + totalExtraKharcha;
    const asliFayda = totalKamai - totalKharcha;
    const totalIn = totalKamai;
    const totalOut = totalKharcha;
    const openingAmount = Number(opening?.opening_amount ?? 0);
    const inHandBalance = openingAmount + totalIn - totalOut;
    return { totalKamai, totalB2BLab, totalExtraKharcha, totalKharcha, asliFayda, totalIn, totalOut, openingAmount, inHandBalance };
  }, [filtered, opening]);

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
    await supabase.from('dairy_book_entries').delete().eq('id', deleteId);
    toast('Entry deleted', 'success');
    setDeleteId(null);
    load();
  };

  const toggleOpeningLock = async () => {
    if (!opening) return;
    const updated = { ...opening, is_locked: !opening.is_locked, updated_at: new Date().toISOString() };
    await supabase.from('dairy_book_opening_balance').update(updated).eq('id', 1);
    setOpening(updated);
    toast(opening.is_locked ? 'Opening balance unlocked' : 'Opening balance locked', 'success');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dairy Book</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Daily cash-flow ledger — auto-synced + manual entries</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowExpenseForm(true)}
            className="flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-400"
          >
            <Plus className="h-4 w-4" /> Add Expense
          </button>
          <button
            onClick={() => setShowIncomeForm(true)}
            className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-400"
          >
            <Plus className="h-4 w-4" /> Add Income
          </button>
        </div>
      </div>

      {/* Opening Balance Card */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4 dark:border-white/10 dark:from-slate-900/50 dark:to-slate-900/30">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
            <Wallet className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Daily Opening Balance</p>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Kamai (Gross Revenue)</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatINR(totals.totalKamai)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10">
              <TrendingDown className="h-5 w-5 text-rose-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Kharcha (Expenses)</p>
              <p className="text-lg font-bold text-rose-600 dark:text-rose-400">{formatINR(totals.totalKharcha)}</p>
              <p className="text-[10px] text-slate-400">B2B Lab: {formatINR(totals.totalB2BLab)} + Extra: {formatINR(totals.totalExtraKharcha)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
              <IndianRupee className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Asli Fayda (Net Profit)</p>
              <p className={`text-lg font-bold ${totals.asliFayda >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{formatINR(totals.asliFayda)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Wallet className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">In-Hand Closing Balance</p>
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatINR(totals.inHandBalance)}</p>
              <p className="text-[10px] text-slate-400">Opening {formatINR(totals.openingAmount)} + In {formatINR(totals.totalIn)} - Out {formatINR(totals.totalOut)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
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
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
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
          <option value="B2C_CASH_IN">B2C Cash In</option>
          <option value="B2B_CASH_OUT">B2B Cash Out</option>
          <option value="MANUAL_EXPENSE">Manual Expense</option>
          <option value="MANUAL_INCOME">Manual Income</option>
        </select>
        {period === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={`${inputClass} w-36`} />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={`${inputClass} w-36`} />
          </>
        )}
      </div>

      {/* Category Breakdown */}
      {categoryBreakdown.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/50">
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
        <EmptyState icon={BookOpen} title="No entries found" subtitle="Add an expense or income, or change filters" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/50">
                <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Party / Description</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Mode</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const isIn = e.entry_type === 'B2C_CASH_IN' || e.entry_type === 'MANUAL_INCOME';
                  return (
                    <tr key={e.id} className="border-t border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {isIn ? (
                            <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <ArrowDownCircle className="h-4 w-4 text-rose-500" />
                          )}
                          <Badge color={ENTRY_TYPE_COLORS[e.entry_type]} size="sm">
                            {e.is_auto ? 'Auto' : 'Manual'}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-900 dark:text-white">{e.party_name || '—'}</p>
                        {e.note && <p className="text-xs text-slate-400">{e.note}</p>}
                        {e.source_ref && <p className="text-[10px] text-slate-400">Ref: {e.source_ref}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{e.category || '—'}</td>
                      <td className="px-3 py-2.5"><Badge color="slate" size="sm">{e.payment_mode}</Badge></td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {isIn ? '+' : '-'}{formatINR(Number(e.amount ?? 0))}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{formatDate(e.entry_date)}</td>
                      <td className="px-3 py-2.5">
                        {!e.is_auto && (
                          <button onClick={() => setDeleteId(e.id)} className="text-slate-400 hover:text-rose-500">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manual Entry Forms */}
      <ManualEntryForm
        open={showExpenseForm}
        onClose={() => setShowExpenseForm(false)}
        onSaved={() => { setShowExpenseForm(false); load(); }}
        entryType="MANUAL_EXPENSE"
        categories={[...EXPENSE_CATEGORIES]}
      />
      <ManualEntryForm
        open={showIncomeForm}
        onClose={() => setShowIncomeForm(false)}
        onSaved={() => { setShowIncomeForm(false); load(); }}
        entryType="MANUAL_INCOME"
        categories={[...INCOME_CATEGORIES]}
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
        <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Entry" size="sm">
          <p className="text-sm text-slate-600 dark:text-slate-300">Are you sure you want to delete this entry? This cannot be undone.</p>
          <div className="mt-4 flex justify-end gap-3">
            <button onClick={() => setDeleteId(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
            <button onClick={handleDelete} className="rounded-lg bg-rose-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-400">Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ManualEntryForm({
  open, onClose, onSaved, entryType, categories,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  entryType: DairyEntryType;
  categories: string[];
}) {
  const { toast } = useToast();
  const isExpense = entryType === 'MANUAL_EXPENSE';
  const [amount, setAmount] = useDraftState<string>(`dairy-${entryType}-amount`, '');
  const [category, setCategory] = useDraftState<string>(`dairy-${entryType}-category`, categories[0]);
  const [note, setNote] = useDraftState<string>(`dairy-${entryType}-note`, '');
  const [paymentMode, setPaymentMode] = useDraftState<string>(`dairy-${entryType}-mode`, 'Cash');
  const [entryDate, setEntryDate] = useDraftState<string>(`dairy-${entryType}-date`, todayISO());
  const [partyName, setPartyName] = useDraftState<string>(`dairy-${entryType}-party`, '');

  const clearDraft = () => {
    setAmount('');
    setCategory(categories[0]);
    setNote('');
    setPaymentMode('Cash');
    setEntryDate(todayISO());
    setPartyName('');
  };

  const handleSave = async () => {
    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) { toast('Valid amount is required', 'error'); return; }
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
    await supabase.from('dairy_book_entries').insert(payload);
    toast(isExpense ? 'Expense recorded' : 'Income recorded', 'success');
    clearDraft();
    onSaved();
  };

  const handleClose = () => {
    clearDraft();
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={isExpense ? 'Add Extra Expense' : 'Add Extra Income'} size="md" dismissible={false}>
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
            className={`rounded-lg px-4 py-2.5 text-sm font-medium text-white ${isExpense ? 'bg-rose-500 hover:bg-rose-400' : 'bg-emerald-500 hover:bg-emerald-400'}`}
          >
            {isExpense ? 'Record Expense' : 'Record Income'}
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
  const [amount, setAmount] = useDraftState<string>('dairy-opening-amount', String(current?.opening_amount ?? '0'));
  const [effectiveDate, setEffectiveDate] = useDraftState<string>('dairy-opening-date', current?.effective_date || todayISO());

  useEffect(() => {
    if (open) {
      setAmount(String(current?.opening_amount ?? '0'));
      setEffectiveDate(current?.effective_date || todayISO());
    }
  }, [open, current, setAmount, setEffectiveDate]);

  const handleSave = async () => {
    const amt = Number(amount);
    if (isNaN(amt) || amt < 0) { toast('Valid amount is required', 'error'); return; }
    const payload = {
      id: 1,
      opening_amount: amt,
      is_locked: current?.is_locked ?? false,
      effective_date: effectiveDate,
      updated_at: new Date().toISOString(),
    };
    await supabase.from('dairy_book_opening_balance').upsert(payload);
    toast('Opening balance updated', 'success');
    onSaved();
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
          <button onClick={handleSave} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-amber-400">Save</button>
        </div>
      </div>
    </Modal>
  );
}
