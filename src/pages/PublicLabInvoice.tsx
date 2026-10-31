import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import { LogIn, Printer, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { StudioLabOrder } from '@/lib/types';
import { LabOrderPrintTemplate } from '@/pages/StudioWork';
import { useSettings } from '@/context/SettingsContext';

export function PublicLabInvoice() {
  const { orderId } = useParams<{ orderId: string }>();
  const { settings } = useSettings();
  const [order, setOrder] = useState<StudioLabOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!orderId) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke('public-share', {
        body: { action: 'lab-invoice', id: orderId },
      });
      if (!active) return;
      if (!error && data?.order) setOrder(data.order as StudioLabOrder);
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [orderId]);

  const printBill = () => window.print();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_28%),linear-gradient(160deg,#020617_0%,#111827_38%,#0f172a_100%)] text-slate-100">
      <div className="no-print mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 shadow-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {settings?.production_logo_url ? (
              <img src={settings.production_logo_url} alt="Studio logo" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-slate-900"><Sparkles className="h-4 w-4" /></div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300">Partner / Lab Invoice</p>
              <p className="truncate text-sm font-bold text-white">{settings?.production_title || 'Bollywood Umang Production'}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={printBill} disabled={!order} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50 sm:text-sm">
              <Printer className="h-4 w-4" /> Print / Save PDF
            </button>
            <Link to="/partner/login" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 sm:text-sm">
              <LogIn className="h-4 w-4" /><span className="hidden sm:inline">Partner Login</span>
            </Link>
          </div>
        </header>
      </div>

      <main className="mx-auto max-w-5xl px-3 pb-8 sm:px-6">
        {loading ? (
          <div className="flex justify-center py-20"><Sparkles className="h-6 w-6 animate-pulse text-amber-400" /></div>
        ) : order ? (
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-white p-2 shadow-2xl sm:p-5">
            <LabOrderPrintTemplate order={order} settings={settings} copyTypeOverride="partner" />
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-5 py-14 text-center">
            <h1 className="text-lg font-semibold text-white">Lab invoice not found</h1>
            <p className="mt-2 text-sm text-slate-400">This public invoice link is invalid or the order is unavailable.</p>
          </div>
        )}
      </main>

      {order && createPortal(
        <div id="printable-bill-sheet" aria-hidden>
          <LabOrderPrintTemplate order={order} settings={settings} copyTypeOverride="partner" />
        </div>,
        document.body,
      )}
    </div>
  );
}
