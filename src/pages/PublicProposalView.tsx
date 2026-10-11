import { useCallback, useEffect, useState, type TouchEvent } from 'react';
import { Check, CheckCircle2, ChevronLeft, ChevronRight, FileText, Image as ImageIcon, LockKeyhole, Play, Sparkles, X } from 'lucide-react';
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

  const selectedIndex = proposal?.selected_package
    ? proposal.packages_data.findIndex((slide) => slide.id === proposal.selected_package?.package_id)
    : -1;
  const displayIndex = proposal?.is_locked && selectedIndex >= 0 ? selectedIndex : index;
  const active: InteractivePackageSlide | undefined = proposal?.packages_data?.[displayIndex];
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

  const go = (direction: -1 | 1) => {
    if (proposal?.is_locked) return;
    setIndex((current) => Math.max(0, Math.min((proposal?.packages_data.length ?? 1) - 1, current + direction)));
  };
  const onTouchStart = (event: TouchEvent) => setTouchX(event.touches[0]?.clientX ?? null);
  const onTouchEnd = (event: TouchEvent) => {
    if (touchX === null || proposal?.is_locked) return;
    const delta = event.changedTouches[0]?.clientX - touchX;
    if (delta > 45) go(-1); else if (delta < -45) go(1);
    setTouchX(null);
  };

  const studioPhone = settings?.studio_call_number || settings?.phone || settings?.whatsapp_number || '';
  useEffect(() => {
    if (!video) return;
    const scrollY = window.scrollY;
    const previousBodyStyles = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyStyles.overflow;
      document.body.style.position = previousBodyStyles.position;
      document.body.style.top = previousBodyStyles.top;
      document.body.style.width = previousBodyStyles.width;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [video]);
  return <main className="min-h-screen bg-[radial-gradient(ellipse_at_12%_0%,_rgba(245,158,11,.16),_transparent_34%),radial-gradient(ellipse_at_88%_22%,_rgba(56,189,248,.07),_transparent_28%),linear-gradient(155deg,#020617,#0b1221_52%,#020617)] px-3 pt-0 pb-28 text-white sm:px-6 sm:pt-10">
    <div className="mx-auto max-w-4xl">
      <header className="relative -mx-3 mb-0 flex flex-row items-center justify-between gap-2 overflow-hidden rounded-none border border-amber-300/20 bg-gradient-to-br from-slate-950 via-[#0b1425] to-slate-950 px-3 py-2 text-left shadow-[0_8px_20px_rgba(0,0,0,.34),inset_0_1px_0_rgba(255,255,255,.06)] sm:mx-0 sm:mb-9 sm:flex-col sm:rounded-[28px] sm:p-9 sm:text-center sm:shadow-[0_24px_70px_rgba(0,0,0,.4),inset_0_1px_0_rgba(255,255,255,.06)] sm:backdrop-blur-none">
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
        <div className="relative flex min-w-0 items-center gap-2 sm:mb-1 sm:flex-col">
          {settings?.films_logo_url ? <img src={settings.films_logo_url} className="h-10 w-10 shrink-0 rounded-lg border border-amber-300/30 object-cover shadow-[0_8px_24px_rgba(245,158,11,.18)] sm:mb-3 sm:h-16 sm:w-16 sm:rounded-2xl" alt="Studio logo" /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-100/30 bg-gradient-to-br from-amber-200 via-amber-400 to-orange-500 text-slate-950 shadow-[0_8px_24px_rgba(245,158,11,.22)] sm:mb-3 sm:h-16 sm:w-16 sm:rounded-2xl"><Sparkles className="h-4 w-4 sm:h-6 sm:w-6" /></div>}
          <div className="min-w-0 sm:text-center">
            <p className="truncate text-[7px] font-bold leading-tight tracking-[.1em] text-amber-300 sm:text-xs sm:tracking-[.28em]">BOLLYWOOD UMANG FILMS & PRODUCTION</p>
            <h1 className="mt-0.5 truncate text-sm font-bold leading-tight tracking-tight text-white sm:mt-3 sm:text-3xl">{proposal?.title || 'Wedding Packages'}</h1>
            <p className="mx-auto mt-0.5 max-w-full truncate text-[8px] leading-tight text-slate-300 sm:mt-2 sm:text-sm">{settings?.address || 'Kamtaul, Darbhanga'}{studioPhone ? ` · ${studioPhone}` : ''}</p>
          </div>
        </div>
        {(settings?.studio_whatsapp || settings?.whatsapp_number || settings?.phone) && <a href={`https://wa.me/${(settings.studio_whatsapp || settings.whatsapp_number || settings.phone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="relative shrink-0 rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[9px] font-semibold leading-tight text-amber-200 transition hover:bg-amber-300/15 sm:mt-4 sm:px-4 sm:py-2 sm:text-sm">Let’s Connect</a>}
      </header>

      {loading ? <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-300">Loading proposal…</div>
        : requiresPin ? <form onSubmit={(event) => { event.preventDefault(); void load(pin); }} className="mx-auto max-w-sm rounded-[24px] border border-amber-300/20 bg-gradient-to-br from-slate-900 to-slate-950 p-6 text-center shadow-2xl sm:p-8"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10"><LockKeyhole className="h-6 w-6 text-amber-300" /></div><h2 className="mt-4 text-lg font-semibold">Enter proposal PIN</h2><p className="mt-1 text-sm text-slate-400">Use the 4-digit code shared by the studio.</p><input autoComplete="one-time-code" inputMode="numeric" maxLength={4} value={pin} onChange={(event) => { setError(''); setPin(event.target.value.replace(/\D/g, '').slice(0, 4)); }} className="mt-5 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-xl tracking-[.5em] focus:border-amber-300/60 focus:outline-none" placeholder="••••" />{error && <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p>}<button className="mt-4 w-full rounded-xl bg-gradient-to-r from-amber-300 to-orange-400 px-4 py-3 font-bold text-slate-950 shadow-lg shadow-amber-950/30 transition hover:brightness-105">View Proposal</button></form>
        : error && !proposal ? <div className="rounded-2xl border border-rose-400/20 bg-slate-900 p-8 text-center text-rose-200">{error}</div>
        : proposal && proposal.packages_data.length === 0 ? <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-300">The studio is preparing your package options. Please check back soon.</div>
        : proposal && active ? <>
          {proposal.selected_package && <div role="status" className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-300/30 bg-emerald-950/60 p-4 text-emerald-100 shadow-lg">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <div><p className="font-bold">Package selection submitted successfully</p><p className="mt-1 text-sm">{proposal.selected_package.package_name} · {proposal.selected_package.price} — submitted by {proposal.selected_package.client_name} on {new Date(proposal.selected_package.submitted_at).toLocaleDateString()}.</p><p className="mt-1 text-xs text-emerald-200/80">{proposal.is_locked ? 'The studio has locked this selection. It is now read-only.' : 'Your selection is saved. You can change it until the studio locks the proposal.'}</p></div>
          </div>}
          {proposal.is_locked && !proposal.selected_package && <div role="status" className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-950/40 p-4 text-sm text-amber-100"><LockKeyhole className="h-5 w-5 shrink-0" />The studio has locked this proposal. Package details are read-only; contact the studio if you need a change.</div>}
          <section onTouchStart={proposal.is_locked ? undefined : onTouchStart} onTouchEnd={proposal.is_locked ? undefined : onTouchEnd} className="relative overflow-visible rounded-3xl border border-amber-300/25 bg-gradient-to-br from-[#0b1425] via-[#0a1220] to-[#070d19] shadow-[0_28px_85px_rgba(0,0,0,.58),0_1px_0_rgba(255,255,255,.04)_inset]">
            <article key={active.id} className="animate-[fadeIn_.25s_ease-out]">
              <header className="sticky top-0 z-40 -mx-3 mt-0 flex min-h-[40px] flex-row flex-nowrap items-center justify-between gap-2 border-b-4 border-amber-500 bg-slate-900 px-3 py-1 shadow-[0_4px_0_#8a5a12,0_7px_14px_rgba(0,0,0,.45)] sm:-mt-2 sm:min-h-0 sm:gap-4 sm:rounded-t-[22px] sm:border-b-[5px] sm:px-7 sm:py-4 sm:shadow-[0_5px_0_#8a5a12,0_10px_18px_rgba(0,0,0,.52),inset_0_1px_0_rgba(255,255,255,.08)]">
                <div className="flex min-w-0 flex-1 flex-col items-start gap-0 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex min-w-0 max-w-full flex-row items-center gap-2">
                    <span className="shrink-0 rounded-full border border-white/15 bg-slate-950 px-1 py-0.5 text-[7px] font-bold tracking-wide text-slate-300 sm:px-2 sm:py-1 sm:text-[10px]">{String(displayIndex + 1).padStart(2, '0')}/{String(proposal.packages_data.length).padStart(2, '0')}</span>
                    <p className="min-w-0 truncate text-[9px] font-extrabold uppercase tracking-[.04em] text-white sm:text-sm sm:tracking-[.12em]">{active.package_name || `PACKAGE ${displayIndex + 1}`}</p>
                  </div>
                  {active.badge && <span className="max-w-full whitespace-normal text-[7px] font-bold leading-[9px] text-amber-200 sm:whitespace-nowrap sm:text-[11px] sm:leading-tight">({active.badge})</span>}
                </div>
                <h2 className="shrink-0 text-right text-[13px] font-black leading-none text-amber-300 drop-shadow-[0_2px_0_rgba(120,53,15,.9)] sm:text-3xl">{displayPackagePrice(active.price)}</h2>
              </header>
              <div className="p-3 sm:p-9">
              <div className="my-5 grid gap-4 md:my-7 md:grid-cols-2 md:gap-5">
                <div className="rounded-2xl border border-white/[.08] bg-slate-950/35 p-3 sm:p-5"><h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-slate-100 sm:mb-4"><span className="h-5 w-1 rounded-full bg-amber-400" />Event Coverage</h3><div className="space-y-2 sm:space-y-3">{active.events.map((event, i) => <div key={`${event.name}-${i}`} className="rounded-xl border border-white/[.08] bg-white/[.035] p-3 shadow-[0_5px_14px_rgba(0,0,0,.14)] sm:p-3.5"><p className="font-semibold text-amber-200">{event.name}</p><p className="mt-1.5 text-sm leading-relaxed text-slate-300">{event.coverage}</p></div>)}</div></div>
                <div className="rounded-2xl border border-white/[.08] bg-slate-950/35 p-3 sm:p-5"><h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-slate-100 sm:mb-4"><span className="h-5 w-1 rounded-full bg-amber-400" />Deliverables</h3><ul className="space-y-2 sm:space-y-3">{active.deliverables.map((item, i) => <li key={`${item}-${i}`} className="flex gap-2.5 text-sm leading-relaxed text-slate-200"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-300/20 bg-amber-400/10 text-amber-300"><Check className="h-3.5 w-3.5" /></span>{item}</li>)}</ul></div>
              </div>
              {(sampleVideos.length > 0 || albumPdf && isSafeLink(albumPdf) || photoFolder && isSafeLink(photoFolder)) && <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/[.08] pt-3 sm:mt-5 sm:gap-2 sm:pt-5">{sampleVideos.map((url, videoIndex) => <button key={`${active.id}-sample-${videoIndex}`} onClick={() => setVideo(url)} title={`Watch sample video ${videoIndex + 1}`} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-amber-300/25 bg-amber-300/10 px-2.5 py-1.5 text-[10px] font-semibold leading-tight text-amber-100 shadow-sm transition hover:border-amber-200/50 hover:bg-amber-300/15 sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm"><Play className="h-3.5 w-3.5" />Video{sampleVideos.length > 1 ? ` ${videoIndex + 1}` : ''}</button>)}{albumPdf && isSafeLink(albumPdf) && <button onClick={() => setPdf(albumPdf)} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-sky-300/20 bg-sky-400/[.07] px-2.5 py-1.5 text-[10px] font-semibold leading-tight text-sky-100 transition hover:bg-sky-400/15 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm"><FileText className="h-3.5 w-3.5" />PDF</button>}{photoFolder && isSafeLink(photoFolder) && <a href={photoFolder} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-sky-300/20 bg-sky-400/[.07] px-2.5 py-1.5 text-[10px] font-semibold leading-tight text-sky-100 transition hover:bg-sky-400/15 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm"><ImageIcon className="h-3.5 w-3.5" />Photos</a>}</div>}
              {proposal.selected_package?.package_id === active.id && <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">This is the package selected by {proposal.selected_package.client_name}.</div>}
              </div>
            </article>
          </section>
          {!proposal.is_locked && <div className="mt-4 flex justify-center gap-2">{proposal.packages_data.map((slide, i) => <button key={slide.id} aria-label={`Show package ${i + 1}`} onClick={() => setIndex(i)} className={`h-2 rounded-full transition-all ${i === displayIndex ? 'w-8 bg-amber-300' : 'w-2 bg-slate-600'}`} />)}</div>}
        </> : null}

      {error && proposal && <p role="alert" className="mt-3 rounded-xl border border-rose-400/20 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}
      <footer className="mt-9 border-t border-white/[.06] pt-5 text-center text-xs text-slate-500"><span className="font-semibold tracking-[.12em] text-slate-400">BOLLYWOOD UMANG FILMS & PRODUCTION</span><span className="mx-2 text-amber-400/60">·</span>Wedding Proposal · {settings?.address || 'Kamtaul, Darbhanga'}</footer>
    </div>

    {proposal && active && !proposal.is_locked && <nav aria-label="Package navigation" className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-2 border-t border-slate-800 bg-slate-900/95 px-4 py-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,.35)] backdrop-blur">
      <button onClick={() => go(-1)} disabled={displayIndex === 0} aria-label="Previous package" className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-xl border border-white/10 bg-slate-950/70 px-2 text-[10px] font-semibold text-slate-200 transition hover:border-amber-300/30 disabled:opacity-35 sm:min-h-10 sm:px-4 sm:text-sm"><ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span>Back</span></button>
      <button onClick={() => setShowFinalize(true)} className="min-h-9 min-w-0 max-w-[170px] flex-1 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-2.5 py-1.5 text-[10px] font-bold leading-tight text-slate-950 shadow-[0_3px_0_#9a5b12,0_7px_16px_rgba(245,158,11,.16)] transition hover:brightness-105 sm:min-h-10 sm:max-w-sm sm:px-6 sm:py-2.5 sm:text-sm">{proposal.selected_package ? <><span className="sm:hidden">Confirm</span><span className="hidden sm:inline">Change / Confirm Package</span></> : <><span className="sm:hidden">Choose Package</span><span className="hidden sm:inline">Finalize / Choose This Package</span></>}</button>
      <button onClick={() => go(1)} disabled={displayIndex >= proposal.packages_data.length - 1} aria-label="Next package" className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-xl border border-white/10 bg-slate-950/70 px-2 text-[10px] font-semibold text-slate-200 transition hover:border-amber-300/30 disabled:opacity-35 sm:min-h-10 sm:px-4 sm:text-sm"><span>Next</span><ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></button>
    </nav>}

    {showFinalize && active && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="proposal-finalize-title"><div className="w-full max-w-lg rounded-[24px] border border-amber-300/20 bg-gradient-to-br from-slate-900 to-slate-950 p-5 shadow-[0_30px_100px_rgba(0,0,0,.7)] sm:p-6"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-300">Your selection</p><h2 id="proposal-finalize-title" className="mt-1 text-lg font-bold">Confirm package selection</h2><p className="mt-2 inline-flex rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-sm font-semibold text-amber-100">{active.package_name} · {displayPackagePrice(active.price)}</p></div><button onClick={() => setShowFinalize(false)} aria-label="Close" className="rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-white"><X /></button></div><div className="mt-5 space-y-3"><input className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-3 focus:border-amber-300/50 focus:outline-none" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name" /><input className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-3 focus:border-amber-300/50 focus:outline-none" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="Phone number" /><textarea className="min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-3 focus:border-amber-300/50 focus:outline-none" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" /></div><button disabled={saving || !clientName.trim() || !clientPhone.trim()} onClick={() => void finalize()} className="mt-5 w-full rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-4 py-3 font-bold text-slate-950 shadow-[0_4px_0_#9a5b12] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving…' : 'Confirm & Send Selection'}</button><p className="mt-3 text-center text-xs text-slate-500">Your choice will be sent to the studio for confirmation.</p></div></div>}

    {video && <div onClick={() => setVideo('')} className="fixed inset-0 z-[100] flex h-[100dvh] items-center justify-center overflow-hidden overscroll-none bg-black/95 px-3" role="dialog" aria-modal="true" aria-label="Sample video preview"><button type="button" onClick={(event) => { event.stopPropagation(); setVideo(''); }} className="absolute right-3 top-3 z-[101] flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-slate-900/90 text-white shadow-lg transition hover:bg-slate-800" style={{ top: 'max(12px, env(safe-area-inset-top))' }} aria-label="Close video preview"><X className="h-6 w-6" /></button><div onClick={(event) => event.stopPropagation()} style={{ width: 'min(calc(100vw - 24px), calc(80dvh * 16 / 9))', maxHeight: '80dvh' }} className="aspect-video overflow-hidden bg-black">{(() => { const media = resolveMediaUrl(video, 'video'); const isVimeo = /(?:vimeo\.com|player\.vimeo\.com)/i.test(video); if (media?.provider === 'pcloud') return <ProposalPcloudVideoPreview src={media.previewUrl} />; if (isVimeo) return <iframe className="aspect-video w-full max-w-4xl border-0" src={embedUrl(video)} title="Wedding sample video" allow="autoplay; fullscreen; encrypted-media" allowFullScreen />; return <UniversalMediaPreview url={video} kind="video" title="Wedding sample video" className="h-full w-full" mediaClassName="aspect-video w-full max-w-4xl border-0" />; })()}</div></div>}
    {pdf && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-3" role="dialog" aria-modal="true" aria-label="Album PDF"><button onClick={() => setPdf('')} className="absolute right-4 top-4 rounded-full bg-slate-800 p-2" aria-label="Close PDF"><X /></button><div className="w-full max-w-5xl">{resolveMediaUrl(pdf, 'pdf')?.provider === 'pcloud' ? <ProposalExternalMediaLink url={pdf} label="Open album PDF" /> : <UniversalMediaPreview url={pdf} kind="pdf" title="Album PDF" mediaClassName="h-[80vh] min-h-[360px] w-full rounded-xl" />}</div></div>}
  </main>;
}

function ProposalExternalMediaLink({ url, label }: { url: string; label: string }) {
  return <div className="mx-auto max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center shadow-2xl">
    <p className="text-lg font-semibold text-white">{label}</p>
    <p className="mt-2 text-sm text-slate-300">This file is hosted externally. Open it in a new tab to view.</p>
    <a href={url} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex rounded-xl bg-amber-400 px-5 py-3 font-bold text-slate-950">Open file</a>
  </div>;
}

function ProposalPcloudVideoPreview({ src }: { src: string }) {
  return <div className="relative mx-auto aspect-video w-full overflow-hidden rounded-xl bg-black">
    <iframe
      title="pCloud sample video"
      src={src}
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      allowFullScreen
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      className="absolute left-0 top-0 w-full border-0 [--pcloud-header-crop:116px] max-[639px]:[--pcloud-header-crop:150px]"
      style={{ height: 'calc(100% + var(--pcloud-header-crop))', transform: 'translateY(calc(var(--pcloud-header-crop) * -1))' }}
    />
  </div>;
}
