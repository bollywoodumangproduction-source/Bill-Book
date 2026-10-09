import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  Clipboard,
  Copy,
  ExternalLink,
  Headphones,
  CheckCircle2,
  Lock,
  Music2,
  Plus,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { MusicCue, MusicCuePriority, MusicMasterCue, MusicProject, MusicProjectMode } from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import { inputClass, selectClass, textareaClass, Field } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { copyToClipboard } from '@/lib/clipboard';

const CATEGORIES = ['Teaser', 'Haldi', 'Entry', 'Jaymala', 'Vidai', 'Reception', 'Wedding/Barat', 'Custom'];
const PRIORITIES: { value: MusicCuePriority; label: string }[] = [
  { value: 'must_use', label: 'Must use' },
  { value: 'preferred', label: 'Preferred' },
  { value: 'reference', label: 'Reference' },
];

const PRIORITY_COLORS: Record<MusicCuePriority, 'rose' | 'amber' | 'slate'> = {
  must_use: 'rose',
  preferred: 'amber',
  reference: 'slate',
};

function now(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function shareUrl(projectId: string): string {
  const url = new URL('/music-selection', window.location.origin);
  url.searchParams.set('project', projectId);
  return url.toString();
}

function isAudioUrl(value: string): boolean {
  return /\.(mp3|wav|m4a|ogg|aac)(\?.*)?$/i.test(value);
}

function safeExternalUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch { return null; }
}

function songEmbedUrl(value: string): string | null {
  const url = safeExternalUrl(value);
  if (!url) return null;
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(url.hostname)) {
    const videoId = url.hostname.includes('youtu.be') ? url.pathname.split('/').filter(Boolean)[0] : url.searchParams.get('v') ?? url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
    return videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}` : null;
  }
  if (url.hostname === 'open.spotify.com' || url.hostname === 'www.open.spotify.com') {
    const match = url.pathname.match(/^\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/);
    return match ? `https://open.spotify.com/embed/${match[1]}/${match[2]}` : null;
  }
  return null;
}

function masterCueShareText(cue: MusicMasterCue): string {
  return [
    `Song: ${cue.song_title}`,
    cue.singer_artist && `Singer/Artist: ${cue.singer_artist}`,
    cue.genre_mood && `Genre/Mood: ${cue.genre_mood}`,
    cue.event_tag && `Event: ${cue.event_tag}`,
    cue.audio_url && `Link: ${cue.audio_url}`,
    cue.cue_timestamps && `Mixing cues: ${cue.cue_timestamps}`,
    cue.special_notes && `Notes: ${cue.special_notes}`,
  ].filter(Boolean).join('\n');
}

export function MusicSelection() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<MusicProject[]>([]);
  const [cues, setCues] = useState<MusicCue[]>([]);
  const [masterCues, setMasterCues] = useState<MusicMasterCue[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const [{ data: projectData }, { data: cueData }, { data: masterCueData }] = await Promise.all([
      supabase.from('music_projects').select('*').order('updated_at', { ascending: false }),
      supabase.from('music_cues').select('*').order('created_at'),
      supabase.from('music_master_cues').select('*').order('created_at'),
    ]);
    const nextProjects = (projectData ?? []) as MusicProject[];
    setProjects(nextProjects);
    setCues((cueData ?? []) as MusicCue[]);
    setMasterCues((masterCueData ?? []) as MusicMasterCue[]);
    setSelectedId((current) => current || nextProjects[0]?.id || '');
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel('admin-music-selection')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'music_projects' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'music_cues' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'music_master_cues' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects.filter((project) => !query || project.client_name.toLowerCase().includes(query));
  }, [projects, search]);

  const selectedProject = projects.find((project) => project.id === selectedId) ?? null;
  const selectedCues = cues.filter((cue) => cue.project_id === selectedId);

  const createProject = async (clientName: string, mode: MusicProjectMode) => {
    const trimmedName = clientName.trim();
    if (!trimmedName) { toast('Enter a party or client name', 'error'); return; }
    const timestamp = now();
    const payload: MusicProject = {
      id: newId(),
      client_name: trimmedName,
      booking_id: null,
      mode,
      status: 'draft',
      locked_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const { error } = await supabase.from('music_projects').insert(payload);
    if (error) { toast('Could not create the music project', 'error'); return; }
    setShowCreate(false);
    await load();
    setSelectedId(payload.id);
    toast('Music selection project created', 'success');
  };

  const addCue = async (cue: Omit<MusicCue, 'id' | 'created_at' | 'updated_at'>) => {
    if (!selectedProject || selectedProject.status === 'locked') return;
    const timestamp = now();
    const payload: MusicCue = { ...cue, id: newId(), created_at: timestamp, updated_at: timestamp };
    const { error } = await supabase.from('music_cues').insert(payload);
    if (error) { toast('Could not save this song choice', 'error'); return; }
    await load();
    toast('Song choice saved', 'success');
  };

  const removeCue = async (cueId: string) => {
    if (!selectedProject || selectedProject.status === 'locked') return;
    await supabase.from('music_cues').delete().eq('id', cueId);
    await load();
    toast('Song choice removed', 'info');
  };

  const toggleLock = async () => {
    if (!selectedProject) return;
    const nextStatus = selectedProject.status === 'locked' ? 'draft' : 'locked';
    const { data, error } = await supabase.from('music_projects').update({
      status: nextStatus,
      locked_at: nextStatus === 'locked' ? now() : null,
      updated_at: now(),
    }).eq('id', selectedProject.id).select('id').maybeSingle();
    if (error || !data) { toast('Could not update project status. Check admin access and try again.', 'error'); return; }
    await load();
    toast(nextStatus === 'locked' ? 'Selection locked' : 'Selection unlocked', 'success');
  };

  const saveMasterCue = async (cue: Omit<MusicMasterCue, 'id' | 'created_at' | 'updated_at'>, existing?: MusicMasterCue) => {
    const timestamp = now();
    const payload = existing
      ? { ...cue, updated_at: timestamp }
      : { ...cue, id: newId(), created_at: timestamp, updated_at: timestamp };
    const query = existing
      ? supabase.from('music_master_cues').update(payload).eq('id', existing.id)
      : supabase.from('music_master_cues').insert(payload);
    const { error } = await query;
    if (error) { toast('Could not save the master song details. Apply the latest Music Selection migration and retry.', 'error'); return false; }
    await load();
    toast(existing ? 'Master song details updated' : 'Master song details saved', 'success');
    return true;
  };

  const copyShare = async () => {
    if (!selectedProject) return;
    const ok = await copyToClipboard(shareUrl(selectedProject.id));
    toast(ok ? 'Client portal link copied' : 'Could not copy the portal link', ok ? 'success' : 'error');
  };

  return (
    <div className="relative flex w-full flex-col space-y-3">
      <div className="sticky top-0 z-30 flex w-full items-center justify-between gap-2 bg-[#0B1121]/90 px-0 py-2 shadow-md backdrop-blur-md sm:px-4 md:gap-0 md:py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:w-auto md:flex-none">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 sm:h-9 sm:w-9"><Music2 className="h-4 w-4 sm:h-5 sm:w-5" /></div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-white sm:text-lg md:text-xl">Music Selection</h1>
            <p className="hidden truncate text-xs text-slate-400 sm:block">Finalize song choices before editing begins</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} aria-label="New Project" title="New Project" className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-2 py-1.5 text-[11px] font-medium text-slate-900 transition hover:bg-amber-400 sm:px-3 sm:text-xs"><Plus className="h-4 w-4" /><span className="hidden sm:inline">New Project</span></button>
      </div>

      <div className="w-full space-y-3 px-0 sm:px-3 md:px-4">
      <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-2">
          <input value={search} onChange={(event) => setSearch(event.target.value)} className={inputClass} placeholder="Search parties..." />
          {loading ? <div className="flex justify-center py-16"><Sparkles className="h-5 w-5 animate-pulse text-amber-500" /></div> : filteredProjects.length === 0 ? <EmptyState icon={Music2} title="No projects yet" subtitle="Create a project to begin" /> : (
            <div className="space-y-2">
              {filteredProjects.map((project) => (
                <button key={project.id} onClick={() => setSelectedId(project.id)} className={`w-full rounded-xl border p-2.5 text-left transition ${selectedId === project.id ? 'border-amber-400 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10' : 'border-slate-200 bg-white hover:border-amber-300 dark:border-white/10 dark:bg-slate-900/50'}`}>
                  <div className="flex items-start gap-2"><Music2 className={`mt-0.5 h-4 w-4 shrink-0 ${selectedId === project.id ? 'text-amber-500' : 'text-slate-400'}`} /><span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{project.client_name}</span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" /></div>
                  <div className="mt-1.5 flex items-center gap-2 pl-6"><Badge color={project.mode === 'b2b' ? 'sky' : 'amber'}>{project.mode === 'b2b' ? 'Lab Order' : 'Client Booking'}</Badge><StatusBadge status={project.status} /></div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="min-w-0">
          {!selectedProject ? <EmptyState icon={Headphones} title="Select a music project" subtitle="Your cue sheet will appear here" /> : <AdminProject project={selectedProject} cues={selectedCues} masterCues={masterCues.filter((cue) => cue.project_id === selectedProject.id)} onSaveMasterCue={saveMasterCue} onAddCue={addCue} onRemoveCue={removeCue} onToggleLock={toggleLock} onCopyShare={copyShare} />}
        </section>
      </div>

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onCreate={createProject} />}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: MusicProject['status'] }) {
  return <Badge color={status === 'locked' ? 'emerald' : status === 'submitted' ? 'sky' : 'slate'}>{status === 'locked' ? 'Locked' : status === 'submitted' ? 'Submitted' : 'Draft'}</Badge>;
}

function AdminProject({ project, cues, masterCues, onSaveMasterCue, onAddCue, onRemoveCue, onToggleLock, onCopyShare }: { project: MusicProject; cues: MusicCue[]; masterCues: MusicMasterCue[]; onSaveMasterCue: (cue: Omit<MusicMasterCue, 'id' | 'created_at' | 'updated_at'>, existing?: MusicMasterCue) => Promise<boolean>; onAddCue: (cue: Omit<MusicCue, 'id' | 'created_at' | 'updated_at'>) => Promise<void>; onRemoveCue: (id: string) => Promise<void>; onToggleLock: () => Promise<void>; onCopyShare: () => Promise<void> }) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [showMasterForm, setShowMasterForm] = useState(false);
  const [editingMasterCue, setEditingMasterCue] = useState<MusicMasterCue | undefined>();
  const [lockBusy, setLockBusy] = useState(false);
  const locked = project.status === 'locked';
  const exportCueSheet = async () => {
    if (cues.length === 0) { toast('No cues to export. Add song choices first.', 'error'); return; }
    const lines = cues.map((cue, index) => {
      const parts = [
        `${index + 1}. Event: ${cue.category}`,
        `   Song: ${cue.track_title || 'Untitled'}`,
        `   Link: ${cue.track_url || '—'}`,
        `   Timing: ${cue.start_time || '—'}`,
        `   Priority: ${cue.priority.replace('_', ' ')}`,
      ];
      if (cue.usage_notes) parts.push(`   Notes: ${cue.usage_notes}`);
      return parts.join('\n');
    });
    const header = `MUSIC CUE SHEET\nClient: ${project.client_name}\nProject: ${project.mode === 'b2b' ? 'Lab / Photographer Partner' : 'Client / Direct Party'}\nGenerated: ${new Date().toLocaleString('en-IN')}\nTotal Cues: ${cues.length}\n${'='.repeat(60)}\n\n`;
    const content = header + lines.join('\n\n') + '\n';
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Studio_CueSheet_${project.client_name.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('Cue sheet downloaded as text file', 'success');
  };
  const whatsappText = `Music Selection Portal: ${shareUrl(project.id)}\n\nKripya video mixing shuru hone se pehle apni pasand ke gaane finalize karein\n\nProject managed & Bollywood Umang Films`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 dark:border-white/10 dark:bg-slate-900/60">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-slate-900 dark:text-white">{project.client_name}</h2><StatusBadge status={project.status} /></div><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{project.mode === 'b2b' ? 'Song cues for lab / photographer partner work' : 'Client event-wise song selection'}</p></div>
          <div className="flex flex-wrap items-center gap-2"><button onClick={onCopyShare} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"><Clipboard className="h-3.5 w-3.5" /> Copy Link</button><a href={whatsappHref} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"><Send className="h-3.5 w-3.5" /> WhatsApp</a><button onClick={exportCueSheet} className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400"><ExternalLink className="h-3.5 w-3.5" /> Export Cue Sheet</button><div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-white/10"><span className={`text-xs font-semibold ${locked ? 'text-sky-500 dark:text-sky-300' : 'text-slate-500 dark:text-slate-400'}`}>{locked ? 'Locked' : 'Draft / Unlocked'}</span><button type="button" role="switch" aria-checked={locked} aria-label={locked ? 'Unlock song selection' : 'Lock song selection'} disabled={lockBusy} onClick={async () => { setLockBusy(true); try { await onToggleLock(); } finally { setLockBusy(false); } }} className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-sky-400/60 disabled:cursor-wait disabled:opacity-60 ${locked ? 'bg-sky-500' : 'bg-slate-400 dark:bg-slate-700'}`}><span className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow transition-transform duration-300 ${locked ? 'translate-x-6' : 'translate-x-1'}`}>{locked ? <CheckCircle2 className="h-3.5 w-3.5 text-sky-600" /> : <Unlock className="h-3.5 w-3.5 text-slate-500" />}</span></button></div></div>
        </div>
        {locked && <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"><ShieldCheck className="h-4 w-4" /> Finalized by the client. Unlock only if the studio approves a revision.</div>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 dark:border-white/10 dark:bg-slate-900/60"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-slate-900 dark:text-white">Selected Songs</h3><p className="text-xs text-slate-500 dark:text-slate-400">{cues.length} cue{cues.length === 1 ? '' : 's'} in the working sheet</p></div>{!locked && <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"><Plus className="h-3.5 w-3.5" /> Add Song</button>}</div>{cues.length === 0 ? <EmptyState icon={Headphones} title="No song choices yet" subtitle="Add a cue or send the portal link to the client" /> : <div className="space-y-2">{cues.map((cue) => <CueCard key={cue.id} cue={cue} locked={locked} onRemove={() => onRemoveCue(cue.id)} />)}</div>}</div>
      <section className="rounded-2xl border border-sky-400/20 bg-slate-950/80 p-3 sm:p-4"><div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">Song Details &amp; Master Cue Card</h3><p className="mt-1 text-xs text-slate-400">Studio reference and editing notes, stored separately from client selections.</p></div><button onClick={() => { setEditingMasterCue(undefined); setShowMasterForm(true); }} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-400"><Plus className="h-3.5 w-3.5" /> Add Reference</button></div>{masterCues.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-400">No master references saved for this project yet.</div> : <div className="grid gap-3 xl:grid-cols-2">{masterCues.map((cue) => <MasterCueCard key={cue.id} cue={cue} onEdit={() => { setEditingMasterCue(cue); setShowMasterForm(true); }} />)}</div>}</section>
      {showAdd && <AddCueModal projectId={project.id} onClose={() => setShowAdd(false)} onAdd={async (cue) => { await onAddCue(cue); setShowAdd(false); }} />}
      {showMasterForm && <MasterCueModal projectId={project.id} existing={editingMasterCue} onClose={() => setShowMasterForm(false)} onSave={async (cue) => { const saved = await onSaveMasterCue(cue, editingMasterCue); if (saved) setShowMasterForm(false); }} />}
    </div>
  );
}

function CueCard({ cue, locked, onRemove }: { cue: MusicCue; locked: boolean; onRemove: () => void }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"><div className="flex items-start gap-2"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400"><Music2 className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900 dark:text-white">{cue.track_title || 'Untitled song'}</p><Badge color={PRIORITY_COLORS[cue.priority]}>{cue.priority.replace('_', ' ')}</Badge></div><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{cue.category}{cue.start_time ? ` · starts at ${cue.start_time}` : ''}</p>{cue.usage_notes && <p className="mt-1.5 text-sm leading-5 text-slate-700 dark:text-slate-300">{cue.usage_notes}</p>}{cue.track_url && <a href={cue.track_url} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex max-w-full items-center gap-1 truncate text-xs text-sky-600 hover:text-sky-500 dark:text-sky-400"><ExternalLink className="h-3 w-3 shrink-0" /> Open reference link</a>}{cue.track_url && isAudioUrl(cue.track_url) && <audio className="mt-2 h-8 w-full max-w-md" controls src={cue.track_url} />}</div>{!locked && <button onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10" title="Remove song"><X className="h-4 w-4" /></button>}</div></div>;
}

function MasterCueCard({ cue, onEdit }: { cue: MusicMasterCue; onEdit: () => void }) {
  const { toast } = useToast();
  const safeUrl = safeExternalUrl(cue.audio_url);
  const embedUrl = songEmbedUrl(cue.audio_url);
  const copyLink = async () => {
    const ok = await copyToClipboard(cue.audio_url);
    toast(ok ? 'Audio link copied' : 'Could not copy the audio link', ok ? 'success' : 'error');
  };
  const shareCard = async () => {
    const text = masterCueShareText(cue);
    try {
      if (navigator.share) await navigator.share({ title: cue.song_title, text, url: safeUrl?.toString() });
      else {
        const ok = await copyToClipboard(text);
        toast(ok ? 'Song details copied for sharing' : 'Could not copy song details', ok ? 'success' : 'error');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      const ok = await copyToClipboard(text);
      toast(ok ? 'Song details copied for sharing' : 'Could not share song details', ok ? 'success' : 'error');
    }
  };
  return <article className="rounded-xl border border-white/10 bg-white/[0.04] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate font-semibold text-white">{cue.song_title || 'Untitled song reference'}</h4><p className="mt-1 text-sm text-slate-300">{cue.singer_artist || 'Artist not specified'}{cue.genre_mood ? ` · ${cue.genre_mood}` : ''}</p></div><div className="flex shrink-0 gap-1.5"><button onClick={() => void shareCard()} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10"><Share2 className="h-3.5 w-3.5" /> Share</button><button onClick={onEdit} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10">Edit</button></div></div><div className="mt-3 flex flex-wrap gap-2">{cue.event_tag && <Badge color="sky">{cue.event_tag}</Badge>}{cue.genre_mood && <Badge color="slate">{cue.genre_mood}</Badge>}</div>{cue.audio_url && <div className="mt-3 space-y-2">{safeUrl ? <div className="flex items-center gap-2"><a href={safeUrl.toString()} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-xs text-sky-300 hover:text-sky-200"><ExternalLink className="mr-1 inline h-3 w-3" />{cue.audio_url}</a><button type="button" onClick={() => void copyLink()} aria-label="Copy audio link" className="rounded-md p-1.5 text-slate-300 hover:bg-white/10"><Copy className="h-3.5 w-3.5" /></button></div> : <p className="break-all text-xs text-rose-300">This link is invalid. Edit the card and enter an http(s) link.</p>}{safeUrl && isAudioUrl(safeUrl.toString()) && <audio controls preload="none" src={safeUrl.toString()} className="h-8 w-full" />}{safeUrl && embedUrl && <iframe title={`Preview ${cue.song_title}`} src={embedUrl} className="mt-2 aspect-video w-full rounded-lg border-0" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" />}{safeUrl && !isAudioUrl(safeUrl.toString()) && !embedUrl && <p className="text-[11px] text-slate-500">This service does not support an embedded player here. Open the link to listen, or paste a YouTube, Spotify, or direct audio link.</p>}</div>}{cue.cue_timestamps && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-amber-200"><span className="font-semibold text-amber-300">Mixing cues: </span>{cue.cue_timestamps}</p>}{cue.special_notes && <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-300">{cue.special_notes}</p>}</article>;
}

function MasterCueModal({ projectId, existing, onClose, onSave }: { projectId: string; existing?: MusicMasterCue; onClose: () => void; onSave: (cue: Omit<MusicMasterCue, 'id' | 'created_at' | 'updated_at'>) => Promise<void> }) {
  const [songTitle, setSongTitle] = useState(existing?.song_title ?? '');
  const [singerArtist, setSingerArtist] = useState(existing?.singer_artist ?? '');
  const [genreMood, setGenreMood] = useState(existing?.genre_mood ?? '');
  const [eventTag, setEventTag] = useState(existing?.event_tag ?? '');
  const [audioUrl, setAudioUrl] = useState(existing?.audio_url ?? '');
  const [cueTimestamps, setCueTimestamps] = useState(existing?.cue_timestamps ?? '');
  const [specialNotes, setSpecialNotes] = useState(existing?.special_notes ?? '');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!songTitle.trim()) return;
    setSaving(true);
    try { await onSave({ project_id: projectId, song_title: songTitle.trim(), singer_artist: singerArtist.trim(), genre_mood: genreMood.trim(), event_tag: eventTag.trim(), audio_url: audioUrl.trim(), cue_timestamps: cueTimestamps.trim(), special_notes: specialNotes.trim() }); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white">{existing ? 'Edit Master Song Details' : 'Add Master Song Details'}</h2><p className="text-xs text-slate-400">Saved separately; locking or changing client selections will not replace this reference.</p></div><button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Song Title"><input autoFocus value={songTitle} onChange={(e) => setSongTitle(e.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white`} required /></Field><Field label="Singer / Artist"><input value={singerArtist} onChange={(e) => setSingerArtist(e.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white`} /></Field><Field label="Genre / Mood"><input value={genreMood} onChange={(e) => setGenreMood(e.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white`} placeholder="Romantic, energetic..." /></Field><Field label="Event / Tag"><select value={eventTag} onChange={(e) => setEventTag(e.target.value)} className={`${selectClass} border-white/10 bg-slate-800 text-white`}><option value="">Select event</option>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></Field><div className="sm:col-span-2"><Field label="Audio Link / Preview"><input value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white`} placeholder="https://..." type="url" /></Field></div><div className="sm:col-span-2"><Field label="Special Editing Notes / Cue Timestamps"><textarea value={cueTimestamps} onChange={(e) => setCueTimestamps(e.target.value)} className={`${textareaClass} border-white/10 bg-slate-800 text-white`} placeholder="0:35 intro; 1:12 switch to chorus; 2:08 fade out" rows={3} /></Field></div><div className="sm:col-span-2"><Field label="Additional Editing Notes"><textarea value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} className={`${textareaClass} border-white/10 bg-slate-800 text-white`} placeholder="Mixing, transition, or edit instructions..." rows={3} /></Field></div></div><div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">Cancel</button><button disabled={!songTitle.trim() || saving} onClick={() => void submit()} className="rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-50">{saving ? 'Saving…' : existing ? 'Save Changes' : 'Save Reference'}</button></div></div></div>;
}

function CreateProjectModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, mode: MusicProjectMode) => Promise<void> }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<MusicProjectMode>('b2c');
  return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold text-white">New Music Project</h2><button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button></div><div className="space-y-4"><Field label="Party / Client Name"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white`} placeholder="e.g. Rajesh Kumar Singh" /></Field><Field label="Portal Mode"><select value={mode} onChange={(event) => setMode(event.target.value as MusicProjectMode)} className={`${selectClass} border-white/10 bg-slate-800 text-white`}><option value="b2c">Client / Direct Party</option><option value="b2b">Lab / Photographer Partner</option></select></Field><div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">Cancel</button><button onClick={() => void onCreate(name, mode)} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400">Create Project</button></div></div></div></div>;
}

function AddCueModal({ projectId, onClose, onAdd }: { projectId: string; onClose: () => void; onAdd: (cue: Omit<MusicCue, 'id' | 'created_at' | 'updated_at'>) => Promise<void> }) {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [trackTitle, setTrackTitle] = useState('');
  const [trackUrl, setTrackUrl] = useState('');
  const [startTime, setStartTime] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<MusicCuePriority>('preferred');
  return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900 dark:text-white">Add Song Choice</h2><button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button></div><div className="space-y-4"><div className="grid grid-cols-2 gap-3"><Field label="Event / Use"><select value={category} onChange={(event) => setCategory(event.target.value)} className={selectClass}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Priority"><select value={priority} onChange={(event) => setPriority(event.target.value as MusicCuePriority)} className={selectClass}>{PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field></div><Field label="Song Title"><input value={trackTitle} onChange={(event) => setTrackTitle(event.target.value)} className={inputClass} placeholder="Song name or artist" /></Field><Field label="YouTube / Spotify / Audio Link"><input value={trackUrl} onChange={(event) => setTrackUrl(event.target.value)} className={inputClass} placeholder="Paste a reference or preview link" /></Field><Field label="Timestamp / Timecode"><input value={startTime} onChange={(event) => setStartTime(event.target.value)} className={inputClass} placeholder="01:15 or 00:01:15:00" /></Field><Field label="Usage Notes"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className={textareaClass} placeholder="e.g. 01:15 se Jaymala flower drop pe use karein" /></Field><div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button><button onClick={() => void onAdd({ project_id: projectId, category, track_title: trackTitle.trim(), track_url: trackUrl.trim(), start_time: startTime.trim(), usage_notes: notes.trim(), priority })} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"><Check className="mr-1 inline h-4 w-4" /> Save Song</button></div></div></div></div>;
}

export function PublicMusicSelection() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [project, setProject] = useState<MusicProject | null>(null);
  const [cues, setCues] = useState<MusicCue[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const projectId = new URLSearchParams(window.location.search).get('project')?.trim() ?? '';

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    const { data, error } = await supabase.functions.invoke('public-share', { body: { action: 'music-read', id: projectId } });
    const match = !error ? (data?.project as MusicProject | undefined) : undefined;
    setProject(match ?? null);
    setCues(match ? (data?.cues as MusicCue[] ?? []) : []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  // Public share links intentionally read through the Edge Function (not direct table access).
  // Refreshing this protected endpoint keeps portal lock state in sync without widening RLS.
  useEffect(() => {
    if (!projectId) return;
    const timer = window.setInterval(() => { void load(); }, 5000);
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refreshWhenVisible); };
  }, [load, projectId]);

  const addCue = async (cue: Omit<MusicCue, 'id' | 'created_at' | 'updated_at'>) => {
    if (!project || project.status === 'locked') return;
    const { error } = await supabase.functions.invoke('public-share', { body: { action: 'music-add-cue', projectId: project.id, cue } });
    if (error) { toast('Could not save this song choice', 'error'); return; }
    setShowAdd(false);
    await load();
    toast('Your song choice was added', 'success');
  };

  const submit = async () => {
    if (!project || cues.length === 0) { toast('Add at least one song before submitting', 'error'); return; }
    const { error } = await supabase.functions.invoke('public-share', { body: { action: 'music-submit', projectId: project.id } });
    if (error) { toast('Could not submit music selection', 'error'); return; }
    setSubmitted(true);
    await load();
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-950"><Sparkles className="h-6 w-6 animate-pulse text-amber-400" /></div>;
  if (!project) return <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-center text-white"><div><Music2 className="mx-auto mb-4 h-10 w-10 text-amber-400" /><h1 className="text-xl font-bold">Music portal not found</h1><p className="mt-2 text-sm text-slate-400">Please ask the studio to resend your selection link.</p></div></div>;
  const locked = project.status === 'locked';
  const studioName = settings?.films_title ?? 'Bollywood Umang Films';

  return <div className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:py-10"><div className="mx-auto max-w-3xl space-y-5"><header className="flex items-center justify-between"><div className="flex items-center gap-3">{settings?.films_logo_url ? <img src={settings.films_logo_url} alt="Studio logo" className="h-10 w-10 rounded-xl object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-slate-950"><Music2 className="h-5 w-5" /></div>}<div><p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-400">{studioName}</p><h1 className="text-xl font-bold">Music Selection Portal</h1></div></div><Badge color={locked ? 'emerald' : 'amber'}>{locked ? 'Finalized' : 'Open for selection'}</Badge></header><div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-slate-900 p-5"><p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Project for</p><h2 className="mt-1 text-2xl font-bold">{project.client_name}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Please choose the songs and share exact timestamps or instructions before video mixing begins. This helps the editing team avoid re-editing later.</p></div>{locked && <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300"><ShieldCheck className="h-5 w-5 shrink-0" /> Your selection is finalized. Contact the studio if you need an approved change.</div>}<div className="rounded-2xl border border-white/10 bg-slate-900 p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Your song choices</h2><p className="text-xs text-slate-400">{cues.length} selected cue{cues.length === 1 ? '' : 's'}</p></div>{!locked && <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"><Plus className="h-3.5 w-3.5" /> Add Song</button>}</div>{cues.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 py-12 text-center"><Headphones className="mx-auto mb-3 h-7 w-7 text-slate-500" /><p className="text-sm text-slate-300">No songs selected yet</p><p className="mt-1 text-xs text-slate-500">Add your first choice for the editing team.</p></div> : <div className="space-y-3">{cues.map((cue) => <CueCard key={cue.id} cue={cue} locked={locked} onRemove={() => undefined} />)}</div>}</div>{!locked && <button onClick={() => void submit()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/10 transition hover:bg-amber-400"><Lock className="h-4 w-4" /> Final Submit &amp; Lock</button>}{submitted && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-center text-sm text-emerald-300">Thank you. Your music selection has been submitted to the studio.</div>}<p className="flex items-center justify-center gap-1.5 text-xs text-slate-500"><Users className="h-3.5 w-3.5" /> Project managed by {studioName}</p></div>{showAdd && <AddCueModal projectId={project.id} onClose={() => setShowAdd(false)} onAdd={addCue} />}</div>;
}
