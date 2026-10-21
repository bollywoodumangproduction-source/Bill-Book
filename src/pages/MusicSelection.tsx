import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  Clipboard,
  Copy,
  ExternalLink,
  Headphones,
  CheckCircle2,
  Lock,
  Maximize2,
  Music2,
  Plus,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Archive,
  RotateCcw,
  Trash2,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Booking, MusicCue, MusicCuePriority, MusicLibrarySong, MusicMasterCue, MusicProject, MusicProjectMode, Partner, StudioLabOrder } from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import { inputClass, selectClass, textareaClass, Field } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { copyToClipboard } from '@/lib/clipboard';
import { isSupportedMediaUrl, resolveMediaUrl } from '@/lib/mediaResolver';
import { UniversalMediaPreview } from '@/components/UniversalMediaPreview';

const CATEGORIES = ['Teaser', 'Haldi', 'Entry', 'Jaymala', 'Vidai', 'Reception', 'Wedding/Barat', 'Custom'];
const DEFAULT_MUSIC_EVENTS = CATEGORIES.filter((eventTag) => eventTag !== 'Custom');
const MUSIC_MIGRATION_MESSAGE = 'Music Selection tables are not ready. Apply the Music Selection migrations, including 20261021020000_add_music_event_categories.sql, in Supabase SQL Editor, then refresh.';

function isMissingMusicSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error && (['42P01', 'PGRST204', 'PGRST205'].includes(error.code ?? '') || /schema cache|does not exist|could not find the table/i.test(error.message ?? '')));
}
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
  const [librarySongs, setLibrarySongs] = useState<MusicLibrarySong[]>([]);
  const [eventCategories, setEventCategories] = useState<string[]>(DEFAULT_MUSIC_EVENTS);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [projectToArchive, setProjectToArchive] = useState<MusicProject | null>(null);
  const [archivingProject, setArchivingProject] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<MusicProject | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [songToDelete, setSongToDelete] = useState<MusicLibrarySong | null>(null);
  const [deletingSong, setDeletingSong] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const schemaNoticeShown = useRef(false);

  const load = useCallback(async () => {
    const [{ data: projectData }, { data: cueData }, masterCueResult, libraryResult, eventResult] = await Promise.all([
      supabase.from('music_projects').select('*').order('updated_at', { ascending: false }),
      supabase.from('music_cues').select('*').order('created_at'),
      supabase.from('music_master_cues').select('*').order('created_at'),
      supabase.from('music_song_library').select('*').eq('is_active', true).order('event_tag').order('song_title'),
      supabase.from('music_event_categories').select('event_tag').order('event_tag'),
    ]);
    const musicSchemaError = masterCueResult.error ?? libraryResult.error ?? eventResult.error;
    if (musicSchemaError && !schemaNoticeShown.current) {
      schemaNoticeShown.current = true;
      toast(isMissingMusicSchema(musicSchemaError) ? MUSIC_MIGRATION_MESSAGE : 'Could not load song references. Check your Supabase connection and admin access.', 'error');
    }
    const nextProjects = (projectData ?? []) as MusicProject[];
    setProjects(nextProjects);
    setCues((cueData ?? []) as MusicCue[]);
    setMasterCues((masterCueResult.data ?? []) as MusicMasterCue[]);
    setLibrarySongs((libraryResult.data ?? []) as MusicLibrarySong[]);
    setEventCategories([...new Set([...DEFAULT_MUSIC_EVENTS, ...((eventResult.data ?? []) as { event_tag: string }[]).map((event) => event.event_tag)])].sort((a, b) => a.localeCompare(b)));
    setSelectedId((current) => current || nextProjects[0]?.id || '');
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let reloadTimer: number | undefined;
    const scheduleReload = () => {
      if (reloadTimer !== undefined) window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => { void load(); }, 250);
    };
    const channel = supabase.channel('admin-music-selection')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'music_projects' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'music_cues' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'music_master_cues' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'music_song_library' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'music_event_categories' }, scheduleReload)
      .subscribe();
    return () => {
      if (reloadTimer !== undefined) window.clearTimeout(reloadTimer);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects.filter((project) => Boolean(project.archived_at) === showArchived && (!query || project.client_name.toLowerCase().includes(query)));
  }, [projects, search, showArchived]);

  const selectedProject = projects.find((project) => project.id === selectedId) ?? null;
  const selectedCues = cues.filter((cue) => cue.project_id === selectedId);

  const createEventCategory = async (value: string): Promise<boolean> => {
    const eventTag = value.trim().replace(/\s+/g, ' ');
    if (!eventTag) { toast('Enter an event name.', 'error'); return false; }
    if (eventTag.length > 60) { toast('Event name must be 60 characters or less.', 'error'); return false; }
    if (eventCategories.some((existing) => existing.toLocaleLowerCase() === eventTag.toLocaleLowerCase())) { toast('This event is already in the list.', 'info'); return false; }
    const { data, error } = await supabase.from('music_event_categories').insert({ event_tag: eventTag }).select('event_tag').single();
    if (error || !data) { toast(error?.code === '42P01' ? 'Apply the new Music Selection events migration in Supabase, then try again.' : 'Could not save this event.', 'error'); return false; }
    setEventCategories((current) => [...new Set([...current, data.event_tag])].sort((a, b) => a.localeCompare(b)));
    toast(`“${data.event_tag}” added to all music event lists.`, 'success');
    return true;
  };

  const setProjectArchived = async () => {
    if (!projectToArchive || archivingProject) return;
    const shouldArchive = !projectToArchive.archived_at;
    setArchivingProject(true);
    const { data, error } = await supabase.rpc('studio_set_music_project_archived', { target_project_id: projectToArchive.id, should_archive: shouldArchive });
    setArchivingProject(false);
    if (error || !data) {
      toast('Could not update the project archive. Apply the latest Music Selection archive migration first.', 'error');
      return;
    }
    const updatedProject = { ...projectToArchive, archived_at: shouldArchive ? now() : null };
    setProjects((current) => current.map((project) => project.id === updatedProject.id ? updatedProject : project));
    if (selectedId === updatedProject.id) {
      setSelectedId(projects.find((project) => project.id !== updatedProject.id && Boolean(project.archived_at) === showArchived)?.id ?? '');
    }
    setProjectToArchive(null);
    toast(shouldArchive ? 'Project archived; its songs and notes are safe' : 'Project restored', 'success');
  };

  const deleteMusicProject = async () => {
    if (!projectToDelete || deletingProject) return;
    const target = projectToDelete;
    setDeletingProject(true);
    const { data, error } = await supabase.rpc('studio_delete_music_project', { target_project_id: target.id });
    setDeletingProject(false);
    if (error || !data) {
      toast(error?.message?.includes('Admin access required') ? 'Only a studio admin can delete a music project.' : 'Could not delete this project. Apply the latest Music Selection delete migration in Supabase, then try again.', 'error');
      return;
    }

    const remainingProjects = projects.filter((project) => project.id !== target.id);
    setProjects(remainingProjects);
    setCues((current) => current.filter((cue) => cue.project_id !== target.id));
    setMasterCues((current) => current.filter((cue) => cue.project_id !== target.id));
    if (selectedId === target.id) {
      setSelectedId(remainingProjects.find((project) => Boolean(project.archived_at) === showArchived)?.id ?? '');
    }
    setProjectToDelete(null);
    toast('Music project and its song data permanently deleted. Booking and partner records are unchanged.', 'success');
  };

  const createProject = async (clientName: string, mode: MusicProjectMode, bookingId: string | null, partnerId: string | null, labOrderId: string | null, labClientId: string | null) => {
    const trimmedName = clientName.trim();
    if (!trimmedName) { toast('Enter a party or client name', 'error'); return; }
    const timestamp = now();
    const payload: MusicProject = {
      id: newId(),
      client_name: trimmedName,
      booking_id: bookingId,
      partner_id: partnerId,
      lab_order_id: labOrderId,
      lab_client_id: labClientId,
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

  const addCue = async (cue: Omit<MusicCue, 'id' | 'created_at' | 'updated_at'>): Promise<boolean> => {
    if (!selectedProject || selectedProject.status === 'locked') return false;
    const timestamp = now();
    const payload: MusicCue = { ...cue, id: newId(), created_at: timestamp, updated_at: timestamp };
    const { error } = await supabase.from('music_cues').insert(payload);
    if (error) { toast('Could not save this song choice', 'error'); return false; }
    await load();
    toast('Song choice saved', 'success');
    return true;
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
    if (error) { toast(isMissingMusicSchema(error) ? MUSIC_MIGRATION_MESSAGE : 'Could not save the master song details. Check your Supabase connection and admin access.', 'error'); return false; }
    await load();
    toast(existing ? 'Master song details updated' : 'Master song details saved', 'success');
    return true;
  };

  const saveLibraryAudioLink = async (song: MusicLibrarySong, songTitle: string, singerArtist: string, audioUrl: string) => {
    const { data, error } = await supabase.from('music_song_library').update({ song_title: songTitle.trim(), singer_artist: singerArtist.trim(), audio_url: audioUrl }).eq('id', song.id).select('*').maybeSingle();
    if (error || !data) {
      toast('Could not save the library preview link. Check admin access and try again.', 'error');
      return false;
    }
    setLibrarySongs((current) => current.map((item) => item.id === song.id ? data as MusicLibrarySong : item));
    toast(audioUrl ? 'Song details and preview link saved' : 'Song details saved and preview link cleared', 'success');
    return true;
  };

  const deleteLibrarySong = async () => {
    if (!songToDelete || deletingSong) return;
    const target = songToDelete;
    setDeletingSong(true);
    const { data, error } = await supabase.from('music_song_library').delete().eq('id', target.id).select('id').maybeSingle();
    setDeletingSong(false);
    if (error || !data) {
      toast('Could not delete this library song. Check admin access and try again.', 'error');
      return;
    }
    setLibrarySongs((current) => current.filter((song) => song.id !== target.id));
    setSongToDelete(null);
    toast('Song removed from Wedding Song Library. Existing project selections are unchanged.', 'success');
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
        <div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => { const nextShowArchived = !showArchived; setShowArchived(nextShowArchived); setSelectedId(projects.find((project) => Boolean(project.archived_at) === nextShowArchived)?.id ?? ''); }} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-[11px] font-medium text-slate-300 hover:bg-white/5 sm:px-3 sm:text-xs"><Archive className="h-3.5 w-3.5" /><span>{showArchived ? 'Active Projects' : 'Archived'}</span></button>{!showArchived && <button onClick={() => setShowCreate(true)} aria-label="New Project" title="New Project" className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-2 py-1.5 text-[11px] font-medium text-slate-900 transition hover:bg-amber-400 sm:px-3 sm:text-xs"><Plus className="h-4 w-4" /><span className="hidden sm:inline">New Project</span></button>}</div>
      </div>

      <div className="w-full space-y-3 px-0 sm:px-3 md:px-4">
      <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-2">
          <input value={search} onChange={(event) => setSearch(event.target.value)} className={inputClass} placeholder="Search parties..." />
          {loading ? <div className="flex justify-center py-16"><Sparkles className="h-5 w-5 animate-pulse text-amber-500" /></div> : filteredProjects.length === 0 ? <EmptyState icon={Music2} title={showArchived ? 'No archived projects' : 'No projects yet'} subtitle={showArchived ? 'Archived projects will appear here and can be restored.' : 'Create a project to begin'} /> : (
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
          {!selectedProject ? <EmptyState icon={Headphones} title="Select a music project" subtitle="Your cue sheet will appear here" /> : <AdminProject project={selectedProject} cues={selectedCues} masterCues={masterCues.filter((cue) => cue.project_id === selectedProject.id)} librarySongs={librarySongs} eventCategories={eventCategories} onCreateEvent={createEventCategory} onSaveMasterCue={saveMasterCue} onSaveLibraryAudioLink={saveLibraryAudioLink} onDeleteLibrarySong={(song) => setSongToDelete(song)} onAddCue={addCue} onRemoveCue={removeCue} onToggleLock={toggleLock} onCopyShare={copyShare} onRequestArchive={() => setProjectToArchive(selectedProject)} onRequestDelete={() => setProjectToDelete(selectedProject)} />}
        </section>
      </div>

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onCreate={createProject} />}
      {projectToArchive && <ArchiveMusicProjectModal project={projectToArchive} busy={archivingProject} onCancel={() => { if (!archivingProject) setProjectToArchive(null); }} onConfirm={() => void setProjectArchived()} />}
      {projectToDelete && <DeleteMusicProjectModal project={projectToDelete} busy={deletingProject} onCancel={() => { if (!deletingProject) setProjectToDelete(null); }} onConfirm={() => void deleteMusicProject()} />}
      {songToDelete && <DeleteLibrarySongModal song={songToDelete} busy={deletingSong} onCancel={() => { if (!deletingSong) setSongToDelete(null); }} onConfirm={() => void deleteLibrarySong()} />}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: MusicProject['status'] }) {
  return <Badge color={status === 'locked' ? 'emerald' : status === 'submitted' ? 'sky' : 'slate'}>{status === 'locked' ? 'Locked' : status === 'submitted' ? 'Submitted' : 'Draft'}</Badge>;
}

function AdminProject({ project, cues, masterCues, librarySongs, eventCategories, onCreateEvent, onSaveMasterCue, onSaveLibraryAudioLink, onDeleteLibrarySong, onAddCue, onRemoveCue, onToggleLock, onCopyShare, onRequestArchive, onRequestDelete }: { project: MusicProject; cues: MusicCue[]; masterCues: MusicMasterCue[]; librarySongs: MusicLibrarySong[]; eventCategories: string[]; onCreateEvent: (eventTag: string) => Promise<boolean>; onSaveMasterCue: (cue: Omit<MusicMasterCue, 'id' | 'created_at' | 'updated_at'>, existing?: MusicMasterCue) => Promise<boolean>; onSaveLibraryAudioLink: (song: MusicLibrarySong, songTitle: string, singerArtist: string, audioUrl: string) => Promise<boolean>; onDeleteLibrarySong: (song: MusicLibrarySong) => void; onAddCue: (cue: Omit<MusicCue, 'id' | 'created_at' | 'updated_at'>) => Promise<boolean>; onRemoveCue: (id: string) => Promise<void>; onToggleLock: () => Promise<void>; onCopyShare: () => Promise<void>; onRequestArchive: () => void; onRequestDelete: () => void }) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [showMasterForm, setShowMasterForm] = useState(false);
  const [editingMasterCue, setEditingMasterCue] = useState<MusicMasterCue | undefined>();
  const [lockBusy, setLockBusy] = useState(false);
  const locked = project.status === 'locked';
  const readOnly = locked || Boolean(project.archived_at);
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
          <div className="flex flex-wrap items-center gap-2">{!project.archived_at && <><button onClick={onCopyShare} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"><Clipboard className="h-3.5 w-3.5" /> Copy Link</button><a href={whatsappHref} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"><Send className="h-3.5 w-3.5" /> WhatsApp</a></>}<button onClick={exportCueSheet} className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400"><ExternalLink className="h-3.5 w-3.5" /> Export Cue Sheet</button><button onClick={onRequestArchive} className="flex items-center gap-1.5 rounded-lg border border-slate-500/30 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-500/10">{project.archived_at ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}{project.archived_at ? 'Restore Project' : 'Archive Project'}</button><button type="button" onClick={onRequestDelete} className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/10"><Trash2 className="h-3.5 w-3.5" /> Delete Project</button><div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-white/10"><span className={`text-xs font-semibold ${locked ? 'text-sky-500 dark:text-sky-300' : 'text-slate-500 dark:text-slate-400'}`}>{locked ? 'Locked' : 'Draft / Unlocked'}</span><button type="button" role="switch" aria-checked={locked} aria-label={locked ? 'Unlock song selection' : 'Lock song selection'} disabled={lockBusy || Boolean(project.archived_at)} onClick={async () => { setLockBusy(true); try { await onToggleLock(); } finally { setLockBusy(false); } }} className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-sky-400/60 disabled:cursor-wait disabled:opacity-60 ${locked ? 'bg-sky-500' : 'bg-slate-400 dark:bg-slate-700'}`}><span className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow transition-transform duration-300 ${locked ? 'translate-x-6' : 'translate-x-1'}`}>{locked ? <CheckCircle2 className="h-3.5 w-3.5 text-sky-600" /> : <Unlock className="h-3.5 w-3.5 text-slate-500" />}</span></button></div></div>
        </div>
        {locked && <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"><ShieldCheck className="h-4 w-4" /> Finalized by the client. Unlock only if the studio approves a revision.</div>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 dark:border-white/10 dark:bg-slate-900/60"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-slate-900 dark:text-white">Selected Songs</h3><p className="text-xs text-slate-500 dark:text-slate-400">{cues.length} cue{cues.length === 1 ? '' : 's'} in the working sheet</p></div>{!readOnly && <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"><Plus className="h-3.5 w-3.5" /> Add Song</button>}</div>{cues.length === 0 ? <EmptyState icon={Headphones} title="No song choices yet" subtitle="Add a cue or send the portal link to the client" /> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">{cues.map((cue) => <CueCard key={cue.id} cue={cue} locked={readOnly} onRemove={() => onRemoveCue(cue.id)} />)}</div>}</div>
      <MusicLibraryPanel songs={librarySongs} eventCategories={eventCategories} project={project} cues={cues} disabled={readOnly} onAdd={onAddCue} onCreateEvent={onCreateEvent} onSaveAudioLink={onSaveLibraryAudioLink} onDeleteSong={onDeleteLibrarySong} />
      <section className="rounded-2xl border border-sky-400/20 bg-slate-950/80 p-3 sm:p-4"><div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">Song Details &amp; Master Cue Card</h3><p className="mt-1 text-xs text-slate-400">Studio reference and editing notes, stored separately from client selections.</p></div><button onClick={() => { setEditingMasterCue(undefined); setShowMasterForm(true); }} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-400"><Plus className="h-3.5 w-3.5" /> Add Reference</button></div>{masterCues.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-400">No master references saved for this project yet.</div> : <div className="grid gap-3 xl:grid-cols-2">{masterCues.map((cue) => <MasterCueCard key={cue.id} cue={cue} onEdit={() => { setEditingMasterCue(cue); setShowMasterForm(true); }} />)}</div>}</section>
      {showAdd && <AddCueModal projectId={project.id} eventCategories={eventCategories} onClose={() => setShowAdd(false)} onAdd={async (cue) => { if (await onAddCue(cue)) setShowAdd(false); }} />}
      {showMasterForm && <MasterCueModal projectId={project.id} eventCategories={eventCategories} existing={editingMasterCue} onClose={() => setShowMasterForm(false)} onSave={async (cue) => { const saved = await onSaveMasterCue(cue, editingMasterCue); if (saved) setShowMasterForm(false); }} />}
    </div>
  );
}

function MusicLibraryPanel({ songs, eventCategories, project, cues, disabled, onAdd, onCreateEvent, onSaveAudioLink, onDeleteSong }: { songs: MusicLibrarySong[]; eventCategories: string[]; project: MusicProject; cues: MusicCue[]; disabled: boolean; onAdd: (cue: Omit<MusicCue, 'id' | 'created_at' | 'updated_at'>) => Promise<boolean>; onCreateEvent?: (eventTag: string) => Promise<boolean>; onSaveAudioLink?: (song: MusicLibrarySong, songTitle: string, singerArtist: string, audioUrl: string) => Promise<boolean>; onDeleteSong?: (song: MusicLibrarySong) => void }) {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All events');
  const [addingKey, setAddingKey] = useState('');
  const [editingSong, setEditingSong] = useState<MusicLibrarySong | null>(null);
  const [audioTitle, setAudioTitle] = useState('');
  const [audioArtist, setAudioArtist] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [newEvent, setNewEvent] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);
  const categories = useMemo(() => [...new Set([...eventCategories, ...songs.map((song) => song.event_tag)])].sort((a, b) => a.localeCompare(b)), [eventCategories, songs]);
  const visibleSongs = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return songs.filter((song) => (category === 'All events' || song.event_tag === category)
      && (!normalized || `${song.song_title} ${song.singer_artist} ${song.genre_mood} ${song.event_tag}`.toLocaleLowerCase().includes(normalized)));
  }, [songs, query, category]);
  const addSong = async (song: MusicLibrarySong) => {
    if (disabled || addingKey) return;
    setAddingKey(song.catalog_key);
    try {
      await onAdd({ project_id: project.id, category: song.event_tag, track_title: song.song_title, track_url: song.audio_url, start_time: '', usage_notes: song.singer_artist ? `Suggested artist: ${song.singer_artist}` : '', priority: 'preferred' });
    } finally { setAddingKey(''); }
  };
  const saveAudioLink = async (link = audioUrl) => {
    if (!editingSong || !onSaveAudioLink || savingLink) return;
    const normalizedUrl = link.trim();
    const normalizedTitle = audioTitle.trim();
    if (!normalizedTitle) {
      toast('Enter the song title.', 'error');
      return;
    }
    if (normalizedUrl && !isSupportedMediaUrl(normalizedUrl)) {
      toast('Enter a valid YouTube, Drive, Dropbox, pCloud, OneDrive, or direct audio link.', 'error');
      return;
    }
    setSavingLink(true);
    try {
      if (await onSaveAudioLink(editingSong, normalizedTitle, audioArtist, normalizedUrl)) setEditingSong(null);
    } finally { setSavingLink(false); }
  };
  const pasteAndSaveAudioLink = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText.trim()) {
        toast('Clipboard is empty. Copy the YouTube song link first.', 'error');
        return;
      }
      setAudioUrl(clipboardText.trim());
      await saveAudioLink(clipboardText);
    } catch {
      toast('Clipboard access was blocked. Paste the copied link into the field instead.', 'error');
    }
  };
  const addedForEvent = (song: MusicLibrarySong) => cues.some((cue) => cue.category === song.event_tag && cue.track_title.trim().toLocaleLowerCase() === song.song_title.trim().toLocaleLowerCase());
  const createEvent = async () => {
    if (!onCreateEvent || savingEvent) return;
    setSavingEvent(true);
    try { if (await onCreateEvent(newEvent)) setNewEvent(''); }
    finally { setSavingEvent(false); }
  };
  return <section className="rounded-2xl border border-amber-400/20 bg-slate-950/70 p-3 sm:p-4">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-white">Wedding Song Library <span className="ml-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">{songs.length}</span></h3><p className="mt-1 text-xs text-slate-400">Choose a song to add it to this project’s shared client/partner cue sheet. Songs play when an external preview link is available.</p></div>{onCreateEvent && <div className="flex items-center gap-1.5"><input value={newEvent} onChange={(event) => setNewEvent(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void createEvent(); } }} maxLength={60} aria-label="New event name" className="w-36 rounded-lg border border-white/10 bg-slate-800 px-2.5 py-2 text-xs text-white placeholder:text-slate-500" placeholder="New event name" /><button type="button" disabled={savingEvent || !newEvent.trim()} onClick={() => void createEvent()} className="rounded-lg border border-amber-400/30 px-2.5 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 disabled:opacity-50">{savingEvent ? 'Saving…' : 'Add Event'}</button></div>}</div>
    <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><input value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white`} placeholder="Search song, artist, or event..." /><select value={category} onChange={(event) => setCategory(event.target.value)} className={`${selectClass} border-white/10 bg-slate-800 text-white`}><option>All events</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></div>
    {visibleSongs.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-slate-400">No matching songs.</p> : <div className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{visibleSongs.map((song) => {
      const added = addedForEvent(song);
      const media = resolveMediaUrl(song.audio_url, 'audio');
      return <article key={song.id} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
        <div className="flex min-w-0 items-center gap-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{song.song_title}</p><p className="truncate text-xs text-slate-400">{song.event_tag}{song.singer_artist ? ` · ${song.singer_artist}` : ''}</p></div>
          {onSaveAudioLink && <button type="button" onClick={() => { setEditingSong(song); setAudioTitle(song.song_title); setAudioArtist(song.singer_artist || ''); setAudioUrl(song.audio_url); }} className="shrink-0 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-slate-300 hover:bg-white/10">{song.audio_url ? 'Edit details/link' : 'Add details/link'}</button>}
          {onDeleteSong && <button type="button" onClick={() => onDeleteSong(song)} className="flex shrink-0 items-center gap-1 rounded-lg border border-rose-500/20 px-2 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10" title={`Delete ${song.song_title} from Wedding Song Library`}><Trash2 className="h-3 w-3" /><span className="sr-only">Delete song</span></button>}
          <button type="button" disabled={disabled || added || Boolean(addingKey)} onClick={() => void addSong(song)} className="shrink-0 rounded-lg border border-amber-400/20 px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50">{added ? 'Added' : addingKey === song.catalog_key ? 'Adding…' : 'Add'}</button>
        </div>
        {media ? <UniversalMediaPreview url={song.audio_url} kind="audio" title={`${song.song_title} preview`} className="mt-2" mediaClassName={media.render === 'audio' ? 'h-8 w-full max-w-[220px]' : 'aspect-video w-40 rounded-md border border-white/10 bg-black'} /> : <p className="mt-1 text-[11px] text-slate-500">Preview link not added</p>}
      </article>;
    })}</div>}
    {editingSong && <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/70 p-4"><div role="dialog" aria-modal="true" aria-labelledby="library-audio-link-title" className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-5 text-white shadow-2xl"><div className="mb-4"><h2 id="library-audio-link-title" className="text-lg font-semibold">Song Details & Preview Link</h2><p className="mt-1 text-sm text-slate-400">{editingSong.event_tag}</p><p className="mt-1 text-xs text-slate-400">Song title, artist/film aur link manually edit kar sakte hain.</p></div><Field label="Song title"><input autoFocus type="text" value={audioTitle} onChange={(event) => setAudioTitle(event.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white`} placeholder="Paste or enter song title" /></Field><div className="mt-3"><Field label="Artist / Film (shown under song)"><input type="text" value={audioArtist} onChange={(event) => setAudioArtist(event.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white`} placeholder="e.g. Gangubai Kathiawadi" /></Field></div><div className="mt-3"><Field label="External audio or YouTube link"><input type="url" value={audioUrl} onChange={(event) => setAudioUrl(event.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white`} placeholder="Paste YouTube, Drive, Dropbox, pCloud, OneDrive, or MP3 URL" /></Field></div><p className="mt-2 text-xs text-slate-500">YouTube ya doosra preview link yahan manually paste kar sakte hain.</p><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={savingLink} onClick={() => setEditingSong(null)} className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">Cancel</button><button type="button" disabled={savingLink} onClick={() => void pasteAndSaveAudioLink()} className="rounded-lg border border-amber-400/30 px-4 py-2.5 text-sm font-semibold text-amber-300 hover:bg-amber-500/10 disabled:opacity-50">{savingLink ? 'Saving…' : 'Paste & Save Link'}</button><button type="button" disabled={savingLink} onClick={() => void saveAudioLink()} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50">{savingLink ? 'Saving…' : 'Save Song Details'}</button></div></div></div>}
  </section>;
}

function ArchiveMusicProjectModal({ project, busy, onCancel, onConfirm }: { project: MusicProject; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const [confirmation, setConfirmation] = useState('');
  const confirmed = confirmation.trim() === project.client_name.trim();
  const isArchived = Boolean(project.archived_at);
  return <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/70 p-4"><div role="dialog" aria-modal="true" aria-labelledby="archive-music-project-title" className="w-full max-w-md rounded-2xl border border-amber-500/20 bg-slate-900 p-5 text-white shadow-2xl"><div className="mb-3 flex items-center gap-2 text-amber-300">{isArchived ? <RotateCcw className="h-5 w-5" /> : <Archive className="h-5 w-5" />}<h2 id="archive-music-project-title" className="text-lg font-semibold">{isArchived ? 'Restore Music Project?' : 'Archive Music Project?'}</h2></div><p className="text-sm text-slate-300">{isArchived ? <>This will restore <strong>{project.client_name}</strong> to active lists and make its portal available again.</> : <>This hides <strong>{project.client_name}</strong> from active lists and disables its portal link. Its project, songs, and master notes stay saved and can be restored anytime.</>}</p><Field label={`Type “${project.client_name}” to confirm`}><input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white`} /></Field><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">Cancel</button><button type="button" disabled={!confirmed || busy} onClick={onConfirm} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Saving…' : isArchived ? 'Restore Project' : 'Archive Project'}</button></div></div></div>;
}

function DeleteMusicProjectModal({ project, busy, onCancel, onConfirm }: { project: MusicProject; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const [confirmation, setConfirmation] = useState('');
  const confirmed = confirmation.trim() === project.client_name.trim();
  return <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/75 p-4"><div role="dialog" aria-modal="true" aria-labelledby="delete-music-project-title" className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-5 text-white shadow-2xl"><div className="mb-3 flex items-center gap-2 text-rose-300"><Trash2 className="h-5 w-5" /><h2 id="delete-music-project-title" className="text-lg font-semibold">Delete Music Project?</h2></div><p className="text-sm text-slate-300">This permanently deletes <strong>{project.client_name}</strong>, its selected songs, and its Song Details &amp; Master Cue Cards. Linked booking, partner, lab order, and Wedding Song Library entries will not be deleted. This cannot be undone.</p><div className="mt-4"><Field label={`Type “${project.client_name}” to confirm`}><input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white`} /></Field></div><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">Cancel</button><button type="button" disabled={!confirmed || busy} onClick={onConfirm} className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Deleting…' : <><Trash2 className="h-4 w-4" /> Delete Project</>}</button></div></div></div>;
}

function DeleteLibrarySongModal({ song, busy, onCancel, onConfirm }: { song: MusicLibrarySong; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const [confirmation, setConfirmation] = useState('');
  const confirmed = confirmation.trim() === song.song_title.trim();
  return <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/75 p-4"><div role="dialog" aria-modal="true" aria-labelledby="delete-library-song-title" className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-5 text-white shadow-2xl"><div className="mb-3 flex items-center gap-2 text-rose-300"><Trash2 className="h-5 w-5" /><h2 id="delete-library-song-title" className="text-lg font-semibold">Delete Library Song?</h2></div><p className="text-sm text-slate-300">This permanently removes <strong>{song.song_title}</strong> from the shared Wedding Song Library for all projects. Any project cue that already uses it will stay unchanged.</p><div className="mt-4"><Field label={`Type “${song.song_title}” to confirm`}><input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white`} /></Field></div><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">Cancel</button><button type="button" disabled={!confirmed || busy} onClick={onConfirm} className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Deleting…' : <><Trash2 className="h-4 w-4" /> Delete Song</>}</button></div></div></div>;
}

function CueCard({ cue, locked, onRemove }: { cue: MusicCue; locked: boolean; onRemove: () => void }) {
  const media = resolveMediaUrl(cue.track_url, 'audio');
  const [showMediaPreview, setShowMediaPreview] = useState(false);
  const previewFullscreenRef = useRef<HTMLDivElement>(null);
  return <article className="relative min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-white/10 dark:bg-white/5">
    {!locked && <button onClick={onRemove} className="absolute right-1 top-1 rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10" title="Remove song"><X className="h-3 w-3" /></button>}
    <div className="flex min-w-0 items-center gap-1 pr-5">
      <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-amber-500/10 text-amber-600 dark:text-amber-400"><Music2 className="h-2.5 w-2.5" /></div>
      <p title={cue.track_title} className="line-clamp-2 min-w-0 flex-1 break-words text-[11px] font-semibold leading-4 text-slate-900 dark:text-white">{cue.track_title || 'Untitled song'}</p>
    </div>
    <p className="flex min-w-0 items-center gap-1 truncate text-[10px] leading-4 text-slate-500 dark:text-slate-400">{cue.category}{cue.start_time ? ` · ${cue.start_time}` : ''}<span className="shrink-0"><Badge color={PRIORITY_COLORS[cue.priority]}>{cue.priority.replace('_', ' ')}</Badge></span></p>
    {cue.usage_notes && <p title={cue.usage_notes} className="truncate text-[10px] leading-4 text-slate-700 dark:text-slate-300">{cue.usage_notes}</p>}
    {cue.track_url && media && <><button type="button" onClick={() => setShowMediaPreview(true)} className="inline-flex max-w-full items-center gap-1 truncate text-[10px] leading-4 text-sky-600 hover:text-sky-500 dark:text-sky-400"><ExternalLink className="h-2.5 w-2.5 shrink-0" /> Open link</button><UniversalMediaPreview url={cue.track_url} kind="audio" className="mt-1 w-full max-w-[120px]" mediaClassName={media.render === 'iframe' ? 'aspect-video w-full rounded-md border border-white/10 bg-black' : 'w-full'} /></>}
    {cue.track_url && !media && <p className="truncate text-[10px] leading-4 text-rose-300">Invalid link — edit song</p>}
    {showMediaPreview && media && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label={`${cue.track_title || 'Song'} preview`} onMouseDown={(event) => { if (event.target === event.currentTarget) setShowMediaPreview(false); }}><div className="w-full max-w-md rounded-xl border border-white/10 bg-slate-950 p-3 shadow-2xl"><div className="mb-3 flex items-center justify-between gap-3"><div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><p className="min-w-0 truncate text-sm font-semibold text-white">{cue.track_title || 'Song preview'}</p><span className="shrink-0 text-[9px] font-medium tracking-wide text-amber-400">Bollywood Umang</span></div><p className="truncate text-xs text-slate-400">{cue.category}</p></div><div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => { const player = previewFullscreenRef.current; if (player?.requestFullscreen) void player.requestFullscreen().catch(() => undefined); }} aria-label="Play song full screen" title="Full screen" className="rounded-lg p-2 text-slate-300 hover:bg-white/10"><Maximize2 className="h-4 w-4" /></button><button type="button" onClick={() => setShowMediaPreview(false)} aria-label="Close song preview" className="rounded-lg p-2 text-slate-300 hover:bg-white/10"><X className="h-4 w-4" /></button></div></div><div ref={previewFullscreenRef} className="overflow-hidden rounded-lg bg-black"><UniversalMediaPreview url={cue.track_url} kind="audio" title={`${cue.track_title || 'Song'} preview`} autoPlay className="overflow-hidden rounded-lg bg-black" mediaClassName="aspect-video w-full rounded-lg border border-white/10 bg-black" /></div></div></div>}
  </article>;
}

function MasterCueCard({ cue, onEdit }: { cue: MusicMasterCue; onEdit: () => void }) {
  const { toast } = useToast();
  const media = resolveMediaUrl(cue.audio_url, 'audio');
  const copyLink = async () => {
    const ok = await copyToClipboard(cue.audio_url);
    toast(ok ? 'Audio link copied' : 'Could not copy the audio link', ok ? 'success' : 'error');
  };
  const shareCard = async () => {
    const text = masterCueShareText(cue);
    try {
      if (navigator.share) await navigator.share({ title: cue.song_title, text, url: media?.sourceUrl });
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
  return <article className="rounded-xl border border-white/10 bg-white/[0.04] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate font-semibold text-white">{cue.song_title || 'Untitled song reference'}</h4><p className="mt-1 text-sm text-slate-300">{cue.singer_artist || 'Artist not specified'}{cue.genre_mood ? ` · ${cue.genre_mood}` : ''}</p></div><div className="flex shrink-0 gap-1.5"><button onClick={() => void shareCard()} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10"><Share2 className="h-3.5 w-3.5" /> Share</button><button onClick={onEdit} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10">Edit</button></div></div><div className="mt-3 flex flex-wrap gap-2">{cue.event_tag && <Badge color="sky">{cue.event_tag}</Badge>}{cue.genre_mood && <Badge color="slate">{cue.genre_mood}</Badge>}</div>{cue.audio_url && <div className="mt-3 space-y-2">{media ? <div className="flex items-center gap-2"><a href={media.sourceUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-xs text-sky-300 hover:text-sky-200"><ExternalLink className="mr-1 inline h-3 w-3" />{cue.audio_url}</a><button type="button" onClick={() => void copyLink()} aria-label="Copy audio link" className="rounded-md p-1.5 text-slate-300 hover:bg-white/10"><Copy className="h-3.5 w-3.5" /></button></div> : <p className="break-all text-xs text-rose-300">This link is invalid. Edit the card and enter an http(s) link.</p>}{media && <UniversalMediaPreview url={cue.audio_url} kind="audio" className="w-full max-w-[240px]" mediaClassName="aspect-video w-full rounded-lg border border-white/10 bg-black" />}</div>}{cue.cue_timestamps && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-amber-200"><span className="font-semibold text-amber-300">Mixing cues: </span>{cue.cue_timestamps}</p>}{cue.special_notes && <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-300">{cue.special_notes}</p>}</article>;
}

function MasterCueModal({ projectId, eventCategories, existing, onClose, onSave }: { projectId: string; eventCategories: string[]; existing?: MusicMasterCue; onClose: () => void; onSave: (cue: Omit<MusicMasterCue, 'id' | 'created_at' | 'updated_at'>) => Promise<void> }) {
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
  return <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white">{existing ? 'Edit Master Song Details' : 'Add Master Song Details'}</h2><p className="text-xs text-slate-400">Saved separately; locking or changing client selections will not replace this reference.</p></div><button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Song Title"><input autoFocus value={songTitle} onChange={(e) => setSongTitle(e.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white`} required /></Field><Field label="Singer / Artist"><input value={singerArtist} onChange={(e) => setSingerArtist(e.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white`} /></Field><Field label="Genre / Mood"><input value={genreMood} onChange={(e) => setGenreMood(e.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white`} placeholder="Romantic, energetic..." /></Field><Field label="Event / Tag"><select value={eventTag} onChange={(e) => setEventTag(e.target.value)} className={`${selectClass} border-white/10 bg-slate-800 text-white`}><option value="">Select event</option>{[...new Set([...eventCategories, ...(eventTag ? [eventTag] : [])])].map((category) => <option key={category} value={category}>{category}</option>)}</select></Field><div className="sm:col-span-2"><Field label="External Audio Link / Preview"><input value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} className={`${inputClass} border-white/10 bg-slate-800 text-white`} placeholder="YouTube, Google Drive, Dropbox, pCloud, OneDrive..." type="url" /></Field></div><div className="sm:col-span-2"><Field label="Special Editing Notes / Cue Timestamps"><textarea value={cueTimestamps} onChange={(e) => setCueTimestamps(e.target.value)} className={`${textareaClass} border-white/10 bg-slate-800 text-white`} placeholder="0:35 intro; 1:12 switch to chorus; 2:08 fade out" rows={3} /></Field></div><div className="sm:col-span-2"><Field label="Additional Editing Notes"><textarea value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} className={`${textareaClass} border-white/10 bg-slate-800 text-white`} placeholder="Mixing, transition, or edit instructions..." rows={3} /></Field></div></div><div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">Cancel</button><button disabled={!songTitle.trim() || saving} onClick={() => void submit()} className="rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-50">{saving ? 'Saving…' : existing ? 'Save Changes' : 'Save Reference'}</button></div></div></div>;
}

function CreateProjectModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, mode: MusicProjectMode, bookingId: string | null, partnerId: string | null, labOrderId: string | null, labClientId: string | null) => Promise<void> }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<MusicProjectMode>('b2c');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [labOrders, setLabOrders] = useState<StudioLabOrder[]>([]);
  const [bookingId, setBookingId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [labOrderId, setLabOrderId] = useState('');
  const [labClientId, setLabClientId] = useState('');
  const [loadingProfiles, setLoadingProfiles] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      supabase.from('bookings').select('*').is('archived_at', null).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('partners').select('*').is('trashed_at', null).order('name'),
      supabase.from('studio_lab_orders').select('*').is('archived_at', null).is('deleted_at', null).order('created_at', { ascending: false }),
    ]).then(([bookingResult, partnerResult, orderResult]) => {
      if (cancelled) return;
      if (bookingResult.error || partnerResult.error || orderResult.error) toast('Could not load client and partner profiles. Check admin access and try again.', 'error');
      setBookings((bookingResult.data ?? []) as Booking[]);
      setPartners((partnerResult.data ?? []) as Partner[]);
      setLabOrders((orderResult.data ?? []) as StudioLabOrder[]);
      setLoadingProfiles(false);
    });
    return () => { cancelled = true; };
  }, [toast]);

  const activeOrders = labOrders.filter((order) => order.partner_id === partnerId);
  const selectedOrder = activeOrders.find((order) => order.id === labOrderId);
  const selectedLabClient = selectedOrder?.clients?.find((client) => client.id === labClientId);

  useEffect(() => {
    if (mode === 'b2c') {
      const booking = bookings.find((item) => item.id === bookingId);
      if (booking) setName(booking.client_name || '');
      else setName('');
    } else {
      const partner = partners.find((item) => item.id === partnerId);
      setName(selectedLabClient?.client_name || (selectedOrder?.project_name ? `${selectedOrder.project_name}${partner ? ` · ${partner.studio_name || partner.name}` : ''}` : ''));
    }
  }, [mode, bookingId, partnerId, labOrderId, labClientId, bookings, partners, selectedLabClient, selectedOrder]);

  return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold text-white">New Music Project</h2><button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button></div><div className="space-y-4"><Field label="Portal Mode"><select value={mode} onChange={(event) => { setMode(event.target.value as MusicProjectMode); setBookingId(''); setPartnerId(''); setLabOrderId(''); setLabClientId(''); setName(''); }} className={`${selectClass} border-white/10 bg-slate-800 text-white`}><option value="b2c">Client / Direct Party</option><option value="b2b">Lab / Photographer Partner</option></select></Field>{mode === 'b2c' ? <Field label="Select Client Booking"><select value={bookingId} onChange={(event) => setBookingId(event.target.value)} className={`${selectClass} border-white/10 bg-slate-800 text-white`} disabled={loadingProfiles}><option value="">— Select client booking —</option>{bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.client_name} · {booking.booking_no}</option>)}</select></Field> : <><Field label="Select Partner Profile"><select value={partnerId} onChange={(event) => { setPartnerId(event.target.value); setLabOrderId(''); setLabClientId(''); }} className={`${selectClass} border-white/10 bg-slate-800 text-white`} disabled={loadingProfiles}><option value="">— Select partner —</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.studio_name || partner.name} · {partner.name}</option>)}</select></Field><Field label="Select Partner's Lab Order"><select value={labOrderId} onChange={(event) => { setLabOrderId(event.target.value); setLabClientId(''); }} className={`${selectClass} border-white/10 bg-slate-800 text-white`} disabled={!partnerId || loadingProfiles}><option value="">— Select lab order —</option>{activeOrders.map((order) => <option key={order.id} value={order.id}>{order.project_name || order.order_no} · {order.order_no}</option>)}</select></Field>{selectedOrder && <Field label="Select Partner's Client"><select value={labClientId} onChange={(event) => setLabClientId(event.target.value)} className={`${selectClass} border-white/10 bg-slate-800 text-white`}><option value="">— Select client —</option>{(selectedOrder.clients ?? []).map((client, index) => <option key={client.id} value={client.id}>{client.client_name || `Client ${index + 1}`}</option>)}</select></Field>}</>}{name && <Field label="Project / Client Name"><input value={name} readOnly className={`${inputClass} border-white/10 bg-slate-800 text-white`} /></Field>}{!loadingProfiles && mode === 'b2c' && bookings.length === 0 && <p className="text-xs text-amber-300">No active client bookings found.</p>}{!loadingProfiles && mode === 'b2b' && partners.length === 0 && <p className="text-xs text-amber-300">No active partner profiles found.</p>}<div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">Cancel</button><button disabled={loadingProfiles || (mode === 'b2c' ? !bookingId : !partnerId || !labOrderId || !labClientId)} onClick={() => void onCreate(name, mode, bookingId || null, partnerId || null, labOrderId || null, labClientId || null)} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">Create Project</button></div></div></div></div>;
}

function AddCueModal({ projectId, eventCategories, onClose, onAdd }: { projectId: string; eventCategories: string[]; onClose: () => void; onAdd: (cue: Omit<MusicCue, 'id' | 'created_at' | 'updated_at'>) => Promise<void> }) {
  const [category, setCategory] = useState(eventCategories[0] ?? DEFAULT_MUSIC_EVENTS[0]);
  const [trackTitle, setTrackTitle] = useState('');
  const [trackUrl, setTrackUrl] = useState('');
  const [startTime, setStartTime] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<MusicCuePriority>('preferred');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!trackTitle.trim() || saving) return;
    setSaving(true);
    try { await onAdd({ project_id: projectId, category, track_title: trackTitle.trim(), track_url: trackUrl.trim(), start_time: startTime.trim(), usage_notes: notes.trim(), priority }); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900 dark:text-white">Add Song Choice</h2><button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button></div><div className="space-y-4"><div className="grid grid-cols-2 gap-3"><Field label="Event / Use"><select value={category} onChange={(event) => setCategory(event.target.value)} className={selectClass}>{[...new Set([...eventCategories, ...(category ? [category] : [])])].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Priority"><select value={priority} onChange={(event) => setPriority(event.target.value as MusicCuePriority)} className={selectClass}>{PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field></div><Field label="Song Title"><input value={trackTitle} onChange={(event) => setTrackTitle(event.target.value)} className={inputClass} placeholder="Enter song name or artist" /></Field><Field label="External Audio / Reference Link"><input value={trackUrl} onChange={(event) => setTrackUrl(event.target.value)} className={inputClass} placeholder="Paste YouTube or another supported link" type="url" /></Field><Field label="Timestamp / Timecode"><input value={startTime} onChange={(event) => setStartTime(event.target.value)} className={inputClass} placeholder="01:15 or 00:01:15:00" /></Field><Field label="Usage Notes"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className={textareaClass} placeholder="e.g. 01:15 se Jaymala flower drop pe use karein" /></Field><div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button><button disabled={!trackTitle.trim() || saving} onClick={() => void save()} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"><Check className="mr-1 inline h-4 w-4" /> {saving ? 'Saving…' : 'Save Song'}</button></div></div></div></div>;
}

export function PublicMusicSelection() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [project, setProject] = useState<MusicProject | null>(null);
  const [cues, setCues] = useState<MusicCue[]>([]);
  const [librarySongs, setLibrarySongs] = useState<MusicLibrarySong[]>([]);
  const [eventCategories, setEventCategories] = useState<string[]>(DEFAULT_MUSIC_EVENTS);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const pollInFlight = useRef(false);
  const projectId = new URLSearchParams(window.location.search).get('project')?.trim() ?? '';

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    const { data, error } = await supabase.functions.invoke('public-share', { body: { action: 'music-read', id: projectId } });
    const match = !error ? (data?.project as MusicProject | undefined) : undefined;
    setProject(match ?? null);
    setCues(match ? (data?.cues as MusicCue[] ?? []) : []);
    setLibrarySongs(match ? (data?.songs as MusicLibrarySong[] ?? []) : []);
    setEventCategories([...new Set([...DEFAULT_MUSIC_EVENTS, ...((data?.events as string[] | undefined) ?? [])])].sort((a, b) => a.localeCompare(b)));
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  // Public share links intentionally read through the Edge Function (not direct table access).
  // Refreshing this protected endpoint keeps portal lock state in sync without widening RLS.
  useEffect(() => {
    if (!projectId) return;
    const refreshIfIdle = () => {
      if (document.visibilityState !== 'visible' || pollInFlight.current) return;
      pollInFlight.current = true;
      void load().finally(() => { pollInFlight.current = false; });
    };
    const timer = window.setInterval(refreshIfIdle, 5 * 60 * 1000);
    const refreshWhenVisible = () => { refreshIfIdle(); };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refreshWhenVisible); };
  }, [load, projectId]);

  const addCue = async (cue: Omit<MusicCue, 'id' | 'created_at' | 'updated_at'>) => {
    if (!project || project.status === 'locked') return false;
    const { error } = await supabase.functions.invoke('public-share', { body: { action: 'music-add-cue', projectId: project.id, cue } });
    if (error) { toast('Could not save this song choice', 'error'); return false; }
    setShowAdd(false);
    await load();
    toast('Your song choice was added', 'success');
    return true;
  };

  const removeCue = async (cueId: string) => {
    if (!project || project.status === 'locked') return;
    if (!window.confirm('Is galat song selection ko hatana hai?')) return;
    const { error } = await supabase.functions.invoke('public-share', { body: { action: 'music-remove-cue', projectId: project.id, cueId } });
    if (error) { toast('Could not remove this song choice. Please try again.', 'error'); return; }
    await load();
    toast('Song choice removed', 'success');
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

  return <div className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:py-10"><div className="mx-auto max-w-3xl space-y-5"><header className="flex items-center justify-between"><div className="flex items-center gap-3">{settings?.films_logo_url ? <img src={settings.films_logo_url} alt="Studio logo" className="h-10 w-10 rounded-xl object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-slate-950"><Music2 className="h-5 w-5" /></div>}<div><p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-400">{studioName}</p><h1 className="text-xl font-bold">Music Selection Portal</h1></div></div><Badge color={locked ? 'emerald' : 'amber'}>{locked ? 'Finalized' : 'Open for selection'}</Badge></header><div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-slate-900 p-5"><p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Project for</p><h2 className="mt-1 text-2xl font-bold">{project.client_name}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Please choose the songs and share exact timestamps or instructions before video mixing begins. This helps the editing team avoid re-editing later.</p></div>{locked && <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300"><ShieldCheck className="h-5 w-5 shrink-0" /> Your selection is finalized. Contact the studio if you need an approved change.</div>}<div className="rounded-2xl border border-white/10 bg-slate-900 p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Your song choices</h2><p className="text-xs text-slate-400">{cues.length} selected cue{cues.length === 1 ? '' : 's'}</p></div>{!locked && <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"><Plus className="h-3.5 w-3.5" /> Add Song</button>}</div>{cues.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 py-12 text-center"><Headphones className="mx-auto mb-3 h-7 w-7 text-slate-500" /><p className="text-sm text-slate-300">No songs selected yet</p><p className="mt-1 text-xs text-slate-500">Choose from the Wedding Song Library below or add your own.</p></div> : <div className="space-y-3">{cues.map((cue) => <CueCard key={cue.id} cue={cue} locked={locked} onRemove={() => void removeCue(cue.id)} />)}</div>}</div><MusicLibraryPanel songs={librarySongs} eventCategories={eventCategories} project={project} cues={cues} disabled={locked} onAdd={addCue} />{!locked && <button onClick={() => void submit()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/10 transition hover:bg-amber-400"><Lock className="h-4 w-4" /> Final Submit &amp; Lock</button>}{submitted && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-center text-sm text-emerald-300">Thank you. Your music selection has been submitted to the studio.</div>}<p className="flex items-center justify-center gap-1.5 text-xs text-slate-500"><Users className="h-3.5 w-3.5" /> Project managed by {studioName}</p></div>{showAdd && <AddCueModal projectId={project.id} eventCategories={eventCategories} onClose={() => setShowAdd(false)} onAdd={async (cue) => { await addCue(cue); }} />}</div>;
}
