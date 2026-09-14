import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  Clipboard,
  Download,
  ExternalLink,
  Film,
  Lock,
  Play,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  Video,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Booking, TeaserProject, TeaserStatus } from '@/lib/types';
import { formatINR } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import { inputClass, selectClass, Field } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { copyToClipboard } from '@/lib/clipboard';

const STATUS_LABELS: Record<TeaserStatus, string> = {
  editing: 'Editing in Progress',
  complete: 'Editing Complete',
  delivered: 'Delivered',
};

const STATUS_COLORS: Record<TeaserStatus, 'amber' | 'emerald' | 'sky'> = {
  editing: 'amber',
  complete: 'emerald',
  delivered: 'sky',
};

function nowISO(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function teaserUrl(project: TeaserProject): string {
  return `/teaser-preview?project=${project.id}`;
}

const toNum = (v: string | number | undefined) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

export function TeaserPreview() {
  const { toast } = useToast();
  const { settings } = useSettings();
  const [projects, setProjects] = useState<TeaserProject[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    const [{ data: teaserData }, { data: bookingData }] = await Promise.all([
      supabase.from('teaser_projects').select('*').order('updated_at', { ascending: false }),
      supabase.from('bookings').select('*').order('shoot_date'),
    ]);
    const nextProjects = (teaserData ?? []) as TeaserProject[];
    setProjects(nextProjects);
    setBookings((bookingData ?? []) as Booking[]);
    setSelectedId((current) => current || nextProjects[0]?.id || '');
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects.filter((project) => !query || project.client_name.toLowerCase().includes(query));
  }, [projects, search]);

  const selected = projects.find((project) => project.id === selectedId) ?? null;
  const selectedBooking = bookings.find((booking) => booking.id === selected?.booking_id) ?? null;
  const balance = selectedBooking ? toNum(selectedBooking.total_amount) - toNum(selectedBooking.discount) - toNum(selectedBooking.advance_paid) : 0;

  const createProject = async (bookingId: string, clientName: string, videoUrl: string, watermark: string) => {
    const timestamp = nowISO();
    const payload: TeaserProject = {
      id: newId(),
      booking_id: bookingId,
      client_name: clientName.trim(),
      video_url: videoUrl.trim(),
      status: 'editing',
      watermark_text: watermark.trim(),
      drive_url: '',
      created_at: timestamp,
      updated_at: timestamp,
    };
    const { error } = await supabase.from('teaser_projects').insert(payload);
    if (error) { toast('Could not create teaser project', 'error'); return; }
    setShowCreate(false);
    await load();
    setSelectedId(payload.id);
    toast('Teaser project created', 'success');
  };

  const updateProject = async (id: string, patch: Partial<TeaserProject>) => {
    await supabase.from('teaser_projects').update({ ...patch, updated_at: nowISO() }).eq('id', id);
    await load();
  };

  const deleteProject = async (id: string) => {
    await supabase.from('teaser_projects').delete().eq('id', id);
    toast('Teaser project removed', 'info');
    await load();
  };

  const copyShareLink = async () => {
    if (!selected) return;
    const ok = await copyToClipboard(`${window.location.origin}${teaserUrl(selected)}`);
    toast(ok ? 'Preview link copied' : 'Could not copy link', ok ? 'success' : 'error');
  };

  const whatsappShare = () => {
    if (!selected) return;
    const text = `Your teaser preview is ready! Watch it here: ${window.location.origin}${teaserUrl(selected)}\n\nBollywood Umang Films`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400"><Video className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Teaser &amp; Clearance</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Preview reels and balance clearance lock</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"><Plus className="h-4 w-4" /> New Teaser</button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <input value={search} onChange={(event) => setSearch(event.target.value)} className={inputClass} placeholder="Search clients..." />
          {loading ? <div className="flex justify-center py-16"><Sparkles className="h-5 w-5 animate-pulse text-amber-500" /></div> : filtered.length === 0 ? <EmptyState icon={Video} title="No teaser projects" subtitle="Create one to begin" /> : (
            <div className="space-y-2">
              {filtered.map((project) => (
                <button key={project.id} onClick={() => setSelectedId(project.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === project.id ? 'border-amber-400 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10' : 'border-slate-200 bg-white hover:border-amber-300 dark:border-white/10 dark:bg-slate-900/50'}`}>
                  <div className="flex items-start gap-2"><Film className={`mt-0.5 h-4 w-4 shrink-0 ${selectedId === project.id ? 'text-amber-500' : 'text-slate-400'}`} /><span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{project.client_name}</span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" /></div>
                  <div className="mt-2 pl-6"><Badge color={STATUS_COLORS[project.status]}>{STATUS_LABELS[project.status]}</Badge></div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="min-w-0">
          {!selected ? <EmptyState icon={Play} title="Select a teaser project" subtitle="The preview and clearance panel will appear here" /> : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900/60">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-slate-900 dark:text-white">{selected.client_name}</h2><Badge color={STATUS_COLORS[selected.status]}>{STATUS_LABELS[selected.status]}</Badge></div>{selectedBooking && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{selectedBooking.booking_no} · {selectedBooking.event_function}</p>}</div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={copyShareLink} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"><Clipboard className="h-3.5 w-3.5" /> Copy Link</button>
                    <button onClick={whatsappShare} className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"><Send className="h-3.5 w-3.5" /> WhatsApp</button>
                    <button onClick={() => deleteProject(selected.id)} className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900/60">
                <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Cinematic Preview</h3>
                {selected.video_url ? (
                  <div className="relative overflow-hidden rounded-xl bg-black">
                    <video className="h-auto w-full" controls src={selected.video_url} />
                    {selected.watermark_text && <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-black/60 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">{selected.watermark_text}</div>}
                  </div>
                ) : <EmptyState icon={Play} title="No video uploaded yet" subtitle="Add a video URL in the settings below" />}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="Video URL (MP4 or stream)"><input value={selected.video_url} onChange={(event) => updateProject(selected.id, { video_url: event.target.value })} className={inputClass} placeholder="https://..." /></Field>
                  <Field label="Watermark Text"><input value={selected.watermark_text} onChange={(event) => updateProject(selected.id, { watermark_text: event.target.value })} className={inputClass} placeholder="Bollywood Umang Films" /></Field>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => updateProject(selected.id, { status: 'editing' })} className={`rounded-lg px-3 py-2 text-xs font-medium ${selected.status === 'editing' ? 'bg-amber-500 text-slate-950' : 'border border-slate-200 dark:border-white/10 dark:text-slate-300'}`}>Mark Editing</button>
                  <button onClick={() => updateProject(selected.id, { status: 'complete' })} className={`rounded-lg px-3 py-2 text-xs font-medium ${selected.status === 'complete' ? 'bg-emerald-500 text-white' : 'border border-slate-200 dark:border-white/10 dark:text-slate-300'}`}>Mark Complete</button>
                  <button onClick={() => updateProject(selected.id, { status: 'delivered' })} className={`rounded-lg px-3 py-2 text-xs font-medium ${selected.status === 'delivered' ? 'bg-sky-500 text-white' : 'border border-slate-200 dark:border-white/10 dark:text-slate-300'}`}>Mark Delivered</button>
                </div>
              </div>

              <div className={`rounded-2xl border p-5 ${balance > 0 ? 'border-rose-200 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/5' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/5'}`}>
                <div className="flex items-center gap-2"><Lock className={`h-5 w-5 ${balance > 0 ? 'text-rose-500' : 'text-emerald-500'}`} /><h3 className="font-semibold text-slate-900 dark:text-white">{balance > 0 ? 'Balance Clearance Required' : 'Balance Cleared'}</h3></div>
                {selectedBooking ? (
                  <>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-white p-3 text-center dark:bg-white/5"><p className="text-xs text-slate-500 dark:text-slate-400">Total Package</p><p className="text-sm font-bold text-slate-900 dark:text-white">{formatINR(toNum(selectedBooking.total_amount))}</p></div>
                      <div className="rounded-lg bg-white p-3 text-center dark:bg-white/5"><p className="text-xs text-slate-500 dark:text-slate-400">Advance Paid</p><p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatINR(toNum(selectedBooking.advance_paid))}</p></div>
                      <div className="rounded-lg bg-white p-3 text-center dark:bg-white/5"><p className="text-xs text-slate-500 dark:text-slate-400">Balance Due</p><p className={`text-sm font-bold ${balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatINR(balance)}</p></div>
                    </div>
                    {balance > 0 ? (
                      <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                        {settings?.upi_id && <div className="flex flex-col items-center gap-1"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=upi://pay?pa=${encodeURIComponent(settings.upi_id)}`} alt="UPI QR" className="h-32 w-32 rounded-lg" /><p className="text-xs font-medium text-slate-600 dark:text-slate-300">Scan to Pay {formatINR(balance)}</p><p className="text-[11px] text-slate-400">{settings.upi_id}</p></div>}
                        <div className="flex-1 space-y-2"><div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-white p-3 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-white/5 dark:text-rose-300"><Lock className="h-4 w-4 shrink-0" /> Full HD album and complete wedding video download links will unlock once the remaining balance of {formatINR(balance)} is cleared.</div></div>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white p-3 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-white/5 dark:text-emerald-300"><ShieldCheck className="h-4 w-4 shrink-0" /> Payment cleared. Download links are unlocked below.</div>
                        <Field label="Google Drive / Download URL"><input value={selected.drive_url} onChange={(event) => updateProject(selected.id, { drive_url: event.target.value })} className={inputClass} placeholder="https://drive.google.com/..." /></Field>
                        {selected.drive_url && <a href={selected.drive_url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600"><Download className="h-4 w-4" /> Download Full HD Files</a>}
                      </div>
                    )}
                  </>
                ) : <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No booking linked. Create a teaser from a booking to track balance.</p>}
              </div>
            </div>
          )}
        </section>
      </div>

      {showCreate && <CreateTeaserModal bookings={bookings} onClose={() => setShowCreate(false)} onCreate={createProject} />}
    </div>
  );
}

function CreateTeaserModal({ bookings, onClose, onCreate }: { bookings: Booking[]; onClose: () => void; onCreate: (bookingId: string, clientName: string, videoUrl: string, watermark: string) => Promise<void> }) {
  const [bookingId, setBookingId] = useState('');
  const [clientName, setClientName] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [watermark, setWatermark] = useState('Bollywood Umang Films');

  const handleSelect = (id: string) => {
    setBookingId(id);
    const booking = bookings.find((booking) => booking.id === id);
    if (booking) setClientName(booking.client_name);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900 dark:text-white">New Teaser Project</h2><button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button></div>
        <div className="space-y-4">
          <Field label="Link to Booking (optional)"><select value={bookingId} onChange={(event) => handleSelect(event.target.value)} className={selectClass}><option value="">— None —</option>{bookings.filter((booking) => !booking.deleted_at).map((booking) => <option key={booking.id} value={booking.id}>{booking.client_name} · {booking.booking_no}</option>)}</select></Field>
          <Field label="Client Name"><input value={clientName} onChange={(event) => setClientName(event.target.value)} className={inputClass} placeholder="Client name" /></Field>
          <Field label="Video URL"><input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} className={inputClass} placeholder="https://...mp4" /></Field>
          <Field label="Watermark Text"><input value={watermark} onChange={(event) => setWatermark(event.target.value)} className={inputClass} placeholder="Bollywood Umang Films" /></Field>
          <div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button><button onClick={() => void onCreate(bookingId, clientName, videoUrl, watermark)} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"><Check className="mr-1 inline h-4 w-4" />Create</button></div>
        </div>
      </div>
    </div>
  );
}

export function PublicTeaserPreview() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [project, setProject] = useState<TeaserProject | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const projectId = new URLSearchParams(window.location.search).get('project')?.trim() ?? '';

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    const { data } = await supabase.from('teaser_projects').select('*').eq('id', projectId).maybeSingle();
    if (data) {
      const teaser = data as TeaserProject;
      setProject(teaser);
      if (teaser.booking_id) {
        const { data: bookingData } = await supabase.from('bookings').select('*').eq('id', teaser.booking_id).maybeSingle();
        if (bookingData) setBooking(bookingData as Booking);
      }
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const balance = booking ? toNum(booking.total_amount) - toNum(booking.discount) - toNum(booking.advance_paid) : 0;
  const studioName = settings?.films_title ?? 'Bollywood Umang Films';

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-950"><Sparkles className="h-6 w-6 animate-pulse text-amber-400" /></div>;
  if (!project) return <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-center text-white"><div><Video className="mx-auto mb-4 h-10 w-10 text-amber-400" /><h1 className="text-xl font-bold">Teaser not found</h1><p className="mt-2 text-sm text-slate-400">Please ask the studio to resend your preview link.</p></div></div>;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:py-10">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {settings?.films_logo_url ? <img src={settings.films_logo_url} alt="logo" className="h-10 w-10 rounded-xl object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-slate-950"><Video className="h-5 w-5" /></div>}
            <div><p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-400">{studioName}</p><h1 className="text-xl font-bold">Teaser Preview</h1></div>
          </div>
          <Badge color={STATUS_COLORS[project.status]}>{STATUS_LABELS[project.status]}</Badge>
        </header>

        <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-slate-900 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Preview for</p>
          <h2 className="mt-1 text-2xl font-bold">{project.client_name}</h2>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
          <h3 className="mb-3 font-semibold">Cinematic Teaser</h3>
          {project.video_url ? (
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video className="h-auto w-full" controls src={project.video_url} />
              {project.watermark_text && <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-black/60 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">{project.watermark_text}</div>}
            </div>
          ) : <div className="rounded-xl border border-dashed border-white/10 py-12 text-center"><Play className="mx-auto mb-3 h-7 w-7 text-slate-500" /><p className="text-sm text-slate-300">Video not yet uploaded</p></div>}
        </div>

        {booking && (
          <div className={`rounded-2xl border p-5 ${balance > 0 ? 'border-rose-500/20 bg-rose-500/5' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
            <div className="flex items-center gap-2">
              {balance > 0 ? <Lock className="h-5 w-5 text-rose-400" /> : <Unlock className="h-5 w-5 text-emerald-400" />}
              <h3 className="font-semibold">{balance > 0 ? 'Balance Clearance Required' : 'Balance Cleared — Downloads Unlocked'}</h3>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-white/5 p-3 text-center"><p className="text-xs text-slate-400">Total</p><p className="text-sm font-bold">{formatINR(toNum(booking.total_amount))}</p></div>
              <div className="rounded-lg bg-white/5 p-3 text-center"><p className="text-xs text-slate-400">Advance</p><p className="text-sm font-bold text-emerald-400">{formatINR(toNum(booking.advance_paid))}</p></div>
              <div className="rounded-lg bg-white/5 p-3 text-center"><p className="text-xs text-slate-400">Balance</p><p className={`text-sm font-bold ${balance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{formatINR(balance)}</p></div>
            </div>
            {balance > 0 ? (
              <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                {settings?.upi_id && <div className="flex flex-col items-center gap-1"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=upi://pay?pa=${encodeURIComponent(settings.upi_id)}`} alt="UPI QR" className="h-32 w-32 rounded-lg" /><p className="text-xs font-medium text-slate-300">Scan to Pay {formatINR(balance)}</p><p className="text-[11px] text-slate-500">{settings.upi_id}</p></div>}
                <div className="flex-1"><div className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-white/5 p-3 text-xs text-rose-300"><Lock className="h-4 w-4 shrink-0" /> Full HD album and complete wedding video download links will unlock once the remaining balance of {formatINR(balance)} is cleared.</div></div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-white/5 p-3 text-xs text-emerald-300"><ShieldCheck className="h-4 w-4 shrink-0" /> Payment cleared. Your download links are ready.</div>
                {project.drive_url && <a href={project.drive_url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600"><Download className="h-4 w-4" /> Download Full HD Files</a>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
