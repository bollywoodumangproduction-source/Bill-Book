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

  const heroImage = settings?.films_logo_url || settings?.production_logo_url || settings?.stamp_image_url || '';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.14),_transparent_28%),linear-gradient(160deg,#020617_0%,#111827_38%,#0f172a_100%)] text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6 pb-10">
        {/* Top action bar — hidden when printing */}
        <div className="no-print sticky top-0 z-50 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 shadow-2xl shadow-slate-950/50 backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {settings?.films_logo_url ? (
                <img src={settings.films_logo_url} alt="logo" className="h-9 w-9 rounded-xl object-cover ring-1 ring-white/10" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-slate-900">
                  <Sparkles className="h-4 w-4" />
                </div>
              )}
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-amber-300/80">Studio</p>
                <span className="text-sm font-bold text-white">{settings?.films_title ?? 'Bollywood Umang Films'}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-medium text-slate-900 transition-colors hover:bg-amber-400 sm:text-sm"
              >
                <Printer className="h-4 w-4" />
                Download PDF / Print
              </button>
              <button onClick={download} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition-colors hover:bg-white/10 sm:text-sm">Download A4 PDF</button>
              <button onClick={() => { setDualPrint(true); setTimeout(() => { window.print(); setDualPrint(false); }, 100); }} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition-colors hover:bg-white/10 sm:text-sm">🖨️ 2-in-1 Print</button>
              <Link
                to="/client-login"
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 sm:text-sm"
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Client Login Portal</span>
                <span className="sm:hidden">Login</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Invoice body */}
        <div className="mx-auto mt-6 max-w-5xl px-1 py-2 print:p-0">
          {loading ? (
            <div className="flex justify-center py-20">
              <Sparkles className="h-6 w-6 animate-pulse text-amber-500" />
            </div>
          ) : error || !booking ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 bg-slate-900/60 py-20 text-center shadow-2xl shadow-slate-950/40">
              <p className="text-lg font-semibold text-white">Booking not found</p>
              <p className="text-sm text-slate-300">This invoice link is invalid or the booking has been removed.</p>
              <Link to="/" className="mt-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-400">
                Go Home
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-900/60 shadow-[0_30px_80px_rgba(2,6,23,0.75)] backdrop-blur-xl">
              <div className="relative overflow-hidden border-b border-white/10 bg-slate-950/60">
                {heroImage ? (
                  <img src={heroImage} alt="studio banner" className="h-40 w-full object-cover opacity-30" />
                ) : (
                  <div className="h-40 w-full bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.35),_transparent_50%),linear-gradient(135deg,#0f172a_0%,#1e293b_50%,#111827_100%)]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/75 to-slate-900/30" />
                <div className="relative flex flex-col gap-4 p-6 sm:p-8">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-amber-300/80">Invoice / Receipt</p>
                      <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{booking.client_name}</h1>
                    </div>
                    <div className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200">
                      {booking.booking_no}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-200/90">
                    <span>{booking.event_function}</span>
                    <span className="h-1 w-1 rounded-full bg-slate-400" />
                    <span>{booking.venue || 'Venue to be confirmed'}</span>
                  </div>
                </div>
              </div>
              <div className="p-3 sm:p-5">
                <div id={`public-invoice-${booking.id}`} className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200 print:shadow-none print:rounded-none">
                  <BillInvoice booking={booking} settings={settings} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {dualPrint && booking && createPortal(
        <div id="printable-bill-sheet" aria-hidden><PrintableDualCopies><BillInvoice booking={booking} settings={settings} compact /></PrintableDualCopies></div>,
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
