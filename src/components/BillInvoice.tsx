import { formatINR, formatDate } from '@/lib/format';
import type { Booking, StudioSettings, BookingDeliverables } from '@/lib/types';

const toNum = (v: string | number | undefined) => { const n = Number(v); return isNaN(n) ? 0 : n; };

const DEFAULT_DELIVERABLES: BookingDeliverables = {
  raw_video: false,
  raw_selected_photos: false,
  raw_all_photos: false,
  raw_edited_photos: false,
};

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

export function formatDeliverablesList(d: BookingDeliverables): string[] {
  const items: string[] = [];
  if (d.album_rows?.length) {
    d.album_rows.forEach((r) => {
      items.push(`Album: ${r.album_type} (${r.size}, ${r.cover})`);
      if (r.mini_album) {
        items.push(`  Mini Album x${toNum(r.mini_qty) || 1}`);
      }
      r.papers?.forEach((p) => {
        if (p.paper_type && toNum(p.sheets) > 0) {
          items.push(`  ${p.paper_type} Paper (${p.sheets} sheets)`);
        }
      });
    });
  }
  if (d.video_rows?.length) {
    d.video_rows.forEach((r) => {
      items.push(`Video: ${r.video_service} (${r.quality}) x${toNum(r.qty) || 1}`);
    });
  }
  if (d.custom_items?.length) {
    d.custom_items.forEach((item) => {
      if (item.name) items.push(`Additional: ${item.name} x${toNum(item.qty) || 1} (${formatINR(toNum(item.amount))})`);
    });
  }
  if (d.raw_video) items.push('Raw Video');
  if (d.raw_selected_photos) items.push('Selected Photos');
  if (d.raw_all_photos) items.push('All Photos');
  if (d.raw_edited_photos) items.push('Finished/Edited Photos');
  return items;
}

export function BillInvoice({ booking, settings, compact = false }: { booking: Booking; settings: StudioSettings | null; compact?: boolean }) {
  const s = settings;
  const safeEvents = booking.events ?? [];
  const hasEventDates = safeEvents.some((e) => e.date);
  const hasEventTimes = safeEvents.some((e) => e.start_time || e.end_time || e.time);
  const hasEventVenues = safeEvents.some((e) => e.venue);
  const hasEventSides = safeEvents.some((e) => e.side);
  const delivList = formatDeliverablesList(booking.deliverables_data ?? DEFAULT_DELIVERABLES);
  const totalAmount = bookingNumber(booking.total_amount);
  const discount = bookingNumber(booking.discount);
  const advancePaid = bookingNumber(booking.advance_paid);
  const netDue = totalAmount - discount - advancePaid;
  const paymentHistory = booking.deliverables_data?.payment_details?.payment_history ?? [];
  const cn = compact ? 'compact-bill' : '';
  return (
    <div className={`bill-page bg-white text-black ${cn}`} style={{ userSelect: 'text', padding: compact ? '3mm 4mm' : undefined }}>
      {/* Header */}
      <div className={compact ? "mb-2 flex items-center justify-between border-b-2 border-black pb-2" : "mb-6 flex items-center justify-between border-b-2 border-black pb-4"}>
        <div className="flex items-center gap-2">
          {s?.films_logo_url && (
            <img src={s.films_logo_url} alt="logo" className={compact ? "h-10 w-10 rounded object-cover" : "h-16 w-16 rounded-lg object-cover"} />
          )}
          <div>
            <h1 className={compact ? "text-base font-bold" : "text-2xl font-bold"}>{s?.films_title ? `${s.films_title} & Production` : 'Bollywood Umang Films & Production'}</h1>
            <p className="text-xs">{s?.films_subtitle ?? ''}</p>
            <p className="text-xs">{s?.address ?? ''} · {s?.phone ?? ''}</p>
            {s?.films_insta && <p className="text-xs">{s.films_insta}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className={compact ? "text-xs font-bold" : "text-sm font-bold"}>{booking.booking_no}</p>
          <p className="text-xs">{formatDate(booking.shoot_date)}</p>
        </div>
      </div>

      {/* Client + Event info side-by-side */}
      <div className={compact ? "mb-2 flex justify-between text-xs" : "mb-4 flex justify-between text-sm"}>
        <div>
          <p><strong>{booking.is_dual_side ? 'Groom:' : 'Client:'}</strong> {booking.client_name}</p>
          {booking.is_dual_side && booking.bride_name && <p><strong>Bride:</strong> {booking.bride_name}</p>}
          <p><strong>Mobile:</strong> {booking.client_mobile}</p>
          {booking.is_dual_side && booking.bride_mobile && <p><strong>Bride Mobile:</strong> {booking.bride_mobile}</p>}
          {booking.client_address && <p><strong>Address:</strong> {booking.client_address}</p>}
        </div>
        <div className="text-right">
          {booking.venue && <p><strong>Venue:</strong> {booking.venue}</p>}
          <p><strong>Status:</strong> {booking.booking_status}</p>
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
      {compact ? (
        <div className="mb-2 flex justify-between gap-4">
          {delivList.length > 0 && (
            <div className="flex-1">
              <p className="mb-0.5 text-xs font-bold">Delivery Data:</p>
              <div className="grid grid-cols-2 gap-0.5 text-xs">
                {delivList.map((d, i) => (
                  <p key={i}>{d}</p>
                ))}
              </div>
            </div>
          )}
          {paymentHistory.length > 0 && (
            <div className="flex-1">
              <p className="mb-0.5 text-xs font-bold">Payment History:</p>
              <table className="w-full border-collapse border border-black text-xs">
                <thead><tr className="bg-gray-100"><th className="border border-black px-1 py-0.5 text-left">Date</th><th className="border border-black px-1 py-0.5 text-left">Mode</th><th className="border border-black px-1 py-0.5 text-right">Amount</th></tr></thead>
                <tbody>{paymentHistory.map((payment) => <tr key={payment.id}><td className="border border-black px-1 py-0.5">{formatDate(payment.payment_date)}</td><td className="border border-black px-1 py-0.5">{payment.payment_mode}</td><td className="border border-black px-1 py-0.5 text-right">{formatINR(bookingNumber(payment.paid_amount))}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <div className="w-44 space-y-0.5 text-xs">
            <div className="flex justify-between"><span>Base:</span><span>{formatINR(bookingNumber(booking.base_amount))}</span></div>
            <div className="flex justify-between"><span>Total:</span><span>{formatINR(totalAmount)}</span></div>
            <div className="flex justify-between"><span>Discount:</span><span>- {formatINR(discount)}</span></div>
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
                {delivList.map((d, i) => (
                  <p key={i}>{d}</p>
                ))}
              </div>
            </div>
          )}

          {paymentHistory.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 text-sm font-bold">Payment History:</p>
              <table className="w-full border-collapse border border-black text-xs">
                <thead><tr className="bg-gray-100"><th className="border border-black px-2 py-1 text-left">Date</th><th className="border border-black px-2 py-1 text-left">Mode</th><th className="border border-black px-2 py-1 text-left">Reason / Note</th><th className="border border-black px-2 py-1 text-right">Amount Paid</th></tr></thead>
                <tbody>{paymentHistory.map((payment) => <tr key={payment.id}><td className="border border-black px-2 py-1">{formatDate(payment.payment_date)}</td><td className="border border-black px-2 py-1">{payment.payment_mode}</td><td className="border border-black px-2 py-1">{payment.custom_note || '—'}</td><td className="border border-black px-2 py-1 text-right">{formatINR(bookingNumber(payment.paid_amount))}</td></tr>)}</tbody>
              </table>
            </div>
          )}

          <div className="ml-auto w-56 space-y-1 text-sm">
            <div className="flex justify-between"><span>Base Amount:</span><span>{formatINR(bookingNumber(booking.base_amount))}</span></div>
            <div className="flex justify-between"><span>Total Package:</span><span>{formatINR(totalAmount)}</span></div>
            <div className="flex justify-between"><span>Discount:</span><span>- {formatINR(discount)}</span></div>
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
          ) : (
            <p className="text-[10px] text-gray-500">UPI ID not configured</p>
          )}
        </div>
        {s?.stamp_image_url && (
          <img src={s.stamp_image_url} alt="stamp" className={compact ? "h-12 w-12 rounded-full object-cover opacity-80" : "h-20 w-20 rounded-full object-cover opacity-80"} />
        )}
        {compact && (
          <div className="text-right text-xs">
            <div className="border-t border-black pt-0.5 px-2">Studio Signature</div>
          </div>
        )}
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
