import { formatINR, formatDate } from '@/lib/format';
import type { Booking, StudioSettings, BookingDeliverables } from '@/lib/types';

const toNum = (v: string | number | undefined) => { const n = Number(v); return isNaN(n) ? 0 : n; };

const DEFAULT_DELIVERABLES: BookingDeliverables = {
  raw_video: false,
  raw_selected_photos: false,
  raw_all_photos: false,
  raw_edited_photos: false,
};

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
  if (d.raw_video) items.push('Raw Video');
  if (d.raw_selected_photos) items.push('Selected Photos');
  if (d.raw_all_photos) items.push('All Photos');
  if (d.raw_edited_photos) items.push('Finished/Edited Photos');
  return items;
}

export function BillInvoice({ booking, settings }: { booking: Booking; settings: StudioSettings | null }) {
  const s = settings;
  const safeEvents = booking.events ?? [];
  const delivList = formatDeliverablesList(booking.deliverables_data ?? DEFAULT_DELIVERABLES);
  return (
    <div className="bill-page bg-white p-8 text-black" style={{ userSelect: 'text' }}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between border-b-2 border-black pb-4">
        <div className="flex items-center gap-3">
          {s?.films_logo_url && (
            <img src={s.films_logo_url} alt="logo" className="h-16 w-16 rounded-lg object-cover" />
          )}
          <div>
            <h1 className="text-2xl font-bold">{s?.films_title ?? 'Bollywood Umang Films'}</h1>
            <p className="text-xs">{s?.films_subtitle ?? ''}</p>
            <p className="text-xs">{s?.address ?? ''} · {s?.phone ?? ''}</p>
            <p className="text-xs">{s?.films_insta ?? ''}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold">{booking.booking_no}</p>
          <p className="text-xs">{formatDate(booking.shoot_date)}</p>
        </div>
      </div>

      {/* Client info */}
      <div className="mb-4 flex justify-between text-sm">
        <div>
          <p><strong>Client:</strong> {booking.client_name}</p>
          <p><strong>Mobile:</strong> {booking.client_mobile}</p>
          <p><strong>Address:</strong> {booking.client_address || '—'}</p>
        </div>
        <div className="text-right">
          <p><strong>Venue:</strong> {booking.venue || '—'}</p>
          <p><strong>Status:</strong> {booking.booking_status}</p>
        </div>
      </div>

      {/* Functions timeline */}
      {safeEvents.length > 0 && (
        <table className="mb-4 w-full border-collapse border border-black text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-black px-2 py-1 text-left">Function</th>
              <th className="border border-black px-2 py-1 text-left">Date</th>
              <th className="border border-black px-2 py-1 text-left">Time</th>
            </tr>
          </thead>
          <tbody>
            {safeEvents.map((e, i) => {
              const label = e.name === 'Custom' && e.customName ? e.customName : e.name;
              return (
                <tr key={i}>
                  <td className="border border-black px-2 py-1">{label}</td>
                  <td className="border border-black px-2 py-1">{formatDate(e.date)}</td>
                  <td className="border border-black px-2 py-1">{e.time || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Delivery Data */}
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

      {/* Financial breakdown */}
      <div className="ml-auto w-56 space-y-1 text-sm">
        <div className="flex justify-between"><span>Base Amount:</span><span>{formatINR(Number(booking.base_amount))}</span></div>
        <div className="flex justify-between"><span>Total Package:</span><span>{formatINR(Number(booking.total_amount))}</span></div>
        <div className="flex justify-between"><span>Discount:</span><span>- {formatINR(Number(booking.discount))}</span></div>
        <div className="flex justify-between"><span>Advance Paid:</span><span>- {formatINR(Number(booking.advance_paid))}</span></div>
        <div className="flex justify-between border-t-2 border-black pt-1 font-bold"><span>Balance Due:</span><span>{formatINR(Number(booking.net_due))}</span></div>
      </div>

      {/* Footer: UPI QR + Stamp */}
      <div className="mt-6 flex items-end justify-between border-t border-black pt-4">
        <div className="flex flex-col items-center gap-1">
          {s?.upi_id ? (
            <>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=upi://pay?pa=${encodeURIComponent(s.upi_id)}`}
                alt="UPI QR"
                className="h-28 w-28"
              />
              <p className="text-[10px] font-semibold">Scan to Pay via UPI</p>
              <p className="text-[10px]">{s.upi_id}</p>
            </>
          ) : (
            <p className="text-[10px] text-gray-500">UPI ID not configured</p>
          )}
        </div>
        {s?.stamp_image_url && (
          <img src={s.stamp_image_url} alt="stamp" className="h-20 w-20 rounded-full object-cover opacity-80" />
        )}
      </div>

      {/* Terms */}
      <div className="mt-4 border-t border-black pt-2">
        <p className="mb-1 text-xs font-bold">Terms &amp; Conditions:</p>
        <div className="whitespace-pre-line text-xs text-gray-700">{s?.terms_conditions ?? ''}</div>
      </div>
    </div>
  );
}
