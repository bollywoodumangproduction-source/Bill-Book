import { useCallback, useEffect, useState, type TouchEvent } from 'react';
import { Check, ChevronLeft, ChevronRight, LockKeyhole, Play, Sparkles, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import type { InteractiveProposal, InteractivePackageSlide } from '@/lib/interactiveProposals';
import { UniversalMediaPreview } from '@/components/UniversalMediaPreview';
import { resolveMediaUrl } from '@/lib/mediaResolver';

function embedUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const id = url.pathname.split('/').filter(Boolean).find((part) => /^\d+$/.test(part));
      return id ? `https://player.vimeo.com/video/${id}` : value;
    }
    const resolved = resolveMediaUrl(value, 'video');
    return resolved?.previewUrl ?? value;
  } catch { return ''; }
}

function displayPackagePrice(value: string) {
  const price = value.trim();
  if (!price) return 'Price on request';
  const amountText = price.replace(/^(?:₹|rs\.?\s*|inr\s*)/i, '').trim();
  const alreadyThousands = amountText.match(/^(\d+(?:\.\d+)?)\s*k\b(.*)$/i);
  if (alreadyThousands) return `₹${alreadyThousands[1]}k${alreadyThousands[2]}`;
  const numeric = amountText.match(/^([\d,]+(?:\.\d+)?)(?:\s*(?:\/-|only))?$/i);
  if (numeric) {
    const amount = Number(numeric[1].replace(/,/g, ''));
    if (Number.isFinite(amount) && amount >= 1000) {
      const thousands = Number((amount / 1000).toFixed(2)).toString();
      return `₹${thousands}k`;
    }
    if (Number.isFinite(amount)) return `₹${amount.toLocaleString('en-IN')}`;
  }
  return `₹${amountText}`;
}

export function PublicProposalView() {
  const { token = '' } = useParams<{ token: string }>();
  const { settings } = useSettings();
  const [proposal, setProposal] = useState<InteractiveProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiresPin, setRequiresPin] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const [showFinalize, setShowFinalize] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [video, setVideo] = useState('');
  const [pdf, setPdf] = useState('');
  const [touchX, setTouchX] = useState<number | null>(null);

  const load = useCallback(async (enteredPin = '') => {
    setLoading(true); setError('');
    const { data, error: invokeError } = await supabase.functions.invoke('interactive-proposals', { body: { action: 'read', token, pin: enteredPin } });
    setLoading(false);
    if (invokeError) { setError(enteredPin ? 'PIN galat hai. Dobara check karke enter karein.' : 'Proposal could not be loaded. Please ask the studio to check the link.'); return; }
    if (data?.requiresPin) { setRequiresPin(true); return; }
    if (data?.error) { setError(data.error); return; }
    setRequiresPin(false); setProposal(data.proposal as InteractiveProposal);
    setClientName((current) => current || data.proposal?.client_name || '');
    setClientPhone((current) => current || data.proposal?.client_phone || '');
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const active: InteractivePackageSlide | undefined = proposal?.packages_data?.[index];
  const sampleVideos = (active?.video_urls ?? (active?.video_embed_url ? [active.video_embed_url] : [])).filter((url) => url.trim());
  const albumPdf = active?.album_pdf_url?.trim() ?? '';
  const photoFolder = active?.photo_folder_url?.trim() ?? '';
  const isSafeLink = (value: string) => { try { const parsed = new URL(value); return parsed.protocol === 'https:' || parsed.protocol === 'http:'; } catch { return false; } };
  const finalize = async () => {
    if (!proposal || !active || saving) return;
    const confirmationWindow = window.open('', '_blank');
    setSaving(true); setError('');
    const { data, error: invokeError } = await supabase.functions.invoke('interactive-proposals', {
      body: { action: 'finalize', token, pin, packageId: active.id, clientName, clientPhone, note },
    });
    setSaving(false);
    if (invokeError || data?.error) { confirmationWindow?.close(); setError(data?.error ?? 'Could not save your package choice. Please try again.'); return; }
    setProposal(data.proposal as InteractiveProposal); setShowFinalize(false);
    const phone = (settings?.studio_whatsapp || settings?.whatsapp_number || settings?.phone || '').replace(/\D/g, '');
    const message = `Wedding package selection received\nClient: ${clientName}\nPhone: ${clientPhone}\nPackage: ${active.package_name} - ${active.price}${note ? `\nNote: ${note}` : ''}\nProposal: ${window.location.href}`;
    if (phone && confirmationWindow) confirmationWindow.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    else confirmationWindow?.close();
  };

  const go = (direction: -1 | 1) => setIndex((current) => Math.max(0, Math.min((proposal?.packages_data.length ?? 1) - 1, current + direction)));
  const onTouchStart = (event: TouchEvent) => setTouchX(event.touches[0]?.clientX ?? null);
  const onTouchEnd = (event: TouchEvent) => {
    if (touchX === null) return;
    const delta = event.changedTouches[0]?.clientX - touchX;
    if (delta > 45) go(-1); else if (delta < -45) go(1);
    setTouchX(null);
  };

  const studioPhone = settings?.studio_call_number || settings?.phone || settings?.whatsapp_number || '';
  return <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(245,158,11,.16),_transparent_38%),linear-gradient(155deg,#020617,#111827_55%,#020617)] px-3 py-6 text-white sm:px-6 sm:py-10">
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 rounded-3xl border border-amber-300/20 bg-slate-900/85 p-5 text-center shadow-2xl sm:p-8">
        {settings?.films_logo_url ? <img src={settings.films_logo_url} className="mx-auto mb-3 h-14 w-14 rounded-2xl object-cover" alt="Studio logo" /> : <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-slate-950"><Sparkles /></div>}
        <p className="text-xs font-semibold tracking-[.24em] text-amber-300">BOLLYWOOD UMANG FILMS & PRODUCTION</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{proposal?.title || 'Wedding Packages'}</h1>
        <p className="mt-2 text-sm text-slate-300">{settings?.address || 'Kamtaul, Darbhanga'}{studioPhone ? ` · ${studioPhone}` : ''}</p>
        {(settings?.studio_whatsapp || settings?.whatsapp_number || settings?.phone) && <a href={`https://wa.me/${(settings.studio_whatsapp || settings.whatsapp_number || settings.phone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-semibold text-amber-300">Let’s Connect</a>}
      </header>

      {loading ? <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-300">Loading proposal…</div>
        : requiresPin ? <form onSubmit={(event) => { event.preventDefault(); void load(pin); }} className="mx-auto max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center"><LockKeyhole className="mx-auto h-8 w-8 text-amber-300" /><h2 className="mt-3 text-lg font-semibold">Enter proposal PIN</h2><input autoComplete="one-time-code" inputMode="numeric" maxLength={4} value={pin} onChange={(event) => { setError(''); setPin(event.target.value.replace(/\D/g, '').slice(0, 4)); }} className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-xl tracking-[.5em]" placeholder="••••" />{error && <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p>}<button className="mt-3 w-full rounded-xl bg-amber-400 px-4 py-3 font-bold text-slate-950">View Proposal</button></form>
        : error && !proposal ? <div className="rounded-2xl border border-rose-400/20 bg-slate-900 p-8 text-center text-rose-200">{error}</div>
        : proposal && proposal.packages_data.length === 0 ? <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-300">The studio is preparing your package options. Please check back soon.</div>
        : proposal && active ? <>
          <div className="mb-3 flex items-center justify-between text-xs text-slate-400"><span>Package {index + 1} of {proposal.packages_data.length}</span><span>{proposal.is_locked ? 'Studio finalized' : 'Swipe or use arrows to compare'}</span></div>
          <section onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="relative overflow-hidden rounded-3xl border border-amber-300/30 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 shadow-[0_24px_80px_rgba(0,0,0,.45)]">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 via-yellow-200 to-amber-500" />
            <article key={active.id} className="animate-[fadeIn_.25s_ease-out]">
              <header className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b-[3px] border-amber-500 bg-[#11143b] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_4px_0_rgba(0,0,0,.45)] sm:px-7 sm:py-4">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <p className="max-w-full break-words text-xs font-extrabold uppercase tracking-[.12em] text-white sm:text-sm">{active.package_name || `PACKAGE ${index + 1}`}</p>
                  {active.badge && <span className="max-w-full break-words rounded-full border border-orange-300/60 bg-orange-500 px-3 py-1 text-[10px] font-extrabold uppercase leading-tight text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_2px_0_rgba(154,52,18,.8)] sm:text-[11px]">{active.badge}</span>}
                </div>
                <h2 className="ml-auto shrink-0 text-right text-2xl font-black leading-none text-amber-300 drop-shadow-[0_2px_0_rgba(120,53,15,.9)] sm:text-3xl">{displayPackagePrice(active.price)}</h2>
              </header>
              <div className="p-5 sm:p-9">
              <div className="my-6 grid gap-6 md:grid-cols-2">
                <div><h3 className="mb-3 text-sm font-bold text-white">Event Coverage</h3><div className="space-y-3">{active.events.map((event, i) => <div key={`${event.name}-${i}`} className="rounded-xl border border-white/10 bg-white/[.03] p-3"><p className="font-semibold text-amber-200">{event.name}</p><p className="mt-1 text-sm leading-relaxed text-slate-300">{event.coverage}</p></div>)}</div></div>
                <div><h3 className="mb-3 text-sm font-bold text-white">Deliverables</h3><ul className="space-y-3">{active.deliverables.map((item, i) => <li key={`${item}-${i}`} className="flex gap-2 text-sm leading-relaxed text-slate-200"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-300"><Check className="h-3.5 w-3.5" /></span>{item}</li>)}</ul></div>
              </div>
              {sampleVideos.length > 0 && <div className="flex flex-wrap gap-2">{sampleVideos.map((url, videoIndex) => <button key={`${active.id}-sample-${videoIndex}`} onClick={() => setVideo(url)} className="inline-flex items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-200"><Play className="h-4 w-4" /> Watch Sample Video{sampleVideos.length > 1 ? ` ${videoIndex + 1}` : ''}</button>)}</div>}
              {(albumPdf && isSafeLink(albumPdf) || photoFolder && isSafeLink(photoFolder)) && <div className="mt-3 flex flex-wrap gap-2">{albumPdf && isSafeLink(albumPdf) && <button onClick={() => setPdf(albumPdf)} className="rounded-xl border border-sky-300/25 bg-sky-400/10 px-4 py-2.5 text-sm font-semibold text-sky-200">View Album PDF</button>}{photoFolder && isSafeLink(photoFolder) && <a href={photoFolder} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-sky-300/25 bg-sky-400/10 px-4 py-2.5 text-sm font-semibold text-sky-200">Open Photo Folder</a>}</div>}
              {proposal.selected_package?.package_id === active.id && <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">Selected by {proposal.selected_package.client_name} on {new Date(proposal.selected_package.submitted_at).toLocaleDateString()}</div>}
              <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5"><button onClick={() => go(-1)} disabled={index === 0} aria-label="Previous package" className="rounded-xl border border-white/10 p-3 text-slate-300 disabled:opacity-30"><ChevronLeft /></button>{proposal.is_locked ? <span className="rounded-xl border border-amber-300/20 px-4 py-3 text-center text-sm font-semibold text-amber-200"><LockKeyhole className="mr-2 inline h-4 w-4" />Package Finalized (Locked by Studio)</span> : <button onClick={() => setShowFinalize(true)} className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-400 px-6 py-3 font-bold text-slate-950 shadow-lg shadow-amber-900/20">Finalize / Choose This Package</button>}<button onClick={() => go(1)} disabled={index >= proposal.packages_data.length - 1} aria-label="Next package" className="rounded-xl border border-white/10 p-3 text-slate-300 disabled:opacity-30"><ChevronRight /></button></div>
              </div>
            </article>
          </section>
          <div className="mt-4 flex justify-center gap-2">{proposal.packages_data.map((slide, i) => <button key={slide.id} aria-label={`Show package ${i + 1}`} onClick={() => setIndex(i)} className={`h-2 rounded-full transition-all ${i === index ? 'w-8 bg-amber-300' : 'w-2 bg-slate-600'}`} />)}</div>
        </> : null}

      {error && proposal && <p role="alert" className="mt-3 rounded-xl border border-rose-400/20 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}
      <footer className="mt-8 text-center text-xs text-slate-500">Wedding proposal · {settings?.address || 'Kamtaul, Darbhanga'}</footer>
    </div>

    {showFinalize && active && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-3" role="dialog" aria-modal="true" aria-labelledby="proposal-finalize-title"><div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h2 id="proposal-finalize-title" className="text-lg font-bold">Confirm package selection</h2><p className="mt-1 text-sm text-amber-200">{active.package_name} · {active.price}</p></div><button onClick={() => setShowFinalize(false)} aria-label="Close" className="text-slate-400"><X /></button></div><div className="mt-4 space-y-3"><input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name" /><input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="Phone number" /><textarea className="min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" /></div><button disabled={saving || !clientName.trim() || !clientPhone.trim()} onClick={() => void finalize()} className="mt-4 w-full rounded-xl bg-amber-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-50">{saving ? 'Saving…' : 'Confirm & Send Selection'}</button></div></div>}

    {video && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-3" role="dialog" aria-modal="true" aria-label="Sample video"><button onClick={() => setVideo('')} className="absolute right-4 top-4 rounded-full bg-slate-800 p-2" aria-label="Close video"><X /></button><div className="w-full max-w-5xl">{(() => { const url = embedUrl(video); const isVimeo = /(?:vimeo\.com|player\.vimeo\.com)/i.test(video); if (isVimeo) return <iframe className="aspect-video w-full rounded-xl" src={url} title="Wedding sample video" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />; return <UniversalMediaPreview url={video} kind="video" title="Wedding sample video" mediaClassName="aspect-video w-full rounded-xl" />; })()}</div></div>}
    {pdf && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-3" role="dialog" aria-modal="true" aria-label="Album PDF"><button onClick={() => setPdf('')} className="absolute right-4 top-4 rounded-full bg-slate-800 p-2" aria-label="Close PDF"><X /></button><div className="w-full max-w-5xl"><UniversalMediaPreview url={pdf} kind="pdf" title="Album PDF" mediaClassName="h-[80vh] min-h-[360px] w-full rounded-xl" /></div></div>}
  </main>;
}
