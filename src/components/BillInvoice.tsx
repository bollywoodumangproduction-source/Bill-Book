import { formatINR, formatDate, formatDateTime, formatPhone } from '@/lib/format';
import { getWorkStatusLabel } from '@/lib/types';
import type { Booking, StudioSettings, BookingDeliverables } from '@/lib/types';
import { bookingBillingSnapshot } from '@/lib/billing';

const toNum = (v: string | number | undefined) => { const n = Number(v); return isNaN(n) ? 0 : n; };

const DEFAULT_DELIVERABLES: BookingDeliverables = {
  raw_video: false,
  raw_selected_photos: false,
  raw_all_photos: false,
  raw_edited_photos: false,
};

export function getInvoiceCopyType(): 'original' | 'client' {
  if (typeof window === 'undefined') return 'original';
  const path = window.location.pathname;
  return /^\/(?:view|portal|client|partner)(?:\/|$)/i.test(path) ? 'client' : 'original';
}

function nextDate(date: string): string {
  if (!date) return '';
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(year, month - 1, day + 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function bookingNumber(value: number | string | undefined): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function deliveryItemKey(items: string[], index: number): string {
  const item = items[index];
  const occurrence = items.slice(0, index + 1).filter((entry) => entry === item).length;
  return `${item}#${occurrence}`;
}

function buildDeliverableEntries(d: BookingDeliverables): { items: string[]; legacyItems: string[]; legacyGroups: number[][] } {
  const items: string[] = [];
  const legacyItems: string[] = [];
  const legacyGroups: number[][] = [];
  const add = (label: string, legacyParts: string[] = [label]) => {
    const group: number[] = [];
    legacyParts.forEach((part) => { group.push(legacyItems.length); legacyItems.push(part); });
    items.push(label);
    legacyGroups.push(group);
  };
  d.album_rows?.forEach((row) => {
    const cover = `Album: ${row.album_type} (${row.size}, ${row.cover})`;
    const legacyParts = [cover];
    const albumDetails = [cover];
    if (row.mini_album) {
      const mini = `  Mini Album x${toNum(row.mini_qty) || 1}`;
      legacyParts.push(mini);
      albumDetails.push(mini.trim());
    }
    row.papers?.forEach((paper) => {
      if (!paper.paper_type || toNum(paper.sheets) <= 0) return;
      const pageDetail = `  ${paper.paper_type} Paper (${paper.sheets} sheets)`;
      legacyParts.push(pageDetail);
      albumDetails.push(pageDetail.trim());
    });
    add(albumDetails.join(' · '), legacyParts);
  });
  d.video_rows?.forEach((row) => add(`Video: ${row.video_service} (${row.quality}) x${toNum(row.qty) || 1}`));
  d.custom_items?.forEach((item) => {
    if (item.name) add(`Additional: ${item.name} x${toNum(item.qty) || 1} (${formatINR(toNum(item.amount) || toNum(item.qty) * toNum(item.rate))})`);
  });
  if (d.raw_video) add('Raw Video');
  if (d.raw_selected_photos) add('Selected Photos');
  if (d.raw_all_photos) add('All Photos');
  if (d.raw_edited_photos) add('Finished/Edited Photos');
  return { items, legacyItems, legacyGroups };
}

export function formatDeliverablesList(d: BookingDeliverables): string[] {
  return buildDeliverableEntries(d).items;
}

export function getDeliverableReceipt(d: BookingDeliverables, items: string[], index: number) {
  const receipts = d.delivery_receipts ?? [];
  const currentKey = deliveryItemKey(items, index);
  const currentReceipt = receipts.find((receipt) => receipt.item_key === currentKey);
  if (currentReceipt) return currentReceipt;

  // Older bookings stored an album cover, mini album, and each paper as separate receipts.
  // Treat the album as received only when every legacy component was received.
  const legacy = buildDeliverableEntries(d);
  const group = legacy.legacyGroups[index] ?? [];
  if (!group.length) return undefined;
  const groupReceipts = group.map((legacyIndex) => {
    const key = deliveryItemKey(legacy.legacyItems, legacyIndex);
    return receipts.find((receipt) => receipt.item_key === key);
  });
  if (groupReceipts.some((receipt) => !receipt)) return undefined;
  const receivedAt = groupReceipts
    .map((receipt) => receipt!.received_at)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  return { item_key: currentKey, item: items[index], received_at: receivedAt };
}

export function BillInvoice({ booking, settings, compact = false, showStamp = true, copyTypeOverride }: { booking: Booking; settings: StudioSettings | null; compact?: boolean; showStamp?: boolean; copyTypeOverride?: 'original' | 'client' }) {
  const s = settings;
  const safeEvents = booking.events ?? [];
  const hasEventDates = safeEvents.some((e) => e.date);
  const hasEventTimes = safeEvents.some((e) => e.start_time || e.end_time || e.time);
  const hasEventVenues = safeEvents.some((e) => e.venue);
  const hasEventSides = safeEvents.some((e) => e.side);
  const delivList = formatDeliverablesList(booking.deliverables_data ?? DEFAULT_DELIVERABLES);
  const billing = bookingBillingSnapshot(booking);
  const discount = billing.discountAmount;
  const advancePaid = billing.totalPayments;
  const netDue = billing.balanceDue;
  const paymentHistory = booking.deliverables_data?.payment_details?.payment_history ?? [];
  const extraItems = booking.deliverables_data?.custom_items ?? [];
  const cn = compact ? 'compact-bill' : '';
  const copyType = copyTypeOverride ?? getInvoiceCopyType();
  const copyLabel = copyType === 'client' ? '2ND COPY' : 'ORIGINAL COPY';
  return (
    <div className={`bill-page relative mx-auto box-border w-full max-w-[794px] bg-white p-3 text-[13px] leading-relaxed text-black sm:p-6 sm:text-sm ${cn}`} data-copy-mark={copyType} data-watermark={copyType === 'client' ? 'CLIENT COPY - 2ND COPY' : ''} style={{ userSelect: 'text', padding: compact ? '3mm 4mm' : undefined }}>
      {/* Header */}
      <div className={compact ? "invoice-header mb-2 flex items-center justify-between gap-3 border-b-2 border-black pb-2" : "invoice-header mb-6 flex items-center justify-between gap-4 border-b-2 border-black pb-4"}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {s?.films_logo_url && (
            <img src={s.films_logo_url} alt="logo" className={compact ? "h-10 w-10 rounded object-cover" : "h-16 w-16 rounded-lg object-cover"} />
          )}
          <div className="min-w-0">
            <h1 className={compact ? "text-base font-bold leading-tight" : "text-2xl font-bold leading-tight"}>{s?.films_title ? `${s.films_title} & Production` : 'Bollywood Umang Films & Production'}</h1>
            <p className="text-xs">{s?.films_subtitle ?? ''}</p>
            <p className="text-xs">{s?.address ?? ''} · {s?.phone ?? ''}</p>
            {s?.films_insta && <p className="text-xs">{s.films_insta}</p>}
          </div>
        </div>
        <div className="invoice-meta shrink-0 text-right">
          <p className="invoice-copy-label mb-1 text-[9px] font-bold tracking-wide">{copyLabel}</p>
          <p className={compact ? "text-xs font-bold" : "text-sm font-bold"}>{booking.booking_no}</p>
          <p className="text-xs">{formatDate(booking.shoot_date)}</p>
        </div>
      </div>

      {/* Client + Event info side-by-side */}
      <div className={compact ? "mb-2 flex justify-between text-xs" : "mb-4 flex justify-between text-sm"}>
        <div>
          <p><strong>{booking.is_dual_side ? 'Groom:' : 'Client:'}</strong> {booking.client_name}</p>
          {booking.is_dual_side && booking.bride_name && <p><strong>Bride:</strong> {booking.bride_name}</p>}
          <p><strong>Mobile:</strong> +91 {formatPhone(booking.client_mobile)}</p>
          {booking.is_dual_side && booking.bride_mobile && <p><strong>Bride Mobile:</strong> +91 {formatPhone(booking.bride_mobile)}</p>}
          {booking.client_address && <p><strong>Address:</strong> {booking.client_address}</p>}
        </div>
        <div className="text-right">
          {booking.venue && <p><strong>Venue:</strong> {booking.venue}</p>}
          <p><strong>Status:</strong> {booking.booking_status}</p>
          <p><strong>Work Status:</strong> {getWorkStatusLabel(booking.work_status)}</p>
        </div>
      </div>

      {/* Functions timeline */}
      {safeEvents.length > 0 && (
        <table className={compact ? "mb-2 w-full border-collapse border border-black text-xs" : "mb-4 w-full border-collapse border border-black text-sm"}>
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-black px-2 py-1 text-left">Function</th>
              {hasEventDates && <th className="border border-black px-2 py-1 text-left">Date</th>}
              {hasEventTimes && <th className="border border-black px-2 py-1 text-left">Time</th>}
              {hasEventVenues && <th className="border border-black px-2 py-1 text-left">Venue</th>}
              {hasEventSides && <th className="border border-black px-2 py-1 text-left">Side</th>}
            </tr>
          </thead>
          <tbody>
            {safeEvents.map((e, i) => {
              const label = e.name === 'Custom' && e.customName ? e.customName : e.name;
              const startTime = e.start_time ?? e.time;
              const hasDate = Boolean(e.date);
              const hasTime = Boolean(startTime || e.end_time);
              const hasVenue = Boolean(e.venue);
              const endDate = e.end_date_shift === 'after_day' || e.end_date_shift === 'next_date' ? nextDate(e.date) : e.date;
              const sideLabel = e.side === 'groom' ? 'Groom Side' : e.side === 'bride' ? 'Bride Side' : e.side === 'joint' ? 'Joint / Both' : '';
              return (
                <tr key={i}>
                  <td className="border border-black px-2 py-1">{label}</td>
                  {hasEventDates && <td className="border border-black px-2 py-1">
                    {hasDate && formatDate(e.date)}
                    {hasDate && (e.end_date_shift === 'after_day' || e.end_date_shift === 'next_date') && ` - ${formatDate(endDate)}`}
                  </td>}
                  {hasEventTimes && <td className="border border-black px-2 py-1">
                    {hasTime && `${startTime || '—'} - ${e.end_time || '—'}`}
                  </td>}
                  {hasEventVenues && <td className="border border-black px-2 py-1">{hasVenue && e.venue}</td>}
                  {hasEventSides && <td className="border border-black px-2 py-1">{sideLabel}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Compact: Delivery + Payment + Financials side-by-side */}
      {extraItems.length > 0 && (
        <div className={compact ? "mb-2" : "mb-4"}>
          <p className={compact ? "mb-0.5 text-xs font-bold" : "mb-1 text-sm font-bold"}>Itemized Extra Charges</p>
          <table className="w-full border-collapse border border-black text-xs">
            <thead><tr className="bg-gray-100"><th className="border border-black px-2 py-1 text-left">Item / Description</th><th className="border border-black px-2 py-1 text-right">Qty</th><th className="border border-black px-2 py-1 text-right">Unit Rate</th><th className="border border-black px-2 py-1 text-right">Line Total</th></tr></thead>
            <tbody>{extraItems.map((item, index) => <tr key={item.id || index}><td className="border border-black px-2 py-1">{item.name || 'Additional service'}</td><td className="border border-black px-2 py-1 text-right">{bookingNumber(item.qty) || 1}</td><td className="border border-black px-2 py-1 text-right">{formatINR(bookingNumber(item.rate))}</td><td className="border border-black px-2 py-1 text-right">{formatINR(bookingNumber(item.amount) || bookingNumber(item.qty) * bookingNumber(item.rate))}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {compact ? (
        <div className="mb-2 flex justify-between gap-4">
          {delivList.length > 0 && (
            <div className="min-w-0 flex-1 rounded border border-black p-1">
              <p className="mb-0.5 text-xs font-bold">Delivery Data:</p>
              <div className="grid grid-cols-2 gap-0.5 text-xs">
                {delivList.map((d, i) => {
                  const receipt = getDeliverableReceipt(booking.deliverables_data ?? DEFAULT_DELIVERABLES, delivList, i);
                  return <p key={deliveryItemKey(delivList, i)}>{d} — {receipt ? `Received · ${formatDate(receipt.received_at)}` : 'Pending'}</p>;
                })}
              </div>
            </div>
          )}
          {paymentHistory.length > 0 && (
            <div className="flex-1">
              <p className="mb-0.5 text-xs font-bold">Payment History:</p>
              <table className="w-full border-collapse border border-black text-xs">
                <thead><tr className="bg-gray-100"><th className="border border-black px-1 py-0.5 text-left">Date</th><th className="border border-black px-1 py-0.5 text-left">Mode</th><th className="border border-black px-1 py-0.5 text-right">Amount</th></tr></thead>
                <tbody>{paymentHistory.map((payment) => <tr key={payment.id}><td className="border border-black px-1 py-0.5">{formatDateTime(payment.created_at || payment.payment_date)}</td><td className="border border-black px-1 py-0.5">{payment.payment_mode}</td><td className="border border-black px-1 py-0.5 text-right">{formatINR(bookingNumber(payment.paid_amount))}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <div className="w-44 space-y-0.5 text-xs">
            <div className="flex justify-between"><span>Base:</span><span>{formatINR(billing.baseSubtotal)}</span></div>
            <div className="flex justify-between"><span>Subtotal:</span><span>{formatINR(billing.subtotal)}</span></div>
            {billing.taxAmount > 0 && <div className="flex justify-between"><span>Tax:</span><span>{formatINR(billing.taxAmount)}</span></div>}
            <div className="flex justify-between"><span>Discount:</span><span>- {formatINR(discount)}</span></div>
            <div className="flex justify-between border-t border-black pt-0.5 font-semibold"><span>Grand Total:</span><span>{formatINR(billing.grandTotal)}</span></div>
            <div className="flex justify-between"><span>Advance:</span><span>- {formatINR(advancePaid)}</span></div>
            <div className="flex justify-between border-t border-black pt-0.5 font-bold"><span>Balance:</span><span>{formatINR(netDue)}</span></div>
          </div>
        </div>
      ) : (
        <>
          {delivList.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 text-sm font-bold">Delivery Data:</p>
              <div className="grid grid-cols-2 gap-1 text-xs">
                {delivList.map((d, i) => {
                  const receipt = getDeliverableReceipt(booking.deliverables_data ?? DEFAULT_DELIVERABLES, delivList, i);
                  return <p key={deliveryItemKey(delivList, i)}>{d} — {receipt ? `Received · ${formatDate(receipt.received_at)}` : 'Pending'}</p>;
                })}
              </div>
            </div>
          )}

          {paymentHistory.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 text-sm font-bold">Payment History:</p>
              <table className="w-full border-collapse border border-black text-xs">
                <thead><tr className="bg-gray-100"><th className="border border-black px-2 py-1 text-left">Date</th><th className="border border-black px-2 py-1 text-left">Mode</th><th className="border border-black px-2 py-1 text-left">Reason / Note</th><th className="border border-black px-2 py-1 text-right">Amount Paid</th></tr></thead>
                <tbody>{paymentHistory.map((payment) => <tr key={payment.id}><td className="border border-black px-2 py-1">{formatDateTime(payment.created_at || payment.payment_date)}</td><td className="border border-black px-2 py-1">{payment.payment_mode}</td><td className="border border-black px-2 py-1">{payment.custom_note || '—'}</td><td className="border border-black px-2 py-1 text-right">{formatINR(bookingNumber(payment.paid_amount))}</td></tr>)}</tbody>
              </table>
            </div>
          )}

          <div className="ml-auto w-56 space-y-1 text-sm">
            <div className="flex justify-between"><span>Base Amount:</span><span>{formatINR(billing.baseSubtotal)}</span></div>
            <div className="flex justify-between"><span>Subtotal:</span><span>{formatINR(billing.subtotal)}</span></div>
            {billing.taxAmount > 0 && <div className="flex justify-between"><span>Tax:</span><span>{formatINR(billing.taxAmount)}</span></div>}
            <div className="flex justify-between"><span>Discount:</span><span>- {formatINR(discount)}</span></div>
            <div className="flex justify-between border-t border-black pt-1 font-semibold"><span>Grand Total:</span><span>{formatINR(billing.grandTotal)}</span></div>
            <div className="flex justify-between"><span>Advance Paid:</span><span>- {formatINR(advancePaid)}</span></div>
            <div className="flex justify-between border-t-2 border-black pt-1 font-bold"><span>Balance Due:</span><span>{formatINR(netDue)}</span></div>
          </div>
        </>
      )}

      {/* Footer: UPI QR + Stamp + Signature */}
      <div className={compact ? "mt-2 flex items-end justify-between border-t border-black pt-1" : "mt-6 flex items-end justify-between border-t border-black pt-4"}>
        <div className="flex flex-col items-center gap-0.5">
          {s?.upi_id && netDue > 0 ? (
            <>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=upi://pay?pa=${encodeURIComponent(s.upi_id)}`}
                alt="UPI QR"
                className={compact ? "h-16 w-16" : "h-28 w-28"}
              />
              <p className="text-[10px] font-semibold">Scan to Pay via UPI</p>
              <p className="text-[10px]">{s.upi_id}</p>
            </>
          ) : null}
        </div>
        <div className="ml-auto flex min-w-32 flex-col items-center gap-1 text-center text-[10px]">
          {showStamp && s?.stamp_image_url && (
            <img src={s.stamp_image_url} alt="Digital stamp" className={compact ? "h-8 w-20 object-contain opacity-90" : "h-12 w-28 object-contain opacity-90"} />
          )}
          <div className="invoice-signature w-full">
            <div className="border-t border-black pt-1">Digital Signature</div>
          </div>
        </div>
      </div>

      {/* Terms */}
      {s?.terms_conditions && (
        <div className={compact ? "mt-1 border-t border-black pt-0.5" : "mt-4 border-t border-black pt-2"}>
          <p className={compact ? "mb-0 text-[10px] font-bold" : "mb-1 text-xs font-bold"}>Terms &amp; Conditions:</p>
          <div className={compact ? "whitespace-pre-line text-[10px] text-gray-700 max-h-12 overflow-hidden" : "whitespace-pre-line text-xs text-gray-700"}>{s.terms_conditions}</div>
        </div>
      )}
    </div>
  );
}
