import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  Clipboard,
  ExternalLink,
  Headphones,
  Lock,
  Music2,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { MusicCue, MusicCuePriority, MusicProject, MusicProjectMode } from '@/lib/types';
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

function shareUrl(clientName: string): string {
  const url = new URL('/music-selection', window.location.origin);
  url.searchParams.set('party', clientName);
  return url.toString();
}

function isAudioUrl(value: string): boolean {
  return /\.(mp3|wav|m4a|ogg|aac)(\?.*)?$/i.test(value);
}

export function MusicSelection() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<MusicProject[]>([]);
  const [cues, setCues] = useState<MusicCue[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const [{ data: projectData }, { data: cueData }] = await Promise.all([
      supabase.from('music_projects').select('*').order('updated_at', { ascending: false }),
      supabase.from('music_cues').select('*').order('created_at'),
    ]);
    const nextProjects = (projectData ?? []) as MusicProject[];
    setProjects(nextProjects);
    setCues((cueData ?? []) as MusicCue[]);
    setSelectedId((current) => current || nextProjects[0]?.id || '');
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

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
    const { error } = await supabase.from('music_projects').update({
      status: nextStatus,
      locked_at: nextStatus === 'locked' ? now() : null,
      updated_at: now(),
    }).eq('id', selectedProject.id);
    if (error) { toast('Could not update project status', 'error'); return; }
    await load();
    toast(nextStatus === 'locked' ? 'Selection locked' : 'Selection unlocked', 'success');
  };

  const copyShare = async () => {
    if (!selectedProject) return;
    const ok = await copyToClipboard(shareUrl(selectedProject.client_name));
    toast(ok ? 'Client portal link copied' : 'Could not copy the portal link', ok ? 'success' : 'error');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400"><Music2 className="h-5 w-5" /></div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Music Selection</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Finalize song choices before editing begins</p>
            </div>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"><Plus className="h-4 w-4" /> New Project</button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <input value={search} onChange={(event) => setSearch(event.target.value)} className={inputClass} placeholder="Search parties..." />
          {loading ? <div className="flex justify-center py-16"><Sparkles className="h-5 w-5 animate-pulse text-amber-500" /></div> : filteredProjects.length === 0 ? <EmptyState icon={Music2} title="No projects yet" subtitle="Create a project to begin" /> : (
            <div className="space-y-2">
              {filteredProjects.map((project) => (
                <button key={project.id} onClick={() => setSelectedId(project.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === project.id ? 'border-amber-400 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10' : 'border-slate-200 bg-white hover:border-amber-300 dark:border-white/10 dark:bg-slate-900/50'}`}>
                  <div className="flex items-start gap-2"><Music2 className={`mt-0.5 h-4 w-4 shrink-0 ${selectedId === project.id ? 'text-amber-500' : 'text-slate-400'}`} /><span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{project.client_name}</span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" /></div>
                  <div className="mt-2 flex items-center gap-2 pl-6"><Badge color={project.mode === 'b2b' ? 'sky' : 'amber'}>{project.mode === 'b2b' ? 'B2B Lab' : 'B2C Party'}</Badge><StatusBadge status={project.status} /></div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="min-w-0">
          {!selectedProject ? <EmptyState icon={Headphones} title="Select a music project" subtitle="Your cue sheet will appear here" /> : <AdminProject project={selectedProject} cues={selectedCues} onAddCue={addCue} onRemoveCue={removeCue} onToggleLock={toggleLock} onCopyShare={copyShare} />}
        </section>
      </div>

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onCreate={createProject} />}
    </div>
  );
}

function StatusBadge({ status }: { status: MusicProject['status'] }) {
  return <Badge color={status === 'locked' ? 'emerald' : status === 'submitted' ? 'sky' : 'slate'}>{status === 'locked' ? 'Locked' : status === 'submitted' ? 'Submitted' : 'Draft'}</Badge>;
}

function AdminProject({ project, cues, onAddCue, onRemoveCue, onToggleLock, onCopyShare }: { project: MusicProject; cues: MusicCue[]; onAddCue: (cue: Omit<MusicCue, 'id' | 'created_at' | 'updated_at'>) => Promise<void>; onRemoveCue: (id: string) => Promise<void>; onToggleLock: () => Promise<void>; onCopyShare: () => Promise<void> }) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
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
    const header = `MUSIC CUE SHEET\nClient: ${project.client_name}\nProject: ${project.mode === 'b2b' ? 'B2B Lab/Photographer' : 'B2C Direct Party'}\nGenerated: ${new Date().toLocaleString('en-IN')}\nTotal Cues: ${cues.length}\n${'='.repeat(60)}\n\n`;
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
  const whatsappText = `Music Selection Portal: ${shareUrl(project.client_name)}\n\nKripya video mixing shuru hone se pehle apni pasand ke gaane finalize karein\n\nProject managed & Bollywood Umang Films`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900/60">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-slate-900 dark:text-white">{project.client_name}</h2><StatusBadge status={project.status} /></div><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{project.mode === 'b2b' ? 'Technical B2B cue sheet for lab / photographer work' : 'Client-facing event-wise song selection'}</p></div>
          <div className="flex flex-wrap gap-2"><button onClick={onCopyShare} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"><Clipboard className="h-3.5 w-3.5" /> Copy Link</button><a href={whatsappHref} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"><Send className="h-3.5 w-3.5" /> WhatsApp</a><button onClick={exportCueSheet} className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400"><ExternalLink className="h-3.5 w-3.5" /> Export Cue Sheet</button><button onClick={onToggleLock} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${locked ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900'}`}>{locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}{locked ? 'Unlock' : 'Lock Selection'}</button></div>
        </div>
        {locked && <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"><ShieldCheck className="h-4 w-4" /> Finalized by the client. Unlock only if the studio approves a revision.</div>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900/60"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold text-slate-900 dark:text-white">Selected Songs</h3><p className="text-xs text-slate-500 dark:text-slate-400">{cues.length} cue{cues.length === 1 ? '' : 's'} in the working sheet</p></div>{!locked && <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"><Plus className="h-3.5 w-3.5" /> Add Song</button>}</div>{cues.length === 0 ? <EmptyState icon={Headphones} title="No song choices yet" subtitle="Add a cue or send the portal link to the client" /> : <div className="space-y-3">{cues.map((cue) => <CueCard key={cue.id} cue={cue} locked={locked} onRemove={() => onRemoveCue(cue.id)} />)}</div>}</div>
      {showAdd && <AddCueModal projectId={project.id} onClose={() => setShowAdd(false)} onAdd={async (cue) => { await onAddCue(cue); setShowAdd(false); }} />}
    </div>
  );
}

function CueCard({ cue, locked, onRemove }: { cue: MusicCue; locked: boolean; onRemove: () => void }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400"><Music2 className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900 dark:text-white">{cue.track_title || 'Untitled song'}</p><Badge color={PRIORITY_COLORS[cue.priority]}>{cue.priority.replace('_', ' ')}</Badge></div><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{cue.category}{cue.start_time ? ` · starts at ${cue.start_time}` : ''}</p>{cue.usage_notes && <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">{cue.usage_notes}</p>}{cue.track_url && <a href={cue.track_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-xs text-sky-600 hover:text-sky-500 dark:text-sky-400"><ExternalLink className="h-3 w-3 shrink-0" /> Open reference link</a>}{cue.track_url && isAudioUrl(cue.track_url) && <audio className="mt-3 h-8 w-full max-w-md" controls src={cue.track_url} />}</div>{!locked && <button onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10" title="Remove song"><X className="h-4 w-4" /></button>}</div></div>;
}

function CreateProjectModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, mode: MusicProjectMode) => Promise<void> }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<MusicProjectMode>('b2c');
  return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold text-white">New Music Project</h2><button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button></div><div className="space-y-4"><Field label="Party / Client Name"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white`} placeholder="e.g. Rajesh Kumar Singh" /></Field><Field label="Portal Mode"><select value={mode} onChange={(event) => setMode(event.target.value as MusicProjectMode)} className={`${selectClass} border-white/10 bg-slate-800 text-white`}><option value="b2c">B2C — Direct Party</option><option value="b2b">B2B — Lab / Photographer</option></select></Field><div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">Cancel</button><button onClick={() => void onCreate(name, mode)} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400">Create Project</button></div></div></div></div>;
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
  const party = new URLSearchParams(window.location.search).get('party')?.trim() ?? '';

  const load = useCallback(async () => {
    const [{ data: projectData }, { data: cueData }] = await Promise.all([supabase.from('music_projects').select('*').order('updated_at', { ascending: false }), supabase.from('music_cues').select('*').order('created_at')]);
    const match = ((projectData ?? []) as MusicProject[]).find((item) => item.client_name.toLowerCase() === party.toLowerCase());
    setProject(match ?? null);
    setCues(match ? ((cueData ?? []) as MusicCue[]).filter((cue) => cue.project_id === match.id) : []);
    setLoading(false);
  }, [party]);

  useEffect(() => { void load(); }, [load]);

  const addCue = async (cue: Omit<MusicCue, 'id' | 'created_at' | 'updated_at'>) => {
    if (!project || project.status === 'locked') return;
    const payload: MusicCue = { ...cue, id: newId(), created_at: now(), updated_at: now() };
    await supabase.from('music_cues').insert(payload);
    setShowAdd(false);
    await load();
    toast('Your song choice was added', 'success');
  };

  const submit = async () => {
    if (!project || cues.length === 0) { toast('Add at least one song before submitting', 'error'); return; }
    await supabase.from('music_projects').update({ status: 'locked', locked_at: now(), updated_at: now() }).eq('id', project.id);
    setSubmitted(true);
    await load();
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-950"><Sparkles className="h-6 w-6 animate-pulse text-amber-400" /></div>;
  if (!project) return <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-center text-white"><div><Music2 className="mx-auto mb-4 h-10 w-10 text-amber-400" /><h1 className="text-xl font-bold">Music portal not found</h1><p className="mt-2 text-sm text-slate-400">Please ask the studio to resend your selection link.</p></div></div>;
  const locked = project.status === 'locked';
  const studioName = settings?.films_title ?? 'Bollywood Umang Films';

  return <div className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:py-10"><div className="mx-auto max-w-3xl space-y-5"><header className="flex items-center justify-between"><div className="flex items-center gap-3">{settings?.films_logo_url ? <img src={settings.films_logo_url} alt="Studio logo" className="h-10 w-10 rounded-xl object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-slate-950"><Music2 className="h-5 w-5" /></div>}<div><p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-400">{studioName}</p><h1 className="text-xl font-bold">Music Selection Portal</h1></div></div><Badge color={locked ? 'emerald' : 'amber'}>{locked ? 'Finalized' : 'Open for selection'}</Badge></header><div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-slate-900 p-5"><p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Project for</p><h2 className="mt-1 text-2xl font-bold">{project.client_name}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Please choose the songs and share exact timestamps or instructions before video mixing begins. This helps the editing team avoid re-editing later.</p></div>{locked && <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300"><ShieldCheck className="h-5 w-5 shrink-0" /> Your selection is finalized. Contact the studio if you need an approved change.</div>}<div className="rounded-2xl border border-white/10 bg-slate-900 p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Your song choices</h2><p className="text-xs text-slate-400">{cues.length} selected cue{cues.length === 1 ? '' : 's'}</p></div>{!locked && <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"><Plus className="h-3.5 w-3.5" /> Add Song</button>}</div>{cues.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 py-12 text-center"><Headphones className="mx-auto mb-3 h-7 w-7 text-slate-500" /><p className="text-sm text-slate-300">No songs selected yet</p><p className="mt-1 text-xs text-slate-500">Add your first choice for the editing team.</p></div> : <div className="space-y-3">{cues.map((cue) => <CueCard key={cue.id} cue={cue} locked={locked} onRemove={() => undefined} />)}</div>}</div>{!locked && <button onClick={() => void submit()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/10 transition hover:bg-amber-400"><Lock className="h-4 w-4" /> Final Submit &amp; Lock</button>}{submitted && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-center text-sm text-emerald-300">Thank you. Your music selection has been submitted to the studio.</div>}<p className="flex items-center justify-center gap-1.5 text-xs text-slate-500"><Users className="h-3.5 w-3.5" /> Project managed by {studioName}</p></div>{showAdd && <AddCueModal projectId={project.id} onClose={() => setShowAdd(false)} onAdd={addCue} />}</div>;
}
