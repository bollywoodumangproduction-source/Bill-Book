import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Images,
  Plus,
  Search,
  FolderPlus,
  Upload,
  Trash2,
  Lock,
  Unlock,
  FileDown,
  Send,
  Clipboard,
  Eye,
  Copy,
  ShieldCheck,
  CheckCircle2,
  X,
  Layers,
  FolderOpen,
  Settings2,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type {
  ClientSelectionSession,
  PhotoItem,
  SheetProofItem,
  SelectionClientType,
  Booking,
  Partner,
  StudioLabOrder,
} from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import { inputClass, selectClass, textareaClass, Field } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { copyToClipboard } from '@/lib/clipboard';

function now(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function genPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function selectionUrl(sessionId: string): string {
  return `${window.location.origin}/select/${sessionId}`;
}

function whatsappMessage(client: string, url: string, pin: string): string {
  return `Hello ${client}, find your selection link here: ${url} | Secret PIN: ${pin}`;
}

const CLIENT_TYPES: { value: SelectionClientType; label: string }[] = [
  { value: 'B2C', label: 'Wedding Party' },
  { value: 'B2B', label: 'Lab Order' },
];

function sessionTypeLabel(clientType: SelectionClientType): string {
  return clientType === 'B2B' || clientType === 'Lab Order' ? 'Lab Order' : 'Wedding Party';
}

function isLabSession(clientType: SelectionClientType): boolean {
  return clientType === 'B2B' || clientType === 'Lab Order';
}

function bookingPackageSheets(booking: Booking): number {
  return (booking.deliverables_data?.album_rows ?? []).reduce(
    (total, album) => total + album.papers.reduce((sheets, paper) => sheets + Number(paper.sheets || 0), 0),
    0,
  );
}

function labOrderSheetCount(order: StudioLabOrder): number {
  return (order.clients ?? []).reduce(
    (total, client) => total + (client.album_rows ?? []).reduce(
      (albumTotal, album) => albumTotal + (album.papers ?? []).reduce((sheets, paper) => sheets + Number(paper.sheets || 0), 0),
      0,
    ),
    0,
  );
}

export function PhotoSelection() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<ClientSelectionSession[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [labOrders, setLabOrders] = useState<StudioLabOrder[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [previewPartner, setPreviewPartner] = useState<{ name: string; partner: Partner | null; orders: StudioLabOrder[] } | null>(null);

  const load = useCallback(async () => {
    const [{ data: sessionData }, { data: bookingData }, { data: labData }, { data: partnerData }] = await Promise.all([
      supabase.from('photo_selection_sessions').select('*').order('updated_at', { ascending: false }),
      supabase.from('bookings').select('*').order('created_at', { ascending: false }),
      supabase.from('studio_lab_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('partners').select('*').order('name'),
    ]);
    const next = (sessionData ?? []) as ClientSelectionSession[];
    setSessions(next);
    setBookings((bookingData ?? []) as Booking[]);
    setLabOrders((labData ?? []) as StudioLabOrder[]);
    setPartners((partnerData ?? []) as Partner[]);
    setSelectedId((cur) => cur || next[0]?.id || '');
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => !q || s.clientName.toLowerCase().includes(q) || s.billId.toLowerCase().includes(q) || s.partnerName?.toLowerCase().includes(q) || s.labOrderNo?.toLowerCase().includes(q));
  }, [sessions, search]);

  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  const updateSession = async (id: string, patch: Partial<ClientSelectionSession>) => {
    const { error } = await supabase.from('photo_selection_sessions').update({ ...patch, updated_at: now() }).eq('id', id);
    if (error) { toast('Could not update session', 'error'); return; }
    await load();
  };

  const createSession = async (data: {
    clientType: SelectionClientType;
    billId: string;
    clientName: string;
    partnerName?: string;
    labOrderNo?: string;
    phone: string;
    packageSheets: number;
    extraSheetRate: number;
  }) => {
    const id = newId();
    const ts = now();
    const payload: ClientSelectionSession = {
      id,
      billId: data.billId,
      clientName: data.clientName,
      ...(data.partnerName ? { partnerName: data.partnerName } : {}),
      ...(data.labOrderNo ? { labOrderNo: data.labOrderNo } : {}),
      phone: data.phone,
      pinCode: genPin(),
      clientType: data.clientType,
      packageSheets: data.packageSheets,
      extraSheetRate: data.extraSheetRate,
      isLocked: false,
      pdfDownloadAllowed: false,
      shareableUrl: selectionUrl(id),
      folders: ['Card 1'],
      photos: [],
      proofSheets: [],
      submitted_at: null,
      created_at: ts,
      updated_at: ts,
    };
    const { error } = await supabase.from('photo_selection_sessions').insert(payload);
    if (error) { toast('Could not create session', 'error'); return; }
    setShowCreate(false);
    await load();
    setSelectedId(id);
    toast('Selection session created', 'success');
  };

  const deleteSession = async (id: string) => {
    await supabase.from('photo_selection_sessions').delete().eq('id', id);
    await load();
    toast('Session deleted', 'info');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Images className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Photo Selection & Proofing</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Client photo selection, proofing, and auto-copier engine</p>
            </div>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400">
          <Plus className="h-4 w-4" /> New Session
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputClass} pl-9`} placeholder="Search clients..." />
          </div>
          {loading ? (
            <div className="flex justify-center py-16"><Sparkles className="h-5 w-5 animate-pulse text-amber-500" /></div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Images} title="No sessions yet" subtitle="Create a session to begin" />
          ) : (
            <div className="space-y-2">
              {filtered.map((s) => (
                <div key={s.id} role="button" tabIndex={0} onClick={() => setSelectedId(s.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(s.id); }} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === s.id ? 'border-amber-400 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10' : 'border-slate-200 bg-white hover:border-amber-300 dark:border-white/10 dark:bg-slate-900/50'}`}>
                  <div className="flex items-start gap-2">
                    <Images className={`mt-0.5 h-4 w-4 shrink-0 ${selectedId === s.id ? 'text-amber-500' : 'text-slate-400'}`} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{s.clientName}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
                    <Badge color={isLabSession(s.clientType) ? 'sky' : 'amber'}>{sessionTypeLabel(s.clientType)}</Badge>
                    {isLabSession(s.clientType) && s.partnerName && <button type="button" onClick={(event) => { event.stopPropagation(); setPreviewPartner({ name: s.partnerName!, partner: partners.find((item) => item.name === s.partnerName || item.studio_name === s.partnerName) ?? null, orders: labOrders.filter((order) => order.partner_name === s.partnerName || order.studio_name === s.partnerName) }); }} className="text-left text-xs text-slate-500 underline decoration-dotted underline-offset-2 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400">Lab: {s.partnerName} | Order #{s.labOrderNo || s.billId}</button>}
                    {s.clientType === 'B2C' && <span className="text-xs text-slate-500 dark:text-slate-400">Direct Client | Bill #{s.billId}</span>}
                    {s.isLocked && <Badge color="emerald">Locked</Badge>}
                    <Badge color="slate">PIN {s.pinCode}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>

        <section className="min-w-0">
          {!selected ? (
            <EmptyState icon={Images} title="Select a session" subtitle="Session details and controls will appear here" />
          ) : (
            <SessionDetail
              session={selected}
              partners={partners}
              bookings={bookings}
              labOrders={labOrders}
              onUpdate={(patch) => updateSession(selected.id, patch)}
              onDelete={() => deleteSession(selected.id)}
              onRefresh={load}
            />
          )}
        </section>
      </div>

      {showCreate && (
        <CreateSessionModal
          bookings={bookings}
          labOrders={labOrders}
          partners={partners}
          onClose={() => setShowCreate(false)}
          onCreate={createSession}
        />
      )}
      {previewPartner && <PartnerPreviewModal partner={previewPartner.partner} partnerName={previewPartner.name} orders={previewPartner.orders} onClose={() => setPreviewPartner(null)} />}
    </div>
  );
}

function SessionDetail({
  session,
  partners,
  onUpdate,
  onDelete,
  onRefresh,
}: {
  session: ClientSelectionSession;
  partners: Partner[];
  bookings: Booking[];
  labOrders: StudioLabOrder[];
  onUpdate: (patch: Partial<ClientSelectionSession>) => void;
  onDelete: () => void;
  onRefresh: () => Promise<void>;
}) {
  const { toast } = useToast();
  const { settings } = useSettings();
  const [showProofing, setShowProofing] = useState(false);
  const [showWatermark, setShowWatermark] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const [showPartner, setShowPartner] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFolder, setUploadFolder] = useState(session.folders[0] ?? 'Card 1');

  const selectedCount = session.photos.filter((p) => p.selected).length;
  const uploadedTotalSheets = session.proofSheets.length > 0 ? Math.max(...session.proofSheets.map((s) => s.sheetNumber)) : 0;
  const totalSheets = session.total_sheets && session.total_sheets > 0 ? session.total_sheets : uploadedTotalSheets;
  const extraSheets = Math.max(0, totalSheets - session.packageSheets);
  const extraCost = session.extra_amount && session.extra_amount > 0 ? session.extra_amount : extraSheets * (session.extraSheetRate || 50);

  const toggleLock = () => {
    onUpdate({ isLocked: !session.isLocked });
    toast(session.isLocked ? 'Session unlocked for client' : 'Session locked', 'success');
  };

  const togglePdf = () => {
    onUpdate({ pdfDownloadAllowed: !session.pdfDownloadAllowed });
    toast(session.pdfDownloadAllowed ? 'PDF download disabled' : 'PDF download enabled', 'success');
  };

  const copyShareLink = async () => {
    const ok = await copyToClipboard(session.shareableUrl);
    toast(ok ? 'Selection link copied' : 'Could not copy link', ok ? 'success' : 'error');
  };

  const shareWhatsApp = () => {
    const msg = whatsappMessage(session.clientName, session.shareableUrl, session.pinCode);
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const copyPinLink = async () => {
    const text = `${session.shareableUrl} | PIN: ${session.pinCode}`;
    const ok = await copyToClipboard(text);
    toast(ok ? 'Link + PIN copied' : 'Could not copy', ok ? 'success' : 'error');
  };

  const addFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    if (session.folders.includes(name)) { toast('Folder already exists', 'error'); return; }
    onUpdate({ folders: [...session.folders, name] });
    setNewFolderName('');
    toast('Folder added', 'success');
  };

  const removeFolder = (folder: string) => {
    const photos = session.photos.filter((p) => p.folder !== folder);
    const folders = session.folders.filter((f) => f !== folder);
    onUpdate({ folders, photos });
    toast('Folder removed', 'info');
  };

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newPhotos: PhotoItem[] = [];
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file);
      newPhotos.push({
        id: newId(),
        folder: uploadFolder,
        fileName: file.name,
        previewUrl: url,
        selected: false,
      });
    }
    await onUpdate({ photos: [...session.photos, ...newPhotos] });
    toast(`${newPhotos.length} photo${newPhotos.length > 1 ? 's' : ''} added to ${uploadFolder}`, 'success');
  };

  const removePhoto = (photoId: string) => {
    onUpdate({ photos: session.photos.filter((p) => p.id !== photoId) });
  };

  const togglePhotoSelected = (photoId: string) => {
    const photos = session.photos.map((p) => p.id === photoId ? { ...p, selected: !p.selected } : p);
    onUpdate({ photos });
  };

  const folderBreakdown = session.folders.map((folder) => ({
    folder,
    total: session.photos.filter((p) => p.folder === folder).length,
    selected: session.photos.filter((p) => p.folder === folder && p.selected).length,
  }));

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900/60">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{session.clientName}</h2>
              <Badge color={isLabSession(session.clientType) ? 'sky' : 'amber'}>{sessionTypeLabel(session.clientType)}</Badge>
              {session.isLocked && <Badge color="emerald">Locked</Badge>}
              {session.submitted_at && <Badge color="sky">Submitted</Badge>}
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Bill: {session.billId} | Phone: {session.phone} | PIN: <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{session.pinCode}</span>
            </p>
            {session.partnerName && isLabSession(session.clientType) && (
              <button type="button" onClick={() => setShowPartner(true)} className="mt-1 block text-left text-sm text-slate-600 underline decoration-dotted underline-offset-2 hover:text-amber-600 dark:text-slate-300 dark:hover:text-amber-400">
                Client: {session.clientName} • Assigned Lab: {session.partnerName} • Lab Order: #{session.labOrderNo || session.billId} • Sheets: {totalSheets}
              </button>
            )}
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              Package: {session.packageSheets} sheets | Extra rate: ₹{session.extraSheetRate}/sheet
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={copyShareLink} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">
              <Clipboard className="h-3.5 w-3.5" /> Copy Link
            </button>
            <button onClick={copyPinLink} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">
              <Copy className="h-3.5 w-3.5" /> Link+PIN
            </button>
            <a onClick={shareWhatsApp} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
              <Send className="h-3.5 w-3.5" /> WhatsApp
            </a>
            <button onClick={toggleLock} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${session.isLocked ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900'}`}>
              {session.isLocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              {session.isLocked ? 'Unlock' : 'Lock'}
            </button>
            <button onClick={onDelete} className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/10">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
      </div>

      {/* Live counters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CounterCard label="Total Images" value={session.photos.length} icon={Images} color="amber" />
        <CounterCard label="Selected" value={selectedCount} icon={CheckCircle2} color="emerald" />
        <CounterCard label="Folders" value={session.folders.length} icon={FolderOpen} color="sky" />
        <CounterCard label="Proof Sheets" value={totalSheets} icon={Layers} color="violet" />
      </div>

      {/* Folder breakdown */}
      {folderBreakdown.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/60">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Folder Breakdown</h3>
          <div className="flex flex-wrap gap-2">
            {folderBreakdown.map((f) => (
              <div key={f.folder} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{f.folder}</span>
                <span className="text-xs text-slate-400">{f.selected}/{f.total}</span>
                <button onClick={() => removeFolder(f.folder)} className="text-slate-300 hover:text-rose-500 dark:text-slate-600">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Folder & upload management */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900/60">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-900 dark:text-white">Folders & Photo Upload</h3>
          <div className="flex items-center gap-2">
            <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} className={`${inputClass} w-40`} placeholder="New folder name" />
            <button onClick={addFolder} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900">
              <FolderPlus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)} className={`${selectClass} w-auto`}>
            {session.folders.map((f) => <option key={f}>{f}</option>)}
          </select>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void handlePhotoUpload(e.target.files)} />
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-400">
            <Upload className="h-3.5 w-3.5" /> Upload Photos
          </button>
        </div>

        {session.photos.length === 0 ? (
          <EmptyState icon={Images} title="No photos uploaded yet" subtitle="Upload photos to the selected folder" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {session.photos.map((photo) => (
              <div key={photo.id} className="group relative overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
                <img src={photo.previewUrl} alt={photo.fileName} className="aspect-square w-full object-cover" draggable={false} />
                {photo.selected && (
                  <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-2 py-1.5 opacity-0 transition group-hover:opacity-100">
                  <span className="truncate text-[10px] text-white">{photo.fileName}</span>
                  <div className="flex gap-1">
                    <button onClick={() => togglePhotoSelected(photo.id)} className={`rounded p-1 ${photo.selected ? 'bg-emerald-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}>
                      <CheckCircle2 className="h-3 w-3" />
                    </button>
                    <button onClick={() => removePhoto(photo.id)} className="rounded bg-rose-500/80 p-1 text-white hover:bg-rose-500">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Proofing, Watermark, File Copier */}
      <div className="grid gap-4 md:grid-cols-3">
        <button onClick={() => setShowProofing(true)} className="flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-amber-300 dark:border-white/10 dark:bg-slate-900/60 dark:hover:border-amber-500/30">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400"><Layers className="h-5 w-5" /></div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Proofing & Lab Billing</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{totalSheets} sheets | Extra: ₹{extraCost}</p>
            {session.partnerName && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Lab Partner: {session.partnerName}</p>}
            <p className="text-xs text-slate-500 dark:text-slate-400">Allocated Sheets: {totalSheets} | Extra Rate: ₹{session.extraSheetRate}/sheet</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Client Reference: {session.clientName}</p>
          </div>
        </button>

        <button onClick={() => setShowWatermark(true)} className="flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-amber-300 dark:border-white/10 dark:bg-slate-900/60 dark:hover:border-amber-500/30">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400"><Settings2 className="h-5 w-5" /></div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Watermark Engine</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Configure studio watermark</p>
          </div>
        </button>

        <button onClick={() => setShowCopy(true)} className="flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-amber-300 dark:border-white/10 dark:bg-slate-900/60 dark:hover:border-amber-500/30">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><Copy className="h-5 w-5" /></div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Auto-Copier Engine</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Copy selected originals</p>
          </div>
        </button>
      </div>

      {/* PDF toggle */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/60">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${session.pdfDownloadAllowed ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 text-slate-400 dark:bg-white/5'}`}>
            <FileDown className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Allow PDF Download</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Client can download proofing PDF when enabled</p>
          </div>
        </div>
        <button onClick={togglePdf} className={`relative h-7 w-12 rounded-full transition ${session.pdfDownloadAllowed ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${session.pdfDownloadAllowed ? 'left-6' : 'left-1'}`} />
        </button>
      </div>

      {showProofing && (
        <ProofingModal session={session} onUpdate={onUpdate} onClose={() => setShowProofing(false)} />
      )}
      {showWatermark && (
        <WatermarkModal settings={settings} onClose={() => setShowWatermark(false)} />
      )}
      {showCopy && (
        <FileCopierModal session={session} onClose={() => setShowCopy(false)} />
      )}
      {showPartner && session.partnerName && (
        <PartnerPreviewModal
          partner={partners.find((item) => item.name === session.partnerName || item.studio_name === session.partnerName) ?? null}
          partnerName={session.partnerName}
          orders={labOrders.filter((order) => order.partner_name === session.partnerName || order.studio_name === session.partnerName)}
          onClose={() => setShowPartner(false)}
        />
      )}
    </div>
  );
}

function CounterCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Images; color: 'amber' | 'emerald' | 'sky' | 'violet' }) {
  const colors = {
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/60">
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors[color]}`}><Icon className="h-4 w-4" /></div>
        <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

type LabPartnerOption = {
  id: string;
  name: string;
  studioName: string;
  phone: string;
  orders: StudioLabOrder[];
};

function PartnerPreviewModal({ partner, partnerName, orders, onClose }: { partner: Partner | null; partnerName: string; orders: StudioLabOrder[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Lab Partner</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{partner?.name || partnerName}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{partner?.studio_name || 'Studio not specified'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <p>Contact: {partner?.mobile || 'Not available'}</p>
          <p>Active orders: {orders.length}</p>
          {partner?.studio_address && <p>Address: {partner.studio_address}</p>}
        </div>
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400">Close</button>
        </div>
      </div>
    </div>
  );
}

function CreateSessionModal({
  bookings,
  labOrders,
  partners,
  onClose,
  onCreate,
}: {
  bookings: Booking[];
  labOrders: StudioLabOrder[];
  partners: Partner[];
  onClose: () => void;
  onCreate: (data: { clientType: SelectionClientType; billId: string; clientName: string; partnerName?: string; labOrderNo?: string; phone: string; packageSheets: number; extraSheetRate: number }) => Promise<void>;
}) {
  const [clientType, setClientType] = useState<SelectionClientType>('B2C');
  const [linkMode, setLinkMode] = useState<'search' | 'manual'>('search');
  const [search, setSearch] = useState('');
  const [billId, setBillId] = useState('');
  const [clientName, setClientName] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [labOrderNo, setLabOrderNo] = useState('');
  const [phone, setPhone] = useState('');
  const [packageSheets, setPackageSheets] = useState('35');
  const [extraSheetRate, setExtraSheetRate] = useState('50');
  const [labStep, setLabStep] = useState<'partners' | 'orders'>('partners');
  const [selectedPartner, setSelectedPartner] = useState<LabPartnerOption | null>(null);

  const allClients = useMemo(() => {
    if (clientType === 'B2C') {
      return bookings.map((booking) => ({
        id: booking.booking_no,
        name: booking.client_name,
        phone: booking.client_mobile,
        type: 'B2C' as const,
        packageSheets: bookingPackageSheets(booking),
      }));
    }
    return labOrders.filter((order) => !order.archived_at && !order.deleted_at).map((l) => ({
      id: l.order_no,
      name: (l.clients ?? []).map((client) => client.client_name).filter(Boolean).join(' + ') || l.project_name || 'Lab Client',
      phone: l.studio_mobile,
      type: 'B2B' as const,
      partnerName: l.partner_name || l.studio_name,
      labOrderNo: l.order_no,
      packageSheets: labOrderSheetCount(l),
    }));
  }, [bookings, clientType, labOrders]);

  const labPartners = useMemo<LabPartnerOption[]>(() => {
    const activePartners = partners.filter((partner) => partner.status === 'Active');
    const source = [...activePartners.map((partner) => ({
      id: partner.id,
      name: partner.name,
      mobile: partner.mobile,
      studio_name: partner.studio_name,
    })), ...labOrders.filter((order) => !order.archived_at && !order.deleted_at).map((order) => ({
      id: order.partner_id || order.partner_name || order.studio_name,
      name: order.partner_name || order.studio_name || 'Unassigned Partner',
      mobile: order.studio_mobile || '',
      studio_name: order.studio_name || '',
    }))].filter((partner, index, list) => list.findIndex((item) => item.id === partner.id || (item.name && item.name === partner.name)) === index);
    return source.map((partner) => {
      const orders = labOrders.filter((order) => !order.archived_at && !order.deleted_at && (
        (partner.id && order.partner_id === partner.id) ||
        order.partner_name === partner.name ||
        order.studio_name === partner.studio_name
      ));
      return {
        id: partner.id,
        name: partner.name,
        studioName: partner.studio_name || orders[0]?.studio_name || '',
        phone: partner.mobile || orders[0]?.studio_mobile || '',
        orders,
      };
    });
  }, [labOrders, partners]);

  const filtered = allClients.filter((c) => {
    const q = search.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
  });

  const selectClient = (c: typeof allClients[0]) => {
    setBillId(c.id);
    setClientName(c.name);
    setPhone(c.phone);
    setClientType(c.type);
    setPartnerName('partnerName' in c ? c.partnerName : '');
    setLabOrderNo('labOrderNo' in c ? c.labOrderNo : '');
    setPackageSheets(String(c.packageSheets));
  };

  const selectLabOrder = (order: StudioLabOrder, partner: LabPartnerOption) => {
    const clientName = (order.clients ?? []).map((client) => client.client_name).filter(Boolean).join(' + ') || order.project_name || 'Lab Client';
    setSelectedPartner(partner);
    setBillId(order.order_no);
    setLabOrderNo(order.order_no);
    setClientName(clientName);
    setPartnerName(partner.name);
    setPhone(partner.phone || order.studio_mobile || '');
    setPackageSheets(String(labOrderSheetCount(order)));
    setLinkMode('manual');
  };

  const handleCreate = () => {
    if (!clientName.trim()) return;
    void onCreate({
      clientType,
      billId: billId || 'MANUAL',
      clientName: clientName.trim(),
      ...(partnerName ? { partnerName: partnerName.trim() } : {}),
      ...(labOrderNo ? { labOrderNo: labOrderNo.trim() } : {}),
      phone: phone.trim(),
      packageSheets: parseInt(packageSheets) || 0,
      extraSheetRate: parseInt(extraSheetRate) || 0,
    });
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">New Selection Session</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setLinkMode('search')} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${linkMode === 'search' ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400' : 'border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400'}`}>Link Existing Bill</button>
            <button onClick={() => setLinkMode('manual')} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${linkMode === 'manual' ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400' : 'border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400'}`}>Manual Entry</button>
          </div>

          {linkMode === 'search' && clientType === 'B2C' && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputClass} pl-9`} placeholder="Search client or bill no..." />
              </div>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10">
                {filtered.slice(0, 10).map((c) => (
                  <button key={c.id} onClick={() => selectClient(c)} className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-white/5 ${billId === c.id ? 'bg-amber-50 dark:bg-amber-500/10' : ''}`}>
                    <span className="min-w-0 truncate font-medium text-slate-700 dark:text-slate-300">
                      {clientType === 'B2B' ? `${c.name} • Lab: ${'partnerName' in c ? c.partnerName : ''} • ${c.packageSheets} Sheets • #${c.id}` : `${c.name} • ${c.id}`}
                    </span>
                  </button>
                ))}
                {filtered.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">No matches found</p>}
              </div>
            </div>
          )}

          {linkMode === 'search' && clientType === 'B2B' && (
            <div className="space-y-3">
              {labStep === 'partners' ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputClass} pl-9`} placeholder="Search lab partners..." />
                  </div>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {labPartners.filter((partner) => !search.trim() || `${partner.name} ${partner.studioName}`.toLowerCase().includes(search.trim().toLowerCase())).map((partner) => (
                      <button key={partner.id} type="button" onClick={() => { setSelectedPartner(partner); setLabStep('orders'); setSearch(''); }} className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-amber-300 hover:bg-amber-50 dark:border-white/10 dark:hover:border-amber-500/30 dark:hover:bg-amber-500/10">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{partner.name}</p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{partner.studioName || 'Studio not specified'}</p>
                          </div>
                          <Badge color="sky">{partner.orders.length} {partner.orders.length === 1 ? 'Order' : 'Orders'} in progress</Badge>
                        </div>
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{partner.phone || 'Contact not available'}</p>
                      </button>
                    ))}
                    {labPartners.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">No active lab partners found</p>}
                  </div>
                </>
              ) : selectedPartner ? (
                <>
                  <button type="button" onClick={() => { setLabStep('partners'); setSelectedPartner(null); }} className="text-sm font-medium text-amber-600 hover:text-amber-500 dark:text-amber-400">← Back | Orders for {selectedPartner.name}</button>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {selectedPartner.orders.map((order) => (
                      <button key={order.id} type="button" onClick={() => selectLabOrder(order, selectedPartner)} className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-amber-300 hover:bg-amber-50 dark:border-white/10 dark:hover:border-amber-500/30 dark:hover:bg-amber-500/10">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{(order.clients ?? []).map((client) => client.client_name).filter(Boolean).join(' + ') || order.project_name || 'Lab Client'}</p>
                          <Badge color="sky">{labOrderSheetCount(order)} Sheets</Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">#{order.order_no} · {order.order_status || 'Pending'}{order.promised_delivery_date ? ` · Delivery ${order.promised_delivery_date}` : ''}</p>
                      </button>
                    ))}
                    {selectedPartner.orders.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">No active orders for this partner</p>}
                  </div>
                </>
              ) : null}
            </div>
          )}

          <Field label="Session Type">
            <select value={clientType} onChange={(e) => { setClientType(e.target.value as SelectionClientType); setSearch(''); setBillId(''); setClientName(''); setPartnerName(''); setLabOrderNo(''); }} className={selectClass}>
              {CLIENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label={clientType === 'B2B' ? 'Order No.' : 'Bill ID'}><input value={billId} onChange={(e) => setBillId(e.target.value)} className={inputClass} placeholder={clientType === 'B2B' ? 'e.g. BUF-LAB-001' : 'e.g. BUF-001'} /></Field>
          <Field label="Client Name"><input value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputClass} placeholder="Client name" /></Field>
          {clientType === 'B2B' && <>
            {linkMode === 'manual' && <button type="button" onClick={() => { setLinkMode('search'); setLabStep(selectedPartner ? 'orders' : 'partners'); }} className="text-xs font-medium text-amber-600 hover:text-amber-500 dark:text-amber-400">Change Partner / Order</button>}
            <Field label="Lab Partner"><input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} className={inputClass} placeholder="Lab partner name" /></Field>
            <Field label="Lab Order No."><input value={labOrderNo} onChange={(e) => setLabOrderNo(e.target.value)} className={inputClass} placeholder="e.g. BUF-LAB-001" /></Field>
          </>}
          <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="Mobile number" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Package Sheets"><input type="number" value={packageSheets} onChange={(e) => setPackageSheets(e.target.value)} className={inputClass} /></Field>
            <Field label="Extra Sheet Rate (₹)"><input type="number" value={extraSheetRate} onChange={(e) => setExtraSheetRate(e.target.value)} className={inputClass} /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
            <button onClick={handleCreate} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400">Create Session</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProofingModal({ session, onUpdate, onClose }: { session: ClientSelectionSession; onUpdate: (patch: Partial<ClientSelectionSession>) => void; onClose: () => void }) {
  const { toast } = useToast();
  const [sheets, setSheets] = useState<SheetProofItem[]>(session.proofSheets);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const innerInputRef = useRef<HTMLInputElement>(null);
  const [sheetRangeStart, setSheetRangeStart] = useState(session.proofSheets.length > 0 ? String(Math.min(...session.proofSheets.map((s) => s.sheetNumber))) : '0');
  const [sheetRangeEnd, setSheetRangeEnd] = useState(session.total_sheets != null ? String(Number(sheetRangeStart) + session.total_sheets) : session.proofSheets.length > 0 ? String(Math.max(...session.proofSheets.map((s) => s.sheetNumber))) : '50');

  const startPage = Number(sheetRangeStart);
  const endPage = Number(sheetRangeEnd);
  const rangeTotal = Number.isFinite(startPage) && Number.isFinite(endPage) && endPage >= startPage ? endPage - startPage : 0;
  const uploadedTotal = sheets.length > 0 ? Math.max(...sheets.map((s) => s.sheetNumber)) - Math.min(...sheets.map((s) => s.sheetNumber)) + 1 : 0;
  const totalSheets = rangeTotal || uploadedTotal;
  const extraSheets = Math.max(0, totalSheets - session.packageSheets);
  const extraCost = extraSheets * (session.extraSheetRate || 50);

  const handleCoverUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const url = URL.createObjectURL(file);
    setSheets((prev) => {
      const withoutCover = prev.filter((s) => s.sheetNumber !== 0);
      return [{ sheetNumber: 0, previewUrl: url }, ...withoutCover];
    });
  };

  const handleInnerUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newSheets: SheetProofItem[] = [];
    const startNum = parseInt(sheetRangeStart) || 1;
    Array.from(files).forEach((file, i) => {
      newSheets.push({ sheetNumber: startNum + i, previewUrl: URL.createObjectURL(file) });
    });
    setSheets((prev) => {
      const withoutInner = prev.filter((s) => s.sheetNumber === 0);
      return [...withoutInner, ...newSheets].sort((a, b) => a.sheetNumber - b.sheetNumber);
    });
  };

  const updateNote = (sheetNumber: number, note: string) => {
    setSheets((prev) => prev.map((s) => s.sheetNumber === sheetNumber ? { ...s, correctionNote: note } : s));
  };

  const removeSheet = (sheetNumber: number) => {
    setSheets((prev) => prev.filter((s) => s.sheetNumber !== sheetNumber));
  };

  const save = () => {
    onUpdate({ proofSheets: sheets, total_sheets: totalSheets, extra_sheets: extraSheets, extra_amount: extraCost });
    toast('Proofing sheets saved', 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Proofing & Lab Billing</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Total Sheets</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{totalSheets}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Extra Sheets</p>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{extraSheets}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Extra Cost</p>
            <p className="text-xl font-bold text-rose-600 dark:text-rose-400">₹{extraCost}</p>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border-2 border-dashed border-slate-300 p-4 dark:border-white/10">
            <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Box 1: Cover Spread (Sheet 0)</p>
            <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleCoverUpload(e.target.files)} />
            <button onClick={() => coverInputRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-3 text-xs text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
              <Upload className="h-4 w-4" /> Upload Cover
            </button>
            {sheets.find((s) => s.sheetNumber === 0) && (
              <div className="mt-2">
                <img src={sheets.find((s) => s.sheetNumber === 0)!.previewUrl} alt="Cover" className="h-32 w-full rounded-lg object-cover" />
                <button onClick={() => removeSheet(0)} className="mt-1 text-xs text-rose-500">Remove</button>
              </div>
            )}
          </div>
          <div className="rounded-xl border-2 border-dashed border-slate-300 p-4 dark:border-white/10">
            <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Box 2: Inner DM Spreads</p>
            <div className="mb-2 flex items-center gap-2">
              <input type="number" value={sheetRangeStart} onChange={(e) => setSheetRangeStart(e.target.value)} className={`${inputClass} w-16`} placeholder="0" />
              <span className="text-xs text-slate-400">to</span>
              <input type="number" value={sheetRangeEnd} onChange={(e) => setSheetRangeEnd(e.target.value)} className={`${inputClass} w-16`} placeholder="50" />
            </div>
            <input ref={innerInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleInnerUpload(e.target.files)} />
            <button onClick={() => innerInputRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-3 text-xs text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
              <Upload className="h-4 w-4" /> Upload Inner Spreads
            </button>
          </div>
        </div>

        {sheets.length > 0 && (
          <div className="space-y-2">
            {sheets.sort((a, b) => a.sheetNumber - b.sheetNumber).map((sheet) => (
              <div key={sheet.sheetNumber} className="flex gap-3 rounded-lg border border-slate-200 p-3 dark:border-white/10">
                <img src={sheet.previewUrl} alt={`Sheet ${sheet.sheetNumber}`} className="h-16 w-16 rounded-lg object-cover" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{sheet.sheetNumber === 0 ? 'Cover Spread' : `Sheet ${sheet.sheetNumber}`}</span>
                    <button onClick={() => removeSheet(sheet.sheetNumber)} className="text-slate-300 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <textarea value={sheet.correctionNote ?? ''} onChange={(e) => updateNote(sheet.sheetNumber, e.target.value)} className={`${textareaClass} mt-1 min-h-[40px]`} placeholder="Correction note (e.g. Bride face light karo)" />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
          <button onClick={save} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400">Save Proofing</button>
        </div>
      </div>
    </div>
  );
}

function WatermarkModal({ settings, onClose }: { settings: any; onClose: () => void }) {
  const studioName = settings?.studio_name ?? settings?.films_title ?? 'Bollywood Umang Films';
  const [mode, setMode] = useState<'text' | 'logo'>('text');
  const [text, setText] = useState(`© {Studio Name} | {Client Name} | {Phone}`);
  const [opacity, setOpacity] = useState(30);
  const [placement, setPlacement] = useState<'center' | 'corner'>('center');

  const preview = text
    .replace('{Studio Name}', studioName)
    .replace('{Client Name}', 'Client')
    .replace('{Phone}', settings?.phone ?? '+91 XXXXXXXXXX');

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Watermark Engine</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setMode('text')} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${mode === 'text' ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400' : 'border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400'}`}>Text Watermark</button>
            <button onClick={() => setMode('logo')} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${mode === 'logo' ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400' : 'border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400'}`}>PNG Logo</button>
          </div>
          {mode === 'text' && (
            <Field label="Watermark Text (supports {Studio Name}, {Client Name}, {Phone})">
              <input value={text} onChange={(e) => setText(e.target.value)} className={inputClass} />
            </Field>
          )}
          {mode === 'logo' && (
            <div className="rounded-lg border-2 border-dashed border-slate-300 p-6 text-center text-xs text-slate-400 dark:border-white/10">
              Upload transparent PNG logo
            </div>
          )}
          <Field label={`Opacity: ${opacity}%`}>
            <input type="range" min={10} max={100} value={opacity} onChange={(e) => setOpacity(parseInt(e.target.value))} className="w-full" />
          </Field>
          <Field label="Placement">
            <select value={placement} onChange={(e) => setPlacement(e.target.value as 'center' | 'corner')} className={selectClass}>
              <option value="center">Center Cross (Diagonal -45°)</option>
              <option value="corner">Bottom-Right Corner</option>
            </select>
          </Field>
          <div className="relative h-32 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
            <div className="flex h-full w-full items-center justify-center">
              <span className={`text-xs font-bold text-slate-400 ${placement === 'center' ? 'rotate-[-45deg]' : ''}`} style={{ opacity: opacity / 100 }}>{preview}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400">Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FileCopierModal({ session, onClose }: { session: ClientSelectionSession; onClose: () => void }) {
  const { toast } = useToast();
  const [copying, setCopying] = useState(false);
  const [progress, setProgress] = useState('');

  const selectedPhotos = session.photos.filter((p) => p.selected);
  const directoryPicker = (window as Window & typeof globalThis & { showDirectoryPicker?: () => Promise<any> }).showDirectoryPicker;

  const startCopy = async () => {
    if (selectedPhotos.length === 0) { toast('No photos selected by client', 'error'); return; }
    if (!directoryPicker) {
      toast('Your browser does not support the File System Access API. Use Chrome, Edge, or Brave.', 'error');
      return;
    }
    try {
      setCopying(true);
      setProgress('Select root folder...');
      const rootHandle = await directoryPicker();
      const selectedDir = await rootHandle.getDirectoryHandle('Selected_Originals', { create: true });

      for (const photo of selectedPhotos) {
        setProgress(`Copying ${photo.fileName} → ${photo.folder}/`);
        const folderHandle = await selectedDir.getDirectoryHandle(photo.folder, { create: true });
        const fileHandle = await folderHandle.getFileHandle(photo.fileName, { create: true });
        const writable = await fileHandle.createWritable();

        const response = await fetch(photo.previewUrl);
        const blob = await response.blob();
        await writable.write(blob);
        await writable.close();
      }

      setProgress(`Done! ${selectedPhotos.length} files copied to /Selected_Originals/`);
      toast(`${selectedPhotos.length} files copied successfully`, 'success');
    } catch (err: any) {
      if (err.name === 'AbortError') { setProgress('Cancelled'); }
      else { setProgress(`Error: ${err.message}`); toast('Copy failed', 'error'); }
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Auto-Copier Engine</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-500/20 dark:bg-sky-500/10">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
            <p className="text-xs text-sky-700 dark:text-sky-300">
              Uses the native File System Access API. Works on Chrome, Edge, and Brave. Selected photos will be copied with zero compression to <code className="font-mono">/Selected_Originals/[Folder]/filename</code>
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4 dark:border-white/10">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{selectedPhotos.length} selected photos ready to copy</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Original quality preserved. No compression or metadata changes.</p>
          </div>
          {progress && <p className="text-xs text-slate-500 dark:text-slate-400">{progress}</p>}
          {!directoryPicker && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">
              Browser not supported. Please use Chrome, Edge, or Brave for this feature.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Close</button>
            <button onClick={startCopy} disabled={copying || selectedPhotos.length === 0} className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">
              <Copy className="h-4 w-4" /> {copying ? 'Copying...' : 'Select Root Folder & Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
