import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link } from 'react-router-dom';
import { Printer, LogIn, ArrowLeft, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Booking } from '@/lib/types';
import { BillInvoice } from '@/components/BillInvoice';
import { useSettings } from '@/context/SettingsContext';
import { buildPdfFilename, downloadA4Pdf, PrintableDualCopies } from '@/lib/pdf';

export function PublicInvoice() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { settings } = useSettings();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dualPrint, setDualPrint] = useState(false);

  const load = useCallback(async () => {
    if (!bookingId) { setError(true); setLoading(false); return; }
    const { data } = await supabase.from('bookings').select('*').eq('id', bookingId).maybeSingle();
    if (data) { setBooking(data as Booking); } else { setError(true); }
    setLoading(false);
  }, [bookingId]);

  useEffect(() => { load(); }, [load]);

  const download = async () => {
    if (!booking) return;
    const element = document.getElementById(`public-invoice-${booking.id}`);
    if (element) await downloadA4Pdf(element, buildPdfFilename(booking.client_name, booking.booking_no));
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Top action bar — hidden when printing */}
      <div className="no-print sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            {settings?.films_logo_url ? (
              <img src={settings.films_logo_url} alt="logo" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
                <Sparkles className="h-4 w-4 text-slate-900" />
              </div>
            )}
            <span className="text-sm font-bold text-slate-900">{settings?.films_title ?? 'Bollywood Umang Films'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </Link>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-amber-400"
            >
              <Printer className="h-4 w-4" />
              Download PDF / Print
            </button>
            <button onClick={download} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">Download A4 PDF</button>
            <button onClick={() => { setDualPrint(true); setTimeout(() => { window.print(); setDualPrint(false); }, 100); }} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">🖨️ 2-in-1 Print</button>
            <Link
              to="/client-login"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">Client Login Portal</span>
              <span className="sm:hidden">Login</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Invoice body */}
      <div className="mx-auto max-w-4xl px-4 py-6 print:p-0">
        {loading ? (
          <div className="flex justify-center py-20">
            <Sparkles className="h-6 w-6 animate-pulse text-amber-500" />
          </div>
        ) : error || !booking ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <p className="text-lg font-semibold text-slate-700">Booking not found</p>
            <p className="text-sm text-slate-500">This invoice link is invalid or the booking has been removed.</p>
            <Link to="/" className="mt-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-400">
              Go Home
            </Link>
          </div>
        ) : (
          <div id={`public-invoice-${booking.id}`} className="overflow-hidden rounded-xl bg-white shadow-lg print:shadow-none print:rounded-none">
            <BillInvoice booking={booking} settings={settings} />
          </div>
        )}
      </div>

      {dualPrint && booking && createPortal(
        <div id="printable-bill-sheet" aria-hidden><PrintableDualCopies><BillInvoice booking={booking} settings={settings} /></PrintableDualCopies></div>,
        document.body,
      )}

      {/* Portaled print template — shown only during print via CSS */}
      {booking && createPortal(
        <div id="printable-bill-sheet" aria-hidden>
          <BillInvoice booking={booking} settings={settings} />
        </div>,
        document.body,
      )}
    </div>
  );
}
