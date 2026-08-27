import { useCallback, useEffect, useState } from 'react';
import { Plus, Search, Sparkles, Trash2, Wallet, TrendingUp, Calendar, IndianRupee } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Payment, PaymentMode, PaymentSource } from '@/lib/types';
import { formatINR, formatDate, todayISO } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import { useDraftState } from '@/lib/useDraftState';
import { PAYMENT_MODES, PAYMENT_SOURCES } from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, inputClass, selectClass, textareaClass } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { useRefresh } from '@/context/RefreshContext';
import { MasterPinDialog } from '@/components/ui/MasterPinDialog';

const MODE_COLORS: Record<string, 'amber' | 'emerald' | 'sky' | 'slate'> = {
  Cash: 'amber',
  UPI: 'emerald',
  Bank: 'sky',
};

const SOURCE_COLORS: Record<string, 'amber' | 'emerald' | 'sky' | 'slate'> = {
  Booking: 'sky',
  'Lab Order': 'amber',
  Photographer: 'slate',
};

export function Payments() {
  const { toast } = useToast();
  const { settings } = useSettings();
  const { refreshToken } = useRefresh();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [view, setView] = useState<'active' | 'recycle'>('active');
  const [showPin, setShowPin] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<'soft' | 'permanent'>('soft');

  const load = useCallback(async () => {
    const { data } = await supabase.from('payments').select('*').order('date', { ascending: false });
    setPayments((data ?? []) as Payment[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshToken]);

  const filtered = payments.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch = (p.party_name ?? '').toLowerCase().includes(q) || (p.receipt_no ?? '').toLowerCase().includes(q) || (p.note ?? '').toLowerCase().includes(q);
    const matchesMode = modeFilter === 'all' || p.mode === modeFilter;
    const matchesFrom = !dateFrom || (p.date ?? '') >= dateFrom;
    const matchesTo = !dateTo || (p.date ?? '') <= dateTo;
    return matchesSearch && matchesMode && matchesFrom && matchesTo && (view === 'recycle' ? !!p.deleted_at : !p.deleted_at);
  });

  const activePayments = payments.filter((p) => !p.deleted_at);
  const todayTotal = activePayments.filter((p) => p.date === todayISO()).reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthTotal = activePayments.filter((p) => (p.date ?? '').startsWith(thisMonth)).reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const allTotal = activePayments.reduce((s, p) => s + Number(p.amount ?? 0), 0);

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from('payments').update({ deleted_at: new Date().toISOString() }).eq('id', deleteId);
    toast('Payment moved to Recycle Bin', 'success');
    setDeleteId(null); setShowPin(false); load();
  };

  const restorePayment = async (id: string) => {
    await supabase.from('payments').update({ deleted_at: null }).eq('id', id);
    toast('Payment restored', 'success'); load();
  };

  const permanentlyDeletePayment = async () => {
    if (!deleteId) return;
    await supabase.from('payments').delete().eq('id', deleteId);
    toast('Payment permanently deleted', 'success'); setDeleteId(null); setShowPin(false); load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Payments</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Transaction log — all incoming payments</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-amber-400"
        >
          <Plus className="h-4 w-4" /> Record Payment
        </button>
      </div>
      <div className="flex gap-2"><button onClick={() => setView('active')} className={`rounded-lg px-3 py-2 text-xs font-medium ${view === 'active' ? 'bg-amber-500 text-slate-900' : 'border border-slate-200 dark:border-white/10 dark:text-slate-300'}`}>Active</button><button onClick={() => setView('recycle')} className={`rounded-lg px-3 py-2 text-xs font-medium ${view === 'recycle' ? 'bg-amber-500 text-slate-900' : 'border border-slate-200 dark:border-white/10 dark:text-slate-300'}`}>Recycle Bin</button></div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
              <Calendar className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Today's Collection</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{formatINR(todayTotal)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">This Month</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{formatINR(monthTotal)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Wallet className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Collection</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{formatINR(allTotal)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, receipt no, or note..."
            className={`${inputClass} pl-10`}
          />
        </div>
        <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)} className={`${selectClass} w-32`}>
          <option value="all">All Modes</option>
          {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${inputClass} w-40`} placeholder="From" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${inputClass} w-40`} placeholder="To" />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Sparkles className="h-6 w-6 animate-pulse text-amber-500" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={IndianRupee} title="No payments found" subtitle="Record a payment to get started" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2.5">Receipt</th>
                <th className="px-3 py-2.5">Party</th>
                <th className="px-3 py-2.5">Source</th>
                <th className="px-3 py-2.5">Mode</th>
                <th className="px-3 py-2.5 text-right">Amount</th>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 dark:border-white/5">
                  <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">{p.receipt_no ?? ''}</td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{p.party_name ?? ''}</td>
                  <td className="px-3 py-2.5"><Badge color={SOURCE_COLORS[p.source] ?? 'slate'}>{p.source ?? ''}</Badge></td>
                  <td className="px-3 py-2.5"><Badge color={MODE_COLORS[p.mode] ?? 'slate'}>{p.mode ?? ''}</Badge></td>
                  <td className="px-3 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatINR(Number(p.amount ?? 0))}</td>
                  <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{formatDate(p.date)}</td>
                  <td className="px-3 py-2.5">
                    {view === 'active' ? <button onClick={() => { setDeleteId(p.id); setPendingDelete('soft'); setShowPin(true); }} className="text-slate-400 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button> : <div className="flex gap-2"><button onClick={() => restorePayment(p.id)} className="text-xs text-emerald-600 hover:text-emerald-500">Restore</button><button onClick={() => { setDeleteId(p.id); setPendingDelete('permanent'); setShowPin(true); }} className="text-xs text-rose-500 hover:text-rose-400">Delete</button></div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PaymentForm open={showForm} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} existing={payments} />

      <MasterPinDialog open={showPin} settings={settings} onClose={() => { setShowPin(false); setDeleteId(null); }} onVerified={() => { if (pendingDelete === 'permanent') permanentlyDeletePayment(); else handleDelete(); }} />
    </div>
  );
}

function nextReceiptNo(existing: Payment[]): string {
  const max = existing.reduce((m, p) => {
    const n = parseInt(p.receipt_no.replace(/\D/g, ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `RCP-${String(max + 1).padStart(3, '0')}`;
}

function PaymentForm({ open, onClose, onSaved, existing }: { open: boolean; onClose: () => void; onSaved: () => void; existing: Payment[] }) {
  const { toast } = useToast();
  const [source, setSource] = useDraftState<PaymentSource>('payment-source', 'Booking');
  const [partyName, setPartyName] = useDraftState<string>('payment-partyName', '');
  const [partyMobile, setPartyMobile] = useDraftState<string>('payment-partyMobile', '');
  const [mode, setMode] = useDraftState<PaymentMode>('payment-mode', 'Cash');
  const [amount, setAmount] = useDraftState<string>('payment-amount', '');
  const [date, setDate] = useDraftState<string>('payment-date', todayISO());
  const [note, setNote] = useDraftState<string>('payment-note', '');

  const clearDraft = () => {
    setSource('Booking');
    setPartyName('');
    setPartyMobile('');
    setMode('Cash');
    setAmount('');
    setDate(todayISO());
    setNote('');
  };

  const handleSave = async () => {
    const amt = Number(amount);
    if (!partyName || isNaN(amt) || amt <= 0) { toast('Name and amount are required', 'error'); return; }
    const payload = {
      receipt_no: nextReceiptNo(existing),
      source,
      party_name: partyName,
      party_mobile: partyMobile,
      mode,
      amount: amt,
      date,
      note,
    };
    await supabase.from('payments').insert(payload);
    toast('Payment recorded', 'success');
    clearDraft();
    onSaved();
  };

  const handleClose = () => {
    clearDraft();
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Record Payment" size="md" dismissible={false}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Source">
            <select value={source} onChange={(e) => setSource(e.target.value as PaymentSource)} className={selectClass}>
              {PAYMENT_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Mode">
            <select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)} className={selectClass}>
              {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Party Name"><input value={partyName} onChange={(e) => setPartyName(e.target.value)} className={inputClass} placeholder="Client / Studio / Photographer" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Mobile"><input value={partyMobile} onChange={(e) => setPartyMobile(e.target.value)} className={inputClass} /></Field>
          <Field label="Amount (₹)"><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }} className={inputClass} placeholder="0" /></Field>
        </div>
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} /></Field>
        <Field label="Note"><textarea value={note} onChange={(e) => setNote(e.target.value)} className={textareaClass} placeholder="Optional note..." /></Field>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={handleClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
          <button onClick={handleSave} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-amber-400">Record Payment</button>
        </div>
      </div>
    </Modal>
  );
}
