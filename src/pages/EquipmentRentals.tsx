import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, Check, ChevronDown, ChevronUp, IndianRupee, Plus, Search, Wallet, X, Pencil, Share2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { EquipmentRental, EquipmentRentalItem, EquipmentRentalPayment, RentalDirection, RentalPaymentMode, RentalStatus } from '@/lib/types';
import { formatDate, formatINR, todayISO } from '@/lib/format';
import { inputClass, selectClass, textareaClass, Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/context/ToastContext';

type RentalWithPayments = EquipmentRental & { rentalPayments: EquipmentRentalPayment[]; items: EquipmentRentalItem[] };
type DraftRentalItem = Omit<EquipmentRentalItem, 'id' | 'rental_id' | 'created_at'> & { rowKey: string };

const CATEGORIES = ['Camera Body', 'Lens', 'Camera Accessories', 'Live Setup', 'Lighting', 'Audio', 'Computer / Editing', 'Other'];
const PAYMENT_MODES: RentalPaymentMode[] = ['Cash', 'UPI'];

function dueOf(rental: RentalWithPayments) {
  return rental.status === 'Cancelled' ? 0 : Math.max(0, Number(rental.total_rent || 0) - netSettledOf(rental));
}

function expectedFlow(rental: EquipmentRental): 'IN' | 'OUT' {
  return rental.direction === 'Rented Out' ? 'IN' : 'OUT';
}

function netSettledOf(rental: RentalWithPayments) {
  const expected = expectedFlow(rental);
  return rental.rentalPayments.reduce((sum, payment) => sum + (payment.flow_direction === expected ? 1 : -1) * Number(payment.amount || 0), 0);
}

function refundableOf(rental: RentalWithPayments) {
  return rental.status === 'Cancelled' ? Math.max(0, netSettledOf(rental)) : 0;
}

function newRequestId() {
  return crypto.randomUUID();
}

async function fetchAllPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : fallback;
}

export function EquipmentRentals() {
  const { toast } = useToast();
  const [rentals, setRentals] = useState<RentalWithPayments[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<'All' | RentalDirection>('All');
  const [status, setStatus] = useState<'All' | RentalStatus>('All');
  const [showForm, setShowForm] = useState(false);
  const [editingRental, setEditingRental] = useState<RentalWithPayments | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [paymentFor, setPaymentFor] = useState<RentalWithPayments | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rentalData, payments, items] = await Promise.all([
        fetchAllPages<EquipmentRental>((from, to) => supabase.from('equipment_rentals').select('*').order('rental_date', { ascending: false }).range(from, to)),
        fetchAllPages<EquipmentRentalPayment>((from, to) => supabase.from('equipment_rental_payments').select('*').order('payment_date', { ascending: false }).range(from, to)),
        fetchAllPages<EquipmentRentalItem>((from, to) => supabase.from('equipment_rental_items').select('*').order('created_at').range(from, to)),
      ]);
      setRentals(rentalData.map((rental) => ({
        ...rental,
        status: (rental.status as string) === 'Active' ? 'Delivered' : (rental.status as string) === 'Returned' ? 'Complete' : rental.status,
        delivered_at: rental.delivered_at ?? ((rental.status as string) === 'Active' ? rental.rental_date : null),
        rentalPayments: payments.filter((payment) => payment.rental_id === rental.id),
        items: items.filter((item) => item.rental_id === rental.id),
      })));
      setLoadError(null);
    } catch (error) {
      const message = errorMessage(error, 'Could not load equipment rental records.');
      setLoadError(message);
      toast('Rental records could not be fully loaded. No partial totals are shown.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => rentals.filter((rental) => {
    const query = search.trim().toLowerCase();
    const matchesText = !query || [rental.item_name, rental.category, ...rental.items.map((item) => `${item.item_name} ${item.category}`), rental.counterparty_name, rental.counterparty_mobile, rental.note]
      .some((value) => String(value ?? '').toLowerCase().includes(query));
    return matchesText && (direction === 'All' || rental.direction === direction) && (status === 'All' || rental.status === status);
  }), [rentals, search, direction, status]);

  const outstanding = useMemo(() => rentals.filter((rental) => rental.status !== 'Cancelled').reduce((sum, rental) => {
    const due = dueOf(rental);
    return rental.direction === 'Rented Out' ? { ...sum, receive: sum.receive + due } : { ...sum, pay: sum.pay + due };
  }, { receive: 0, pay: 0 }), [rentals]);

  const updateRentalStatus = async (rental: RentalWithPayments, nextStatus: 'Delivered' | 'Complete') => {
    const today = todayISO();
    const patch = nextStatus === 'Delivered'
      ? { status: nextStatus, delivered_at: today, updated_at: new Date().toISOString() }
      : { status: nextStatus, actual_return_date: today, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('equipment_rentals').update(patch).eq('id', rental.id);
    if (error) { toast(`Could not mark rental ${nextStatus.toLowerCase()}`, 'error'); return; }
    toast(nextStatus === 'Delivered' ? (rental.direction === 'Rented Out' ? 'Equipment marked delivered' : 'Equipment marked received') : 'Rental marked complete', 'success');
    void load();
  };

  const cancelRental = async (rental: RentalWithPayments) => {
    const refundDue = Math.max(0, netSettledOf(rental));
    const warning = refundDue > 0
      ? ` ${formatINR(refundDue)} has already been paid/received; it will remain in the audit history and must be refunded using the new Record Refund action after cancellation.`
      : ' Any remaining rent due will stop counting as outstanding.';
    if (!window.confirm(`Cancel the rental for ${rental.item_name}? Its record and payment history will be kept.${warning}`)) return;
    const { error } = await supabase.from('equipment_rentals').update({ status: 'Cancelled', updated_at: new Date().toISOString() }).eq('id', rental.id);
    if (error) { toast('Could not cancel this rental', 'error'); return; }
    toast('Rental cancelled; its record and payments remain in history', 'success');
    void load();
  };

  const shareBill = (rental: RentalWithPayments) => {
    const paid = Math.max(0, netSettledOf(rental));
    const equipment = rental.items.length
      ? rental.items.map((item) => `• ${item.item_name} (${item.category}) × ${item.quantity}`).join('\n')
      : `• ${rental.item_name} (${rental.category}) × ${rental.quantity}`;
    const history = rental.rentalPayments.length
      ? [...rental.rentalPayments].sort((a, b) => a.payment_date.localeCompare(b.payment_date)).map((payment) => `• ${formatDate(payment.payment_date)} · ${payment.flow_direction === expectedFlow(rental) ? (payment.flow_direction === 'IN' ? 'Received' : 'Paid') : (payment.flow_direction === 'IN' ? 'Refund received' : 'Refund paid')} · ${payment.payment_mode}: ${formatINR(payment.amount)}${payment.note ? ` (${payment.note})` : ''}`).join('\n')
      : 'No payments recorded';
    const message = [
      'EQUIPMENT RENTAL BILL',
      `Bill ID: ${rental.id}`,
      `${rental.direction === 'Rented Out' ? 'Rented to' : 'Rented from'}: ${rental.counterparty_name}${rental.counterparty_mobile ? ` · ${rental.counterparty_mobile}` : ''}`,
      `Status: ${rental.status}`,
      `Rental date: ${formatDate(rental.rental_date)}`,
      `Expected return: ${formatDate(rental.expected_return_date)}`,
      '', 'Equipment:', equipment,
      '', `Total rent: ${formatINR(rental.total_rent)}`, `Paid: ${formatINR(paid)}`,
      `${rental.status === 'Cancelled' ? 'Refund due' : rental.direction === 'Rented Out' ? 'To receive' : 'To pay'}: ${formatINR(rental.status === 'Cancelled' ? refundableOf(rental) : dueOf(rental))}`,
      '', 'Payment / refund history:', history,
      ...(rental.note ? ['', `Note: ${rental.note}`] : []),
    ].join('\n');
    const digits = (rental.counterparty_mobile || '').replace(/\D/g, '');
    const phone = digits.length === 10 ? `91${digits}` : digits;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  return <div className="relative flex w-full flex-col space-y-2 text-slate-100">
    <div className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-[#0B1121]/95 px-1 py-2 shadow-md backdrop-blur-md sm:px-4">
      <div className="min-w-0"><h1 className="truncate text-sm font-bold sm:text-lg md:text-xl">Equipment Rentals</h1><p className="hidden text-xs text-slate-400 sm:block">Camera, lens, live setup and all rented equipment · separate from booking bills</p></div>
      <button onClick={() => setShowForm(true)} className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"><Plus className="h-4 w-4" /> Add Rental</button>
    </div>

    {loadError ? <div role="alert" className="mx-1 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-200 sm:mx-4"><p className="font-semibold">Equipment rental records could not be loaded completely.</p><p className="mt-1 text-xs text-rose-200/70">No partial totals are shown. {loadError}</p><button disabled={loading} onClick={() => void load()} className="mt-3 rounded-lg border border-rose-500/30 px-3 py-2 text-xs disabled:opacity-50">{loading ? 'Retrying…' : 'Retry loading records'}</button></div> : loading ? <div className="py-16 text-center text-sm text-slate-400">Loading rental records…</div> : <div className="space-y-3 px-1 sm:px-4">
      <div className="grid grid-cols-2 gap-2">
        <Summary icon={IndianRupee} label="To Receive · Rented Out" value={outstanding.receive} tone="text-emerald-300" />
        <Summary icon={Wallet} label="To Pay · Rented In" value={outstanding.pay} tone="text-rose-300" />
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-900 p-2 sm:flex-row">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputClass} pl-9`} placeholder="Search item, person or mobile..." /></div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)} className={`${selectClass} sm:w-36`}><option>All</option><option>Rented Out</option><option>Rented In</option></select>
          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className={`${selectClass} sm:w-36`}><option>All</option><option>Not Delivered</option><option>Delivered</option><option>Complete</option><option>Cancelled</option></select>
        </div>
      </div>

      {filtered.length === 0 ? <EmptyState icon={Camera} title="No equipment rentals found" subtitle="Add a rented-out or rented-in record to start tracking balances and payments." /> : <div className="space-y-2">{filtered.map((rental) => {
        const paid = Math.max(0, netSettledOf(rental));
        const due = dueOf(rental);
        const refundDue = refundableOf(rental);
        const expanded = selected === rental.id;
        const overdue = rental.status === 'Delivered' && rental.expected_return_date && rental.expected_return_date < todayISO();
        return <article key={rental.id} className="overflow-hidden rounded-xl border border-white/10 bg-slate-900">
          <button onClick={() => setSelected(expanded ? null : rental.id)} className="w-full p-3 text-left sm:p-4">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-white">{rental.items.length ? rental.items.map((item) => `${item.item_name} ×${item.quantity}`).join(', ') : `${rental.item_name} ×${rental.quantity}`}</h2><Pill tone={rental.direction === 'Rented Out' ? 'emerald' : 'sky'}>{rental.direction}</Pill><Pill tone={rental.status === 'Complete' ? 'slate' : rental.status === 'Cancelled' ? 'rose' : overdue ? 'rose' : rental.status === 'Delivered' ? 'emerald' : 'amber'}>{overdue ? 'Overdue' : rental.status}</Pill></div><p className="mt-1 truncate text-xs text-slate-400">{rental.counterparty_name} · {rental.counterparty_mobile || 'No mobile'}</p></div><span className="shrink-0 text-slate-400">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span></div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-white/5 pt-2 text-xs sm:grid-cols-4"><span className="text-slate-400">Rent <b className="text-white">{formatINR(rental.total_rent)}</b></span><span className="text-slate-400">Net paid <b className="text-emerald-300">{formatINR(paid)}</b></span><span className="text-slate-400">{rental.status === 'Cancelled' ? 'Refund due' : rental.direction === 'Rented Out' ? 'To receive' : 'To pay'} <b className={due || refundDue ? 'text-rose-300' : 'text-emerald-300'}>{formatINR(rental.status === 'Cancelled' ? refundDue : due)}</b></span><span className="text-slate-400">Return <b className="text-slate-200">{formatDate(rental.expected_return_date)}</b></span></div>
          </button>
          {expanded && <div className="space-y-3 border-t border-white/10 bg-slate-950/50 p-3 sm:p-4">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><Detail label="Rental date" value={formatDate(rental.rental_date)} /><Detail label={rental.direction === 'Rented Out' ? 'Delivered on' : 'Received on'} value={rental.delivered_at ? formatDate(rental.delivered_at) : 'Not delivered'} /><Detail label="Expected return" value={formatDate(rental.expected_return_date)} /><Detail label="Completed / returned" value={rental.actual_return_date ? formatDate(rental.actual_return_date) : 'Not complete'} /></div>
            <div className="rounded-lg border border-white/10"><div className="border-b border-white/10 px-3 py-2 text-xs font-semibold">Equipment in this rental ({rental.items.length || 1})</div><div className="divide-y divide-white/5">{rental.items.length ? rental.items.map((item) => <div key={item.id} className="flex justify-between gap-3 px-3 py-2 text-xs"><span className="text-slate-300">{item.item_name}<span className="ml-2 text-slate-500">· {item.category}</span></span><b className="shrink-0 text-slate-200">× {item.quantity}</b></div>) : <div className="flex justify-between gap-3 px-3 py-2 text-xs"><span className="text-slate-300">{rental.item_name}<span className="ml-2 text-slate-500">· {rental.category}</span></span><b className="shrink-0 text-slate-200">× {rental.quantity}</b></div>}</div></div>
            {rental.note && <p className="text-xs text-slate-300">Note: {rental.note}</p>}
            <div className="rounded-lg border border-white/10"><div className="border-b border-white/10 px-3 py-2 text-xs font-semibold">Payment &amp; Refund History <span className="font-normal text-slate-400">({rental.rentalPayments.length})</span></div>{rental.rentalPayments.length ? <div className="divide-y divide-white/5">{[...rental.rentalPayments].sort((a, b) => b.payment_date.localeCompare(a.payment_date)).map((payment) => { const isExpectedFlow = payment.flow_direction === expectedFlow(rental); const label = isExpectedFlow ? payment.flow_direction === 'IN' ? 'Received' : 'Paid' : payment.flow_direction === 'IN' ? 'Refund received' : 'Refund paid'; return <div key={payment.id} className="flex flex-wrap justify-between gap-2 px-3 py-2 text-xs"><span className="text-slate-300">{formatDate(payment.payment_date)} · {label} · {payment.payment_mode}{payment.note ? ` · ${payment.note}` : ''}</span><b className={isExpectedFlow ? 'text-emerald-300' : 'text-amber-300'}>{formatINR(payment.amount)}</b></div>; })}</div> : <p className="px-3 py-3 text-xs text-slate-500">No payment recorded yet.</p>}</div>
            <div className="flex flex-wrap gap-2"><button onClick={() => setEditingRental(rental)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200"><Pencil className="mr-1 inline h-3.5 w-3.5" />Edit Bill</button><button onClick={() => shareBill(rental)} className="rounded-lg border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300"><Share2 className="mr-1 inline h-3.5 w-3.5" />Share Bill</button>{rental.status !== 'Cancelled' && due > 0.005 && <button onClick={() => setPaymentFor(rental)} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950"><IndianRupee className="mr-1 inline h-3.5 w-3.5" />{rental.direction === 'Rented Out' ? 'Record Received Payment' : 'Record Paid Amount'}</button>}{rental.status === 'Cancelled' && refundDue > 0.005 && <button onClick={() => setPaymentFor(rental)} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950"><IndianRupee className="mr-1 inline h-3.5 w-3.5" />Record Refund</button>}{rental.status === 'Not Delivered' && <button onClick={() => void updateRentalStatus(rental, 'Delivered')} className="rounded-lg border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300"><Check className="mr-1 inline h-3.5 w-3.5" />{rental.direction === 'Rented Out' ? 'Mark Delivered' : 'Mark Received'}</button>}{rental.status === 'Delivered' && <button onClick={() => void updateRentalStatus(rental, 'Complete')} className="rounded-lg border border-cyan-500/30 px-3 py-2 text-xs text-cyan-300"><Check className="mr-1 inline h-3.5 w-3.5" />Mark Complete / Returned</button>}{(rental.status === 'Not Delivered' || rental.status === 'Delivered') && <button onClick={() => void cancelRental(rental)} className="rounded-lg border border-rose-500/30 px-3 py-2 text-xs text-rose-300"><X className="mr-1 inline h-3.5 w-3.5" />Cancel Rental</button>}</div>
          </div>}
        </article>;
      })}</div>}
    </div>}

    <RentalForm key={editingRental?.id ?? 'new'} open={showForm || !!editingRental} rental={editingRental} onClose={() => { setShowForm(false); setEditingRental(null); }} onSaved={() => { setShowForm(false); setEditingRental(null); void load(); }} />
    {paymentFor && <RentalPaymentForm rental={paymentFor} refund={paymentFor.status === 'Cancelled'} remaining={paymentFor.status === 'Cancelled' ? refundableOf(paymentFor) : dueOf(paymentFor)} onClose={() => setPaymentFor(null)} onSaved={() => { setPaymentFor(null); void load(); }} />}
  </div>;
}

function Summary({ icon: Icon, label, value, tone }: { icon: typeof Camera; label: string; value: number; tone: string }) {
  return <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 p-3"><span className="rounded-lg bg-white/5 p-2"><Icon className={`h-4 w-4 ${tone}`} /></span><div className="min-w-0"><p className="truncate text-[10px] text-slate-400 sm:text-xs">{label}</p><p className={`text-sm font-bold sm:text-base ${tone}`}>{formatINR(value)}</p></div></div>;
}

function Pill({ children, tone }: { children: React.ReactNode; tone: 'emerald' | 'sky' | 'slate' | 'rose' | 'amber' }) {
  const colors = { emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300', sky: 'border-sky-500/20 bg-sky-500/10 text-sky-300', slate: 'border-slate-600 bg-slate-800 text-slate-300', rose: 'border-rose-500/20 bg-rose-500/10 text-rose-300', amber: 'border-amber-500/20 bg-amber-500/10 text-amber-300' };
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] ${colors[tone]}`}>{children}</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] text-slate-500">{label}</p><p className="text-xs text-slate-200">{value || '—'}</p></div>;
}

function newRentalItem(): DraftRentalItem {
  return { rowKey: `${Date.now()}-${Math.random()}`, item_name: '', category: 'Camera Body', quantity: 1 };
}

function RentalForm({ open, rental, onClose, onSaved }: { open: boolean; rental: RentalWithPayments | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [createRequestId, setCreateRequestId] = useState(newRequestId);
  const [advanceRequestId, setAdvanceRequestId] = useState(newRequestId);
  const [direction, setDirection] = useState<RentalDirection>(rental?.direction ?? 'Rented Out');
  const [items, setItems] = useState<DraftRentalItem[]>(rental ? (rental.items.length ? rental.items : [{ ...newRentalItem(), item_name: rental.item_name, category: rental.category, quantity: rental.quantity }]).map((item) => ({ ...item, rowKey: `${('id' in item ? item.id : undefined) ?? Date.now()}-${Math.random()}` })) : [newRentalItem()]);
  const [name, setName] = useState(rental?.counterparty_name ?? '');
  const [mobile, setMobile] = useState(rental?.counterparty_mobile ?? '');
  const [rentalDate, setRentalDate] = useState(rental?.rental_date ?? todayISO());
  const [returnDate, setReturnDate] = useState(rental?.expected_return_date ?? '');
  const [total, setTotal] = useState(rental ? String(rental.total_rent) : '');
  const [advance, setAdvance] = useState('0');
  const [paymentMode, setPaymentMode] = useState<RentalPaymentMode>('Cash');
  const [note, setNote] = useState(rental?.note ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open && !rental) {
      setCreateRequestId(newRequestId());
      setAdvanceRequestId(newRequestId());
    }
  }, [open, rental?.id]);
  const reset = () => { setDirection('Rented Out'); setItems([newRentalItem()]); setName(''); setMobile(''); setRentalDate(todayISO()); setReturnDate(''); setTotal(''); setAdvance('0'); setPaymentMode('Cash'); setNote(''); setSaving(false); };
  const close = () => { reset(); onClose(); };
  const save = async () => {
    const rent = Number(total), paid = Number(advance || 0);
    const alreadyPaid = rental ? Math.max(0, netSettledOf(rental)) : 0;
    const validItems = items.every((item) => item.item_name.trim() && Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0);
    if (!items.length || !validItems || !name.trim() || !rentalDate || !returnDate || !Number.isFinite(rent) || rent <= 0 || (!rental && (!Number.isFinite(paid) || paid < 0 || paid > rent)) || (rental && rent + 0.005 < alreadyPaid)) {
      toast(rental ? `Enter the equipment, contact, dates and a total rent of at least ${formatINR(alreadyPaid)} already paid.` : 'Add each equipment item, person, dates and valid total rent/advance. Advance cannot exceed total rent.', 'error'); return;
    }
    setSaving(true);
    const legacySummary = items.map((item) => `${item.item_name.trim()} ×${Number(item.quantity)}`).join(', ');
    const payload = { direction, item_name: legacySummary, category: items.length === 1 ? items[0].category : 'Mixed equipment', counterparty_name: name.trim(), counterparty_mobile: mobile.trim(), rental_date: rentalDate, expected_return_date: returnDate, total_rent: rent, note: note.trim() };
    const itemPayload = items.map((item) => ({ item_name: item.item_name.trim(), category: item.category, quantity: Number(item.quantity) }));
    try {
      if (rental) {
        const { error } = await supabase.rpc('update_equipment_rental_with_items', {
          p_rental_id: rental.id, p_rental: payload, p_items: itemPayload,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('create_equipment_rental_with_items', {
          p_request_id: createRequestId,
          p_rental: payload,
          p_items: itemPayload,
          p_advance_amount: paid,
          p_advance_payment_mode: paymentMode,
          p_advance_payment_date: rentalDate,
          p_advance_payment_request_id: paid > 0 ? advanceRequestId : null,
        });
        if (error) throw error;
      }
      toast(rental ? 'Rental bill and item list updated safely; payment history retained' : 'Equipment rental saved', 'success');
      reset();
      onSaved();
    } catch (error) {
      const message = errorMessage(error, 'Rental could not be saved.');
      toast(message, 'error');
    } finally {
      setSaving(false);
    }
  };
  return <Modal open={open} onClose={close} title={rental ? 'Edit Equipment Rental Bill' : 'Add Equipment Rental'} size="md" dismissible={false}><div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
    <Field label="Transaction"><div className="grid grid-cols-2 gap-2"><button disabled={!!rental?.rentalPayments.length} onClick={() => setDirection('Rented Out')} className={`rounded-lg border px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${direction === 'Rented Out' ? 'border-emerald-400 bg-emerald-500/10 text-emerald-300' : 'border-white/10 text-slate-400'}`}>We give · To receive</button><button disabled={!!rental?.rentalPayments.length} onClick={() => setDirection('Rented In')} className={`rounded-lg border px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${direction === 'Rented In' ? 'border-sky-400 bg-sky-500/10 text-sky-300' : 'border-white/10 text-slate-400'}`}>We take · To pay</button></div>{!!rental?.rentalPayments.length && <p className="mt-1 text-[11px] text-amber-300">Transaction direction is locked after a payment, so historical account entries stay accurate.</p>}</Field>
    <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950/50 p-3">
      <div className="flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Equipment items</h3><p className="text-[11px] text-slate-500">Add the body, lens, live setup and other items in this one rental.</p></div><button type="button" onClick={() => setItems((current) => [...current, newRentalItem()])} className="flex shrink-0 items-center gap-1 rounded-lg border border-amber-500/30 px-2.5 py-2 text-xs font-medium text-amber-300"><Plus className="h-3.5 w-3.5" /> Add item</button></div>
      {items.map((item, index) => <div key={item.rowKey} className="space-y-2 rounded-lg border border-white/10 bg-slate-900 p-2.5">
        <div className="flex items-center justify-between"><span className="text-[11px] font-semibold text-slate-400">Item {index + 1}</span>{items.length > 1 && <button type="button" onClick={() => setItems((current) => current.filter((entry) => entry.rowKey !== item.rowKey))} className="rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300" aria-label={`Remove item ${index + 1}`}><X className="h-4 w-4" /></button>}</div>
        <div className="grid grid-cols-2 gap-2"><Field label="Category"><select value={item.category} onChange={(event) => setItems((current) => current.map((entry) => entry.rowKey === item.rowKey ? { ...entry, category: event.target.value } : entry))} className={selectClass}>{CATEGORIES.map((option) => <option key={option}>{option}</option>)}</select></Field><Field label="Item name"><input value={item.item_name} onChange={(event) => setItems((current) => current.map((entry) => entry.rowKey === item.rowKey ? { ...entry, item_name: event.target.value } : entry))} className={inputClass} placeholder="e.g. Sony A7 IV body" /></Field></div>
        <Field label="Quantity"><input type="number" min="1" step="1" value={item.quantity} onChange={(event) => setItems((current) => current.map((entry) => entry.rowKey === item.rowKey ? { ...entry, quantity: Number(event.target.value) } : entry))} className={inputClass} /></Field>
      </div>)}
    </div>
    <Field label={direction === 'Rented Out' ? 'Rented to · name' : 'Rented from · name'}><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Person or company name" /></Field>
    <Field label="Mobile number"><input value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" className={inputClass} placeholder="Optional" /></Field>
    <div className="grid grid-cols-2 gap-3"><Field label="Rental date"><input type="date" value={rentalDate} onChange={(e) => setRentalDate(e.target.value)} className={inputClass} /></Field><Field label="Expected return"><input type="date" min={rentalDate} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className={inputClass} /></Field></div>
    <div className={rental ? '' : 'grid grid-cols-2 gap-3'}><Field label="Total rent (₹)"><input type="number" min="0" value={total} onChange={(e) => setTotal(e.target.value)} className={inputClass} placeholder="0" /></Field>{!rental && <Field label="Advance (₹)"><input type="number" min="0" value={advance} onChange={(e) => setAdvance(e.target.value)} className={inputClass} placeholder="0" /></Field>}</div>
    {rental && <p className="-mt-2 text-xs text-slate-400">Already recorded: {formatINR(rental.rentalPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0))}. Edit payments separately so the full payment history remains accurate.</p>}
    {!rental && Number(advance) > 0 && <Field label="Advance payment mode"><select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as RentalPaymentMode)} className={selectClass}>{PAYMENT_MODES.map((mode) => <option key={mode}>{mode}</option>)}</select></Field>}
    <Field label="Note"><textarea value={note} onChange={(e) => setNote(e.target.value)} className={textareaClass} placeholder="Optional condition, serial number, setup details..." /></Field>
    <div className="flex justify-end gap-2 border-t border-white/10 pt-3"><button onClick={close} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300">Cancel</button><button disabled={saving} onClick={() => void save()} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{saving ? 'Saving…' : rental ? 'Save Changes' : 'Save Rental'}</button></div>
  </div></Modal>;
}

function RentalPaymentForm({ rental, refund, remaining, onClose, onSaved }: { rental: RentalWithPayments; refund: boolean; remaining: number; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [requestId] = useState(newRequestId);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState<RentalPaymentMode>('Cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const value = Number(amount);
    if (saving || !Number.isFinite(value) || value <= 0 || value > remaining + 0.005 || !date) { toast(`Enter a valid ${refund ? 'refund' : 'payment'} up to ${formatINR(remaining)}`, 'error'); return; }
    setSaving(true);
    const expected = expectedFlow(rental);
    const flowDirection = refund ? expected === 'IN' ? 'OUT' : 'IN' : expected;
    try {
      const { error } = await supabase.rpc('record_equipment_rental_payment', {
        p_rental_id: rental.id,
        p_request_id: requestId,
        p_amount: value,
        p_payment_date: date,
        p_payment_mode: mode,
        p_note: note.trim(),
        p_flow_direction: flowDirection,
      });
      if (error) throw error;
      toast(refund ? 'Refund recorded in the payment audit' : rental.direction === 'Rented Out' ? 'Received payment recorded' : 'Paid amount recorded', 'success');
      onSaved();
    } catch (error) {
      toast(errorMessage(error, 'Payment could not be saved'), 'error');
      setSaving(false);
    }
  };
  const title = refund ? 'Record Refund' : rental.direction === 'Rented Out' ? 'Record Received Payment' : 'Record Paid Amount';
  return <Modal open onClose={onClose} title={title} size="sm"><div className="space-y-3"><p className="text-xs text-slate-400">{rental.item_name} · {rental.counterparty_name} · {refund ? 'Refundable' : 'Balance'} {formatINR(remaining)}</p><Field label={`${refund ? 'Refund' : 'Amount'} (₹)`}><input autoFocus type="number" min="0.01" max={remaining} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} placeholder="0" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} /></Field><Field label="Mode"><select value={mode} onChange={(e) => setMode(e.target.value as RentalPaymentMode)} className={selectClass}>{PAYMENT_MODES.map((option) => <option key={option}>{option}</option>)}</select></Field></div><Field label="Note / UPI reference"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder="Optional" /></Field><button disabled={saving} onClick={() => void save()} className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{saving ? 'Saving…' : refund ? 'Save Refund' : 'Save Payment'}</button></div></Modal>;
}
