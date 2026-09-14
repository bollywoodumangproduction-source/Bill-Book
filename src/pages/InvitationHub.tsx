import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  ChevronRight,
  Clipboard,
  Download,
  ExternalLink,
  FileText,
  Heart,
  Mail,
  MapPin,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Booking, InvitationProject } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import { inputClass, selectClass, Field } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { copyToClipboard } from '@/lib/clipboard';

function nowISO(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function invitationUrl(project: InvitationProject): string {
  return `/invitation-hub?project=${project.id}`;
}

export function InvitationHub() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<InvitationProject[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    const [{ data: inviteData }, { data: bookingData }] = await Promise.all([
      supabase.from('invitation_projects').select('*').order('updated_at', { ascending: false }),
      supabase.from('bookings').select('*').order('shoot_date'),
    ]);
    const nextProjects = (inviteData ?? []) as InvitationProject[];
    setProjects(nextProjects);
    setBookings((bookingData ?? []) as Booking[]);
    setSelectedId((current) => current || nextProjects[0]?.id || '');
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects.filter((project) => !query || project.client_name.toLowerCase().includes(query) || project.groom_name.toLowerCase().includes(query) || project.bride_name.toLowerCase().includes(query));
  }, [projects, search]);

  const selected = projects.find((project) => project.id === selectedId) ?? null;

  const createProject = async (bookingId: string, clientName: string, groomName: string, brideName: string, eventDate: string, venueUrl: string) => {
    const timestamp = nowISO();
    const payload: InvitationProject = {
      id: newId(),
      booking_id: bookingId,
      client_name: clientName.trim(),
      video_url: '',
      pdf_url: '',
      groom_name: groomName.trim(),
      bride_name: brideName.trim(),
      event_date: eventDate,
      venue_url: venueUrl.trim(),
      created_at: timestamp,
      updated_at: timestamp,
    };
    const { error } = await supabase.from('invitation_projects').insert(payload);
    if (error) { toast('Could not create invitation project', 'error'); return; }
    setShowCreate(false);
    await load();
    setSelectedId(payload.id);
    toast('Invitation project created', 'success');
  };

  const updateProject = async (id: string, patch: Partial<InvitationProject>) => {
    await supabase.from('invitation_projects').update({ ...patch, updated_at: nowISO() }).eq('id', id);
    await load();
  };

  const deleteProject = async (id: string) => {
    await supabase.from('invitation_projects').delete().eq('id', id);
    toast('Invitation project removed', 'info');
    await load();
  };

  const copyShareLink = async () => {
    if (!selected) return;
    const ok = await copyToClipboard(`${window.location.origin}${invitationUrl(selected)}`);
    toast(ok ? 'Invitation link copied' : 'Could not copy link', ok ? 'success' : 'error');
  };

  const whatsappForward = () => {
    if (!selected) return;
    const parts = [
      `${selected.groom_name || selected.client_name} weds ${selected.bride_name}`.trim(),
      selected.event_date ? `Date: ${formatDate(selected.event_date)}` : '',
      selected.video_url ? `Video Invite: ${selected.video_url}` : '',
      selected.pdf_url ? `PDF Card: ${selected.pdf_url}` : '',
      selected.venue_url ? `Venue: ${selected.venue_url}` : '',
      '\nBollywood Umang Films',
    ].filter(Boolean);
    window.open(`https://wa.me/?text=${encodeURIComponent(parts.join('\n'))}`, '_blank');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400"><Mail className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Invitation Hub</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Digital wedding invitations — video &amp; interactive PDF</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"><Plus className="h-4 w-4" /> New Invitation</button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <input value={search} onChange={(event) => setSearch(event.target.value)} className={inputClass} placeholder="Search by name..." />
          {loading ? <div className="flex justify-center py-16"><Sparkles className="h-5 w-5 animate-pulse text-amber-500" /></div> : filtered.length === 0 ? <EmptyState icon={Mail} title="No invitations yet" subtitle="Create one to begin" /> : (
            <div className="space-y-2">
              {filtered.map((project) => (
                <button key={project.id} onClick={() => setSelectedId(project.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === project.id ? 'border-amber-400 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10' : 'border-slate-200 bg-white hover:border-amber-300 dark:border-white/10 dark:bg-slate-900/50'}`}>
                  <div className="flex items-start gap-2"><Heart className={`mt-0.5 h-4 w-4 shrink-0 ${selectedId === project.id ? 'text-amber-500' : 'text-slate-400'}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{project.groom_name || project.client_name}{project.bride_name && ` & ${project.bride_name}`}</p>{project.event_date && <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(project.event_date)}</p>}</div><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" /></div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="min-w-0">
          {!selected ? <EmptyState icon={Mail} title="Select an invitation project" subtitle="Upload and preview tools will appear here" /> : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900/60">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-slate-900 dark:text-white">{selected.groom_name || selected.client_name}{selected.bride_name && ` & ${selected.bride_name}`}</h2></div>{selected.event_date && <p className="mt-1 flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400"><Calendar className="h-3.5 w-3.5" /> {formatDate(selected.event_date)}</p>}</div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={copyShareLink} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"><Clipboard className="h-3.5 w-3.5" /> Copy Link</button>
                    <button onClick={whatsappForward} className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"><Send className="h-3.5 w-3.5" /> Forward via WhatsApp</button>
                    <button onClick={() => deleteProject(selected.id)} className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900/60">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><Video className="h-4 w-4 text-amber-500" /> Video Invite (MP4)</h3>
                {selected.video_url ? (
                  <div className="overflow-hidden rounded-xl bg-black"><video className="h-auto w-full" controls src={selected.video_url} /></div>
                ) : <EmptyState icon={Video} title="No video uploaded" subtitle="Add a URL below" />}
                <div className="mt-3"><Field label="Video URL"><input value={selected.video_url} onChange={(event) => updateProject(selected.id, { video_url: event.target.value })} className={inputClass} placeholder="https://...mp4" /></Field></div>
                {selected.video_url && <a href={selected.video_url} target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"><Download className="h-4 w-4" /> Download Video Invite</a>}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900/60">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><FileText className="h-4 w-4 text-amber-500" /> Interactive PDF Card</h3>
                {selected.pdf_url ? (
                  <div className="space-y-3">
                    <iframe src={selected.pdf_url} className="h-64 w-full rounded-xl border border-slate-200 dark:border-white/10" title="PDF Preview" />
                    <a href={selected.pdf_url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-600"><Download className="h-4 w-4" /> Download PDF Card</a>
                  </div>
                ) : <EmptyState icon={FileText} title="No PDF uploaded" subtitle="Add a URL below" />}
                <div className="mt-3"><Field label="PDF URL"><input value={selected.pdf_url} onChange={(event) => updateProject(selected.id, { pdf_url: event.target.value })} className={inputClass} placeholder="https://...pdf" /></Field></div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900/60">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><Users className="h-4 w-4 text-amber-500" /> Event Details</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Groom Name"><input value={selected.groom_name} onChange={(event) => updateProject(selected.id, { groom_name: event.target.value })} className={inputClass} placeholder="Groom name" /></Field>
                  <Field label="Bride Name"><input value={selected.bride_name} onChange={(event) => updateProject(selected.id, { bride_name: event.target.value })} className={inputClass} placeholder="Bride name" /></Field>
                  <Field label="Event Date"><input type="date" value={selected.event_date} onChange={(event) => updateProject(selected.id, { event_date: event.target.value })} className={inputClass} /></Field>
                  <Field label="Venue Google Maps URL"><input value={selected.venue_url} onChange={(event) => updateProject(selected.id, { venue_url: event.target.value })} className={inputClass} placeholder="https://maps.app.goo.gl/..." /></Field>
                </div>
                {selected.venue_url && <a href={selected.venue_url} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1 text-xs text-sky-600 hover:text-sky-500 dark:text-sky-400"><MapPin className="h-3.5 w-3.5" /> View Venue on Google Maps <ExternalLink className="h-3 w-3" /></a>}
              </div>
            </div>
          )}
        </section>
      </div>

      {showCreate && <CreateInvitationModal bookings={bookings} onClose={() => setShowCreate(false)} onCreate={createProject} />}
    </div>
  );
}

function CreateInvitationModal({ bookings, onClose, onCreate }: { bookings: Booking[]; onClose: () => void; onCreate: (bookingId: string, clientName: string, groomName: string, brideName: string, eventDate: string, venueUrl: string) => Promise<void> }) {
  const [bookingId, setBookingId] = useState('');
  const [clientName, setClientName] = useState('');
  const [groomName, setGroomName] = useState('');
  const [brideName, setBrideName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [venueUrl, setVenueUrl] = useState('');

  const handleSelect = (id: string) => {
    setBookingId(id);
    const booking = bookings.find((booking) => booking.id === id);
    if (booking) {
      setClientName(booking.client_name);
      setGroomName(booking.client_name);
      setBrideName(booking.bride_name ?? '');
      setEventDate(booking.shoot_date);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900 dark:text-white">New Invitation</h2><button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button></div>
        <div className="space-y-4">
          <Field label="Link to Booking (optional)"><select value={bookingId} onChange={(event) => handleSelect(event.target.value)} className={selectClass}><option value="">— None —</option>{bookings.filter((booking) => !booking.deleted_at).map((booking) => <option key={booking.id} value={booking.id}>{booking.client_name} · {booking.booking_no}</option>)}</select></Field>
          <Field label="Client Name"><input value={clientName} onChange={(event) => setClientName(event.target.value)} className={inputClass} placeholder="Client name" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Groom Name"><input value={groomName} onChange={(event) => setGroomName(event.target.value)} className={inputClass} placeholder="Groom" /></Field>
            <Field label="Bride Name"><input value={brideName} onChange={(event) => setBrideName(event.target.value)} className={inputClass} placeholder="Bride" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Event Date"><input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} className={inputClass} /></Field>
            <Field label="Venue URL"><input value={venueUrl} onChange={(event) => setVenueUrl(event.target.value)} className={inputClass} placeholder="Google Maps link" /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button><button onClick={() => void onCreate(bookingId, clientName, groomName, brideName, eventDate, venueUrl)} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"><Check className="mr-1 inline h-4 w-4" />Create</button></div>
        </div>
      </div>
    </div>
  );
}

export function PublicInvitationHub() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [project, setProject] = useState<InvitationProject | null>(null);
  const [loading, setLoading] = useState(true);
  const projectId = new URLSearchParams(window.location.search).get('project')?.trim() ?? '';

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    const { data } = await supabase.from('invitation_projects').select('*').eq('id', projectId).maybeSingle();
    if (data) setProject(data as InvitationProject);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const studioName = settings?.films_title ?? 'Bollywood Umang Films';

  const forwardWhatsApp = () => {
    if (!project) return;
    const parts = [
      `${project.groom_name || project.client_name} weds ${project.bride_name}`.trim(),
      project.event_date ? `Date: ${formatDate(project.event_date)}` : '',
      project.video_url ? `Video Invite: ${project.video_url}` : '',
      project.pdf_url ? `PDF Card: ${project.pdf_url}` : '',
      project.venue_url ? `Venue: ${project.venue_url}` : '',
      '\nBollywood Umang Films',
    ].filter(Boolean);
    window.open(`https://wa.me/?text=${encodeURIComponent(parts.join('\n'))}`, '_blank');
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-950"><Sparkles className="h-6 w-6 animate-pulse text-amber-400" /></div>;
  if (!project) return <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-center text-white"><div><Mail className="mx-auto mb-4 h-10 w-10 text-amber-400" /><h1 className="text-xl font-bold">Invitation not found</h1><p className="mt-2 text-sm text-slate-400">Please ask the studio to resend your invitation link.</p></div></div>;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:py-10">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {settings?.films_logo_url ? <img src={settings.films_logo_url} alt="logo" className="h-10 w-10 rounded-xl object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-slate-950"><Mail className="h-5 w-5" /></div>}
            <div><p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-400">{studioName}</p><h1 className="text-xl font-bold">Wedding Invitation</h1></div>
          </div>
        </header>

        <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-slate-900 p-5 text-center">
          <Heart className="mx-auto mb-2 h-6 w-6 text-amber-400" />
          <h2 className="text-2xl font-bold">{project.groom_name || project.client_name}{project.bride_name && ` & ${project.bride_name}`}</h2>
          {project.event_date && <p className="mt-1 flex items-center justify-center gap-1 text-sm text-slate-300"><Calendar className="h-3.5 w-3.5" /> {formatDate(project.event_date)}</p>}
        </div>

        {project.video_url && (
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold"><Video className="h-4 w-4 text-amber-400" /> Video Invite</h3>
            <div className="overflow-hidden rounded-xl bg-black"><video className="h-auto w-full" controls src={project.video_url} /></div>
            <a href={project.video_url} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"><Download className="h-4 w-4" /> Download Video</a>
          </div>
        )}

        {project.pdf_url && (
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-amber-400" /> Interactive PDF Card</h3>
            <iframe src={project.pdf_url} className="h-64 w-full rounded-xl border border-white/10" title="PDF Preview" />
            <a href={project.pdf_url} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-600"><Download className="h-4 w-4" /> Download PDF</a>
          </div>
        )}

        {project.venue_url && (
          <a href={project.venue_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 text-sm text-sky-300 hover:bg-sky-500/10"><MapPin className="h-4 w-4" /> View Venue on Google Maps <ExternalLink className="ml-auto h-3 w-3" /></a>
        )}

        <button onClick={forwardWhatsApp} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/10 transition hover:bg-emerald-600"><Send className="h-4 w-4" /> Forward to Guests via WhatsApp</button>
      </div>
    </div>
  );
}
