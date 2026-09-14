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
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ClientSelectionSession, PhotoItem } from '@/lib/types';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';

function now(): string {
  return new Date().toISOString();
}

const PIN_STORAGE_KEY = 'photo_selection_pin';

export function PublicPhotoSelection() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { settings } = useSettings();
  const { toast } = useToast();
  const [session, setSession] = useState<ClientSelectionSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [activeFolder, setActiveFolder] = useState('All');
  const [focusPhoto, setFocusPhoto] = useState<PhotoItem | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [showProofing, setShowProofing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const { data } = await supabase.from('photo_selection_sessions').select('*').eq('id', sessionId).single();
    setSession((data as ClientSelectionSession) ?? null);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { void load(); }, [load]);

  // PIN check from sessionStorage
  useEffect(() => {
    if (!sessionId) return;
    const stored = sessionStorage.getItem(`${PIN_STORAGE_KEY}_${sessionId}`);
    if (stored === 'verified') setPinVerified(true);
  }, [sessionId]);

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

  const verifyPin = () => {
    if (!session) return;
    if (pinInput.trim() === session.pinCode) {
      setPinVerified(true);
      setPinError(false);
      sessionStorage.setItem(`${PIN_STORAGE_KEY}_${sessionId!}`, 'verified');
    } else {
      setPinError(true);
      toast('Incorrect PIN. Please check and try again.', 'error');
    }
  };

  const togglePhoto = useCallback(async (photoId: string) => {
    if (!session || session.isLocked) return;
    const photos = session.photos.map((p) => p.id === photoId ? { ...p, selected: !p.selected } : p);
    const updated = { ...session, photos, updated_at: now() };
    setSession(updated);
    await supabase.from('photo_selection_sessions').update({ photos, updated_at: now() }).eq('id', session.id);
  }, [session]);

  const visiblePhotos = useMemo(() => {
    if (!session) return [];
    if (activeFolder === 'All') return session.photos;
    return session.photos.filter((p) => p.folder === activeFolder);
  }, [session, activeFolder]);

  const selectedCount = session?.photos.filter((p) => p.selected).length ?? 0;
  const totalCount = session?.photos.length ?? 0;

  const folderBreakdown = useMemo(() => {
    if (!session) return [];
    return session.folders.map((folder) => ({
      folder,
      total: session.photos.filter((p) => p.folder === folder).length,
      selected: session.photos.filter((p) => p.folder === folder && p.selected).length,
    }));
  }, [session]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!pinVerified || !session || session.isLocked || focusPhoto) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ' && visiblePhotos.length > 0) {
        e.preventDefault();
        void togglePhoto(visiblePhotos[0].id);
      }
      if (e.key === 'ArrowRight' && visiblePhotos.length > 1) {
        e.preventDefault();
        // cycle focus to next
      }
      if (e.key === 'ArrowLeft' && visiblePhotos.length > 1) {
        e.preventDefault();
      }
      const numKey = parseInt(e.key);
      if (numKey >= 1 && numKey <= 9 && numKey <= visiblePhotos.length) {
        e.preventDefault();
        void togglePhoto(visiblePhotos[numKey - 1].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pinVerified, session, visiblePhotos, togglePhoto, focusPhoto]);

  const submitFinal = async () => {
    if (!session) return;
    setSubmitting(true);
    await supabase.from('photo_selection_sessions').update({
      isLocked: true,
      submitted_at: now(),
      updated_at: now(),
    }).eq('id', session.id);
    await load();
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

  const studioName = settings?.studio_name ?? settings?.films_title ?? 'Bollywood Umang Films';

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <Sparkles className="h-6 w-6 animate-pulse text-amber-400" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-center text-white">
        <div>
          <Images className="mx-auto mb-4 h-10 w-10 text-amber-400" />
          <h1 className="text-xl font-bold">Selection link not found</h1>
          <p className="mt-2 text-sm text-slate-400">Please ask the studio to resend your selection link.</p>
        </div>
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
          {pinError && <p className="mt-2 text-center text-xs text-rose-400">Incorrect PIN. Please try again.</p>}
          <button onClick={verifyPin} disabled={pinInput.length !== 4} className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-40">
            Unlock Gallery
          </button>
        </div>
      </div>
    );
  }

  const isLocked = session.isLocked;

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
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                <Images className="h-4 w-4 text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{studioName}</p>
                <p className="truncate text-xs text-slate-400">{session.clientName}</p>
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
        </div>
      </div>

      {/* Locked banner */}
      {isLocked && (
        <div className="w-full px-4 pt-4">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Your selection has been submitted and the gallery is locked. Contact the studio if you need changes.
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
            {visiblePhotos.map((photo, idx) => (
              <div
                key={photo.id}
                className={`group relative overflow-hidden rounded-xl border-2 transition ${photo.selected ? 'border-emerald-500' : 'border-transparent'}`}
              >
                <img
                  src={photo.previewUrl}
                  alt={photo.fileName}
                  className="aspect-square w-full object-cover select-none"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                />
                {/* Selection tick */}
                <button
                  onClick={() => togglePhoto(photo.id)}
                  disabled={isLocked}
                  className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full shadow-lg transition ${photo.selected ? 'bg-emerald-500 text-white' : 'bg-black/50 text-white opacity-0 group-hover:opacity-100'} ${isLocked ? 'cursor-not-allowed' : 'hover:scale-110'}`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </button>
                {/* Number badge */}
                <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded bg-black/60 text-[10px] font-bold text-white">{idx + 1}</span>
                {/* 1:1 focus button */}
                <button
                  onClick={() => { setFocusPhoto(photo); setFocusIndex(idx); }}
                  className="absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/50 text-white opacity-0 transition hover:bg-black/70 group-hover:opacity-100"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
                {/* Click to toggle */}
                <button
                  onClick={() => togglePhoto(photo.id)}
                  disabled={isLocked}
                  className="absolute inset-0 z-0"
                  aria-label="Toggle selection"
                />
              </div>
            ))}
          </div>
        )}
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
                <Lock className="h-3.5 w-3.5" /> Submitted & Locked
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 1:1 Focus modal */}
      {focusPhoto && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95" onClick={() => setFocusPhoto(null)}>
          <button className="absolute right-4 top-4 z-10 rounded-lg bg-white/10 p-2 text-white hover:bg-white/20" onClick={() => setFocusPhoto(null)}>
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                const prevIdx = (focusIndex - 1 + visiblePhotos.length) % visiblePhotos.length;
                setFocusIndex(prevIdx);
                setFocusPhoto(visiblePhotos[prevIdx]);
              }}
              className="rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <div className="flex max-h-[90vh] max-w-[90vw] flex-col items-center">
              <img src={focusPhoto.previewUrl} alt={focusPhoto.fileName} className="max-h-[80vh] max-w-[90vw] object-contain" draggable={false} onContextMenu={(e) => e.preventDefault()} />
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => togglePhoto(focusPhoto.id)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${focusPhoto.selected ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-slate-950'}`}
                >
                  <CheckCircle2 className="h-4 w-4" /> {focusPhoto.selected ? 'Selected' : 'Select'}
                </button>
                <span className="text-xs text-slate-400">{focusPhoto.folder} / {focusPhoto.fileName}</span>
              </div>
            </div>
            <button
              onClick={() => {
                const nextIdx = (focusIndex + 1) % visiblePhotos.length;
                setFocusIndex(nextIdx);
                setFocusPhoto(visiblePhotos[nextIdx]);
              }}
              className="rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>
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
