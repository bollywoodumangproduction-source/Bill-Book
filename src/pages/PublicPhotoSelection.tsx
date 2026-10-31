import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Images,
  CheckCircle2,
  X,
  Lock,
  ShieldCheck,
  Sparkles,
  Eye,
  ChevronLeft,
  ChevronRight,
  Send,
  FileDown,
  Layers,
  AlertCircle,
  Maximize2,
  ArrowLeft,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ClientSelectionSession, Partner, PhotoItem } from '@/lib/types';
import { withPhotoSessionCounts } from '@/lib/types';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';

export function PublicPhotoSelection() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { settings } = useSettings();
  const { toast } = useToast();
  const [session, setSession] = useState<ClientSelectionSession | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinVerified, setPinVerified] = useState(false);
  const [verifiedPin, setVerifiedPin] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinErrorMessage, setPinErrorMessage] = useState('Incorrect PIN. Please try again.');
  const [activeFolder, setActiveFolder] = useState('All');
  const [focusPhoto, setFocusPhoto] = useState<PhotoItem | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [showProofing, setShowProofing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [visiblePhotoLimit, setVisiblePhotoLimit] = useState(240);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const load = useCallback(async (pin?: string) => {
    if (!sessionId) { setLoading(false); return false; }
    if (!pin) { setLoading(false); return false; }
    // Send both names during the verification transition: the current public-share
    // handler reads `id`, while older deployed versions may still read `sessionId`.
    const { data, error } = await supabase.functions.invoke('public-share', { body: { action: 'photo-verify', id: sessionId, sessionId, pin } });
    if (error || !data?.session) {
      let message = data?.error as string | undefined;
      const response = error && typeof error === 'object' && 'context' in error
        ? (error as { context?: unknown }).context
        : undefined;
      if (!message && response instanceof Response) {
        const body = await response.clone().json().catch(() => null) as { error?: string } | null;
        message = body?.error;
      }
      setPinErrorMessage(message || (error?.name === 'FunctionsHttpError'
        ? 'Could not verify this gallery. Check the PIN and try again.'
        : error?.message || 'Could not verify this gallery. Please try again.'));
      return false;
    }
    setSession(withPhotoSessionCounts(data.session as ClientSelectionSession));
    setPartner((data.partner as Partner | null) ?? null);
    return true;
  }, [sessionId]);

  useEffect(() => { setLoading(false); }, [sessionId]);

  useEffect(() => { setVisiblePhotoLimit(240); }, [activeFolder, sessionId]);

  // Refresh lock/proof status without exposing the session table to anonymous clients.
  useEffect(() => {
    if (!pinVerified || !verifiedPin) return;
    const timer = window.setInterval(() => { void load(verifiedPin); }, 20000);
    return () => window.clearInterval(timer);
  }, [pinVerified, verifiedPin, load]);

  // Anti-theft: disable right-click, drag, long-press
  useEffect(() => {
    if (!pinVerified) return;
    const preventContext = (e: MouseEvent) => e.preventDefault();
    const preventDrag = (e: DragEvent) => e.preventDefault();
    const preventTouch = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG') e.preventDefault();
    };
    document.addEventListener('contextmenu', preventContext);
    document.addEventListener('dragstart', preventDrag);
    document.addEventListener('touchstart', preventTouch, { passive: false });
    return () => {
      document.removeEventListener('contextmenu', preventContext);
      document.removeEventListener('dragstart', preventDrag);
      document.removeEventListener('touchstart', preventTouch);
    };
  }, [pinVerified]);

  const verifyPin = async () => {
    if (pinInput.length !== 4) return;
    const valid = await load(pinInput);
    if (valid) {
      setVerifiedPin(pinInput);
      setPinVerified(true);
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  const togglePhoto = useCallback(async (photoId: string) => {
    if (!session || session.isLocked || bulkUpdating) return;
    const photos = session.photos.map((p) => p.id === photoId ? { ...p, selected: !p.selected } : p);
    const { data, error } = await supabase.functions.invoke('public-share', { body: { action: 'photo-update', sessionId: session.id, pin: verifiedPin, photos } });
    if (error || !data?.session) { toast(data?.error || 'Could not save your selection.', 'error'); return; }
    setSession(withPhotoSessionCounts(data.session as ClientSelectionSession));
  }, [session, verifiedPin, toast, bulkUpdating]);

  const visiblePhotos = useMemo(() => {
    if (!session) return [];
    if (activeFolder === 'All') return session.photos;
    return session.photos.filter((p) => p.folder === activeFolder);
  }, [session, activeFolder]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || visiblePhotoLimit >= visiblePhotos.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisiblePhotoLimit((limit) => Math.min(limit + 240, visiblePhotos.length));
    }, { rootMargin: '1200px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visiblePhotoLimit, visiblePhotos.length]);

  const selectedCount = session?.photos.filter((p) => p.selected).length ?? 0;
  const totalCount = session?.photos.length ?? 0;
  const isLocked = session?.isLocked ?? false;

  const setFolderSelection = async (selected: boolean) => {
    if (!session || session.isLocked || bulkUpdating) return;
    const folderPhotos = session.photos.filter((photo) => activeFolder === 'All' || photo.folder === activeFolder);
    if (!folderPhotos.some((photo) => photo.selected !== selected)) return;
    const folderIds = new Set(folderPhotos.map((photo) => photo.id));
    const photos = session.photos.map((photo) => folderIds.has(photo.id) ? { ...photo, selected } : photo);
    setBulkUpdating(true);
    const { data, error } = await supabase.functions.invoke('public-share', {
      body: { action: 'photo-update', sessionId: session.id, pin: verifiedPin, photos },
    });
    setBulkUpdating(false);
    if (error || !data?.session) {
      toast(data?.error || 'Could not save your selection.', 'error');
      return;
    }
    setSession(withPhotoSessionCounts(data.session as ClientSelectionSession));
  };

  const folderBreakdown = useMemo(() => {
    if (!session) return [];
    return session.folders.map((folder) => ({
      folder,
      total: session.photos.filter((p) => p.folder === folder).length,
      selected: session.photos.filter((p) => p.folder === folder && p.selected).length,
    }));
  }, [session]);

  const activeFocusPhoto = useMemo(() => {
    if (!focusPhoto) return null;
    return visiblePhotos[focusIndex] ?? focusPhoto;
  }, [focusPhoto, focusIndex, visiblePhotos]);

  const closeLightbox = useCallback(() => setFocusPhoto(null), []);
  const moveLightbox = useCallback((direction: -1 | 1) => {
    if (visiblePhotos.length < 2) return;
    const nextIndex = (focusIndex + direction + visiblePhotos.length) % visiblePhotos.length;
    setFocusIndex(nextIndex);
    setFocusPhoto(visiblePhotos[nextIndex]);
  }, [focusIndex, visiblePhotos]);

  // Desktop shortcuts only apply while the fullscreen viewer is open.
  useEffect(() => {
    if (!activeFocusPhoto) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLightbox();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        moveLightbox(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        moveLightbox(1);
      } else if ((e.code === 'Space' || e.key.toLowerCase() === 's') && !isLocked) {
        e.preventDefault();
        void togglePhoto(activeFocusPhoto.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = previousOverflow;
    };
  }, [activeFocusPhoto, closeLightbox, isLocked, moveLightbox, togglePhoto]);

  const submitFinal = async () => {
    if (!session) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('public-share', { body: { action: 'photo-submit', sessionId: session.id, pin: verifiedPin } });
    if (error || !data?.session) { setSubmitting(false); toast(data?.error || 'Could not submit your selection.', 'error'); return; }
    setSession(withPhotoSessionCounts(data.session as ClientSelectionSession));
    setSubmitting(false);
    toast('Your selection has been submitted. The gallery is now locked.', 'success');
  };

  const downloadPdf = async () => {
    if (!session) return;
    if (!session.pdfDownloadAllowed) { toast('PDF download is not enabled yet', 'error'); return; }
    const module = await import('html2pdf.js');
    const html2pdf = (module.default ?? module) as any;
    const element = document.getElementById('proof-pdf-content');
    if (!element) return;
    await html2pdf().set({
      margin: [4, 4, 4, 4],
      filename: `Proof_${session.clientName.replace(/\s+/g, '_')}.pdf`,
      image: { type: 'jpeg', quality: 0.92 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(element).save();
    toast('Proofing PDF downloaded', 'success');
  };

  const isProductionSession = session?.clientType === 'B2B' || session?.clientType === 'Lab Order';
  const studioName = isProductionSession
    ? (partner?.name || session?.partnerName || settings?.production_title || 'Bollywood Umang Production')
    : settings?.films_title || 'Bollywood Umang Films';
  const brandLogo = isProductionSession
    ? partner?.logo_url || settings?.production_logo_url
    : settings?.films_logo_url;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <Sparkles className="h-6 w-6 animate-pulse text-amber-400" />
      </div>
    );
  }

  // PIN gate
  if (!pinVerified) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10">
              <Lock className="h-7 w-7 text-amber-400" />
            </div>
            <h1 className="text-lg font-bold text-white">Enter Your Secret PIN</h1>
            <p className="mt-1 text-xs text-slate-400">The studio has shared a 4-digit PIN with you. Enter it below to access your photo selection.</p>
          </div>
          <input
            autoFocus
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={pinInput}
            onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, '')); setPinError(false); }}
            onKeyDown={(e) => e.key === 'Enter' && verifyPin()}
            className={`w-full rounded-xl border bg-slate-800 px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] text-white placeholder-slate-600 outline-none transition ${pinError ? 'border-rose-500' : 'border-white/10 focus:border-amber-500'}`}
            placeholder="••••"
          />
          {pinError && <p className="mt-2 text-center text-xs text-rose-400">{pinErrorMessage}</p>}
          <button onClick={verifyPin} disabled={pinInput.length !== 4} className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-40">
            Unlock Gallery
          </button>
        </div>
      </div>
    );
  }

  if (!session) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">Loading gallery…</div>;

  return (
    <div className="min-h-screen w-full bg-slate-950 text-white">
      {/* Hidden PDF content */}
      <div id="proof-pdf-content" className="hidden">
        {session.proofSheets.sort((a, b) => a.sheetNumber - b.sheetNumber).map((sheet) => (
          <div key={sheet.sheetNumber} style={{ marginBottom: '10px' }}>
            <p style={{ fontSize: '12px', marginBottom: '4px' }}>{sheet.sheetNumber === 0 ? 'Cover Spread' : `Sheet ${sheet.sheetNumber}`}</p>
            <img src={sheet.previewUrl} style={{ width: '100%' }} alt={`Sheet ${sheet.sheetNumber}`} />
            {sheet.correctionNote && <p style={{ fontSize: '10px', marginTop: '4px' }}>Note: {sheet.correctionNote}</p>}
          </div>
        ))}
      </div>

      {/* Sticky top counter bar */}
      <div className="sticky top-0 z-40 w-full border-b border-white/10 bg-slate-900/95 backdrop-blur-xl">
        <div className="w-full px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {brandLogo ? <img src={brandLogo} alt={`${studioName} logo`} className="h-9 w-9 rounded-lg object-cover" /> : <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10"><Images className="h-4 w-4 text-amber-400" /></div>}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{studioName}</p>
                <p className="truncate text-xs text-slate-400">{isProductionSession ? `Run by ${settings?.production_title || 'Bollywood Umang Production'} · ${session.clientName}` : session.clientName}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5">
                <span className="text-xs text-slate-400">Total:</span>
                <span className="text-sm font-bold text-white">{totalCount}</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/15 px-3 py-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-sm font-bold text-emerald-400">{selectedCount}</span>
              </div>
            </div>
          </div>
          {/* Folder filter pills */}
          {folderBreakdown.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button onClick={() => setActiveFolder('All')} className={`rounded-full px-3 py-1 text-xs font-medium transition ${activeFolder === 'All' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                All ({totalCount})
              </button>
              {folderBreakdown.map((f) => (
                <button key={f.folder} onClick={() => setActiveFolder(f.folder)} className={`rounded-full px-3 py-1 text-xs font-medium transition ${activeFolder === f.folder ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                  {f.folder} ({f.selected}/{f.total})
                </button>
              ))}
            </div>
          )}
          {!isLocked && visiblePhotos.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void setFolderSelection(true)}
                disabled={bulkUpdating || visiblePhotos.every((photo) => photo.selected)}
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-40"
              >
                {bulkUpdating ? 'Saving…' : `Select all ${activeFolder === 'All' ? 'photos' : `in ${activeFolder}`}`}
              </button>
              <button
                type="button"
                onClick={() => void setFolderSelection(false)}
                disabled={bulkUpdating || visiblePhotos.every((photo) => !photo.selected)}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/5 disabled:opacity-40"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Locked banner */}
      {isLocked && (
        <div className="w-full px-4 pt-4">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            {session.submitted_at
              ? 'Your selection has been submitted and the gallery is locked. Contact the studio if you need changes.'
              : 'The gallery is locked by the studio. Contact the studio if you need changes.'}
          </div>
        </div>
      )}

      {/* Photo grid */}
      <div className="w-full px-4 py-4">
        {visiblePhotos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Images className="mb-4 h-10 w-10 text-slate-600" />
            <p className="text-sm text-slate-400">No photos in this folder yet.</p>
          </div>
        ) : (
          <div ref={gridRef} className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {visiblePhotos.slice(0, visiblePhotoLimit).map((photo, idx) => (
              <div
                key={photo.id}
                className={`group relative overflow-hidden rounded-xl border-2 transition ${photo.selected ? 'border-emerald-500' : 'border-transparent'}`}
              >
                <img
                  src={photo.previewUrl}
                  alt={photo.fileName}
                  className="aspect-square w-full object-cover select-none"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                />
                {/* Selection tick */}
                <button
                  onClick={() => void togglePhoto(photo.id)}
                  disabled={isLocked || bulkUpdating}
                  className={`absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full shadow-lg transition ${photo.selected ? 'bg-emerald-500 text-white' : 'bg-black/50 text-white opacity-0 group-hover:opacity-100'} ${isLocked ? 'cursor-not-allowed' : 'hover:scale-110'}`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </button>
                {/* Number badge */}
                <span className="absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded bg-black/60 text-[10px] font-bold text-white">{idx + 1}</span>
                {/* Opening a thumbnail shows the professional fullscreen viewer. */}
                <button
                  onClick={() => { setFocusIndex(idx); setFocusPhoto(photo); }}
                  className="absolute inset-0 z-10 cursor-zoom-in"
                  aria-label={`Open ${photo.fileName} in fullscreen viewer`}
                >
                  <span className="sr-only">Open fullscreen viewer</span>
                  <Maximize2 className="absolute bottom-2 left-2 h-7 w-7 rounded-lg bg-black/50 p-1.5 text-white opacity-0 transition group-hover:opacity-100" />
                </button>
              </div>
            ))}
          </div>
        )}
        {visiblePhotoLimit < visiblePhotos.length && <div ref={loadMoreRef} className="py-3 text-center text-xs text-slate-500">Loading more photos as you scroll…</div>}
      </div>

      {/* Bottom action bar */}
      <div className="sticky bottom-0 z-40 w-full border-t border-white/10 bg-slate-900/95 backdrop-blur-xl">
        <div className="w-full px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {session.proofSheets.length > 0 && (
                <button onClick={() => setShowProofing(true)} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5">
                  <Layers className="h-3.5 w-3.5" /> View Proofing
                </button>
              )}
              {session.pdfDownloadAllowed && (
                <button onClick={downloadPdf} className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20">
                  <FileDown className="h-3.5 w-3.5" /> Download PDF
                </button>
              )}
            </div>
            {!isLocked ? (
              <button
                onClick={submitFinal}
                disabled={submitting || selectedCount === 0}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-40"
              >
                <Send className="h-4 w-4" /> {submitting ? 'Submitting...' : 'Final Submit'}
              </button>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <Lock className="h-3.5 w-3.5" /> {session.submitted_at ? 'Submitted & Locked' : 'Gallery Locked'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen desktop lightbox. */}
      {activeFocusPhoto && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-slate-950/98 text-white" role="dialog" aria-modal="true" aria-label="Photo viewer">
          <header className="relative flex h-16 shrink-0 items-center border-b border-white/10 px-4">
            <button onClick={closeLightbox} className="z-10 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
              <ArrowLeft className="h-5 w-5" /> Back
            </button>
            <div className="pointer-events-none absolute inset-x-20 text-center text-sm font-semibold text-slate-100">
              {focusIndex + 1} of {visiblePhotos.length}
            </div>
            <button onClick={closeLightbox} className="ml-auto z-10 rounded-lg p-2 text-slate-200 transition hover:bg-white/10" aria-label="Close viewer">
              <X className="h-6 w-6" />
            </button>
          </header>

          <main className="relative min-h-0 flex-1 px-16 py-4 sm:px-24 sm:py-6">
            <img
              src={activeFocusPhoto.originalUrl || activeFocusPhoto.previewUrl}
              alt={activeFocusPhoto.fileName}
              className="h-full w-full object-contain select-none"
              decoding="async"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
            />
            {visiblePhotos.length > 1 && (
              <>
                <button onClick={() => moveLightbox(-1)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-black/60 p-3 text-white shadow-xl transition hover:bg-white/20 sm:left-6 sm:p-4" aria-label="Previous photo">
                  <ChevronLeft className="h-7 w-7 sm:h-9 sm:w-9" />
                </button>
                <button onClick={() => moveLightbox(1)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-black/60 p-3 text-white shadow-xl transition hover:bg-white/20 sm:right-6 sm:p-4" aria-label="Next photo">
                  <ChevronRight className="h-7 w-7 sm:h-9 sm:w-9" />
                </button>
              </>
            )}
          </main>

          <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-white/10 bg-slate-950/95 px-4 py-3">
            <button
              onClick={() => void togglePhoto(activeFocusPhoto.id)}
              disabled={bulkUpdating || isLocked}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${activeFocusPhoto.selected ? 'bg-emerald-500 text-white hover:bg-emerald-400' : 'bg-blue-500 text-white hover:bg-blue-400'}`}
            >
              <CheckCircle2 className="h-5 w-5" /> {activeFocusPhoto.selected ? 'Selected' : 'Select photo'}
            </button>
            <p className="min-w-0 truncate text-right text-xs text-slate-400">{activeFocusPhoto.folder} / {activeFocusPhoto.fileName}</p>
          </footer>
        </div>
      )}

      {/* Proofing preview modal */}
      {showProofing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4" onClick={() => setShowProofing(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Proofing Preview</h2>
              <button onClick={() => setShowProofing(false)} className="rounded-lg p-1 text-slate-400 hover:bg-white/10"><X className="h-5 w-5" /></button>
            </div>
            {session.proofSheets.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No proofing sheets uploaded yet.</p>
            ) : (
              <div className="space-y-4">
                {session.proofSheets.sort((a, b) => a.sheetNumber - b.sheetNumber).map((sheet) => (
                  <div key={sheet.sheetNumber} className="rounded-xl border border-white/10 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300">{sheet.sheetNumber === 0 ? 'Cover Spread' : `Sheet ${sheet.sheetNumber}`}</span>
                    </div>
                    <img src={sheet.previewUrl} alt={`Sheet ${sheet.sheetNumber}`} className="w-full rounded-lg" draggable={false} onContextMenu={(e) => e.preventDefault()} />
                    {sheet.correctionNote && (
                      <div className="mt-2 rounded-lg bg-amber-500/10 p-2">
                        <p className="text-xs text-amber-300"><span className="font-semibold">Note:</span> {sheet.correctionNote}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {session.pdfDownloadAllowed && (
              <button onClick={downloadPdf} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600">
                <FileDown className="h-4 w-4" /> Download PDF
              </button>
            )}
            {!session.pdfDownloadAllowed && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-slate-800 p-3 text-xs text-slate-400">
                <Lock className="h-3.5 w-3.5" /> PDF download is locked. Ask the studio to enable it.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
