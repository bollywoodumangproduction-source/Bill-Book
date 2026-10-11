import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Download, ExternalLink, Lock, MessageCircle, Plus, Save, Trash2, Unlock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { inputClass, textareaClass } from '@/components/ui/Field';
import type { InteractivePackageSlide, InteractiveProposal } from '@/lib/interactiveProposals';
import { buildPdfFilename, downloadA4Pdf } from '@/lib/pdf';

const emptySlide = (): InteractivePackageSlide => ({ id: crypto.randomUUID(), package_name: '', price: '', badge: '', deliverables: [], events: [], video_urls: [''], album_pdf_url: '', photo_folder_url: '' });
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (value) => value.toString(16).padStart(2, '0')).join('');
const publicUrl = (value: string) => new URL(`/proposal/${encodeURIComponent(value)}`, window.location.origin).toString();

export function PackageProposals() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [proposals, setProposals] = useState<InteractiveProposal[]>([]);
  const [activeId, setActiveId] = useState('');
  const [draft, setDraft] = useState<InteractiveProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('studio_interactive_packages').select('*').order('created_at', { ascending: false });
    if (error) toast('Could not load proposals. Apply the Wedding Proposal migration and check admin access.', 'error');
    const rows = (data ?? []) as InteractiveProposal[];
    setProposals(rows);
    setActiveId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? '');
    setLoading(false);
  }, [toast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setDraft(proposals.find((item) => item.id === activeId) ?? null); }, [activeId, proposals]);

  const selected = proposals.find((item) => item.id === activeId) ?? null;
  const dirty = useMemo(() => !!draft && !!selected && JSON.stringify(draft) !== JSON.stringify(selected), [draft, selected]);
  const patchDraft = (patch: Partial<InteractiveProposal>) => setDraft((current) => current ? { ...current, ...patch } : current);

  const create = async () => {
    const { data, error } = await supabase.from('studio_interactive_packages').insert({
      title: 'Wedding Proposal', public_token: token(), packages_data: [], status: 'draft', is_locked: false,
    }).select('*').single();
    if (error || !data) { toast('Could not create proposal. Check the proposal migration.', 'error'); return; }
    await load(); setActiveId(data.id); toast('Blank proposal created', 'success');
  };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    const { error } = await supabase.from('studio_interactive_packages').update({
      title: draft.title.trim() || 'Wedding Proposal', client_name: draft.client_name || null,
      client_phone: draft.client_phone || null, pin: draft.pin || null,
      is_locked: draft.is_locked, status: draft.status, packages_data: draft.packages_data,
    }).eq('id', draft.id);
    setSaving(false);
    if (error) { toast('Could not save proposal. Check the Supabase migration and admin access.', 'error'); return; }
    await load(); toast('Proposal saved', 'success');
  };

  const copyLink = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(publicUrl(selected.public_token));
      if (selected.status === 'draft') {
        const { error } = await supabase.from('studio_interactive_packages').update({ status: 'shared' }).eq('id', selected.id);
        if (!error) {
          setProposals((current) => current.map((item) => item.id === selected.id ? { ...item, status: 'shared' } : item));
          setDraft((current) => current?.id === selected.id ? { ...current, status: 'shared' } : current);
        }
      }
      toast('Proposal link copied', 'success');
    } catch { toast('Could not copy the proposal link', 'error'); }
  };

  const openWhatsApp = () => {
    if (!draft) return;
    const text = `Namaste${draft.client_name ? ` ${draft.client_name}` : ''}, aapka wedding package proposal yahan dekhein: ${publicUrl(draft.public_token)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const toggleLock = async () => {
    if (!selected) return;
    const { error } = await supabase.from('studio_interactive_packages').update({ is_locked: !selected.is_locked }).eq('id', selected.id);
    if (error) { toast('Could not change proposal lock', 'error'); return; }
    const isLocked = !selected.is_locked;
    setProposals((current) => current.map((item) => item.id === selected.id ? { ...item, is_locked: isLocked } : item));
    setDraft((current) => current?.id === selected.id ? { ...current, is_locked: isLocked } : current);
    toast(isLocked ? 'Proposal frozen for client' : 'Proposal unlocked for revision', 'success');
  };

  const clone = async () => {
    if (!selected) return;
    const { data, error } = await supabase.from('studio_interactive_packages').insert({
      title: `${selected.title} (Copy)`, client_name: null, client_phone: null, public_token: token(), pin: null,
      is_locked: false, status: 'draft', packages_data: selected.packages_data,
    }).select('*').single();
    if (error || !data) { toast('Could not clone this proposal', 'error'); return; }
    await load(); setActiveId(data.id); toast('Proposal cloned; original is unchanged', 'success');
  };

  const remove = async () => {
    if (!selected || !window.confirm(`Delete “${selected.title}”? This removes only this proposal.`)) return;
    const { error } = await supabase.from('studio_interactive_packages').delete().eq('id', selected.id);
    if (error) { toast('Could not delete proposal', 'error'); return; }
    setProposals((current) => current.filter((item) => item.id !== selected.id)); setActiveId(''); toast('Proposal deleted', 'success');
  };

  const downloadAndShareSelection = async () => {
    if (!draft?.selected_package) return;
    const selection = draft.selected_package;
    const slide = draft.packages_data.find((item) => item.id === selection.package_id);
    if (!slide) { toast('Selected package details are missing from this proposal.', 'error'); return; }
    const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
    const list = (items: string[]) => items.length ? items.map((item) => `<li style="margin:0 0 7px">${escape(item)}</li>`).join('') : '<li>—</li>';
    const rows = slide.events.length ? slide.events.map((event) => `<tr><td style="padding:9px;border:1px solid #cbd5e1;font-weight:700">${escape(event.name || '—')}</td><td style="padding:9px;border:1px solid #cbd5e1">${escape(event.coverage || '—')}</td></tr>`).join('') : '<tr><td colspan="2" style="padding:9px;border:1px solid #cbd5e1">No event coverage listed</td></tr>';
    const links = [
      ...(slide.video_urls ?? (slide.video_embed_url ? [slide.video_embed_url] : [])).filter(Boolean).map((url, index) => `Sample video ${index + 1}: ${url}`),
      slide.album_pdf_url ? `Album PDF: ${slide.album_pdf_url}` : '',
      slide.photo_folder_url ? `Photo folder: ${slide.photo_folder_url}` : '',
    ].filter(Boolean);
    const element = document.createElement('div');
    element.innerHTML = `<div style="font-family:Arial,sans-serif;color:#0f172a;background:#fff;padding:28px;font-size:12px;line-height:1.5">
      <div style="border-bottom:2px solid #d99a21;padding-bottom:14px;margin-bottom:18px"><div style="font-size:19px;font-weight:700">BOLLYWOOD UMANG FILMS &amp; PRODUCTION</div><div>${escape(settings?.address || 'Kamtaul, Darbhanga')}${settings?.phone ? ` · ${escape(settings.phone)}` : ''}</div><h1 style="font-size:20px;margin:16px 0 0">${escape(draft.title)} — Final Package Confirmation</h1></div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:18px"><tbody>
        <tr><td style="padding:7px;border:1px solid #cbd5e1;font-weight:700">Client</td><td style="padding:7px;border:1px solid #cbd5e1">${escape(selection.client_name)}</td></tr>
        <tr><td style="padding:7px;border:1px solid #cbd5e1;font-weight:700">Phone</td><td style="padding:7px;border:1px solid #cbd5e1">${escape(selection.client_phone)}</td></tr>
        <tr><td style="padding:7px;border:1px solid #cbd5e1;font-weight:700">Selected package</td><td style="padding:7px;border:1px solid #cbd5e1">${escape(selection.package_name)}${slide.badge ? ` · ${escape(slide.badge)}` : ''}</td></tr>
        <tr><td style="padding:7px;border:1px solid #cbd5e1;font-weight:700">Package price</td><td style="padding:7px;border:1px solid #cbd5e1;font-size:16px;font-weight:700">${escape(selection.price)}</td></tr>
        <tr><td style="padding:7px;border:1px solid #cbd5e1;font-weight:700">Submitted</td><td style="padding:7px;border:1px solid #cbd5e1">${escape(new Date(selection.submitted_at).toLocaleString())}</td></tr>
        ${selection.note ? `<tr><td style="padding:7px;border:1px solid #cbd5e1;font-weight:700">Client note</td><td style="padding:7px;border:1px solid #cbd5e1">${escape(selection.note)}</td></tr>` : ''}
      </tbody></table>
      <h2 style="font-size:15px;margin:18px 0 8px">Event Coverage</h2><table style="width:100%;border-collapse:collapse"><thead><tr><th style="padding:8px;border:1px solid #cbd5e1;text-align:left;background:#f1f5f9">Event</th><th style="padding:8px;border:1px solid #cbd5e1;text-align:left;background:#f1f5f9">Coverage</th></tr></thead><tbody>${rows}</tbody></table>
      <h2 style="font-size:15px;margin:18px 0 8px">Deliverables</h2><ul style="padding-left:20px">${list(slide.deliverables)}</ul>
      ${links.length ? `<h2 style="font-size:15px;margin:18px 0 8px">Reference Links</h2><ul style="padding-left:20px">${links.map((link) => `<li style="margin:0 0 7px;overflow-wrap:anywhere">${escape(link)}</li>`).join('')}</ul>` : ''}
      <div style="border-top:1px solid #cbd5e1;margin-top:22px;padding-top:10px;color:#475569;font-size:10px">Generated from the studio proposal. Please contact the studio for revisions or clarification.</div>
    </div>`;
    element.style.position = 'fixed'; element.style.left = '-10000px'; element.style.top = '0'; document.body.append(element);
    const phone = selection.client_phone.replace(/\D/g, '');
    const whatsappPhone = phone.length === 10 ? `91${phone}` : phone;
    const whatsapp = window.open('about:blank', '_blank');
    try {
      await downloadA4Pdf(element, buildPdfFilename(selection.client_name, 'Wedding_Package'));
      toast('PDF downloaded. Attach it in the opened WhatsApp chat to send.', 'success');
      if (whatsapp) {
        const message = `Namaste ${selection.client_name}, your finalized wedding package PDF is ready. Please see the attached full-detail package confirmation.`;
        whatsapp.location.href = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;
      }
    } catch {
      whatsapp?.close(); toast('Could not create the package PDF. Please try again.', 'error');
    } finally { element.remove(); }
  };

  const updateSlide = (index: number, patch: Partial<InteractivePackageSlide>) => {
    if (!draft) return;
    patchDraft({ packages_data: draft.packages_data.map((slide, i) => i === index ? { ...slide, ...patch } : slide) });
  };
  const moveSlide = (index: number, direction: -1 | 1) => {
    if (!draft) return;
    const next = [...draft.packages_data]; const destination = index + direction;
    if (destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination], next[index]]; patchDraft({ packages_data: next });
  };

  return (
    <div className="min-h-screen bg-slate-950 p-3 text-slate-100 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><Link to="/admin" className="mb-2 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Admin</Link><h1 className="text-2xl font-bold">Wedding Packages & Proposals</h1><p className="mt-1 text-sm text-slate-400">Independent client quotations; stored in their own Supabase table.</p></div>
          <button onClick={() => void create()} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950"><Plus className="h-4 w-4" /> New Proposal</button>
        </header>
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-2">
            {loading && <p className="p-4 text-sm text-slate-400">Loading proposals…</p>}
            {!loading && proposals.length === 0 && <div className="rounded-xl border border-slate-800 p-4 text-sm text-slate-400">No proposals yet. Create a blank proposal to start.</div>}
            {proposals.map((item) => <button key={item.id} onClick={() => { if (dirty && !window.confirm('Discard unsaved proposal edits?')) return; setActiveId(item.id); }} className={`w-full rounded-xl border p-3 text-left ${item.id === activeId ? 'border-amber-400/60 bg-amber-500/10' : 'border-slate-800 bg-slate-900'}`}><span className="block truncate font-semibold">{item.title}</span><span className="mt-1 block text-xs text-slate-400">{item.client_name || 'No client'} · {item.status}</span>{item.selected_package && <span className="mt-2 block text-xs text-emerald-300">Chosen: {item.selected_package.package_name}</span>}</button>)}
          </aside>
          {draft && <section className="min-w-0 space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-400">Proposal title<input className={`${inputClass} mt-1`} value={draft.title} onChange={(e) => patchDraft({ title: e.target.value })} /></label>
                <label className="text-xs text-slate-400">Client name (optional)<input className={`${inputClass} mt-1`} value={draft.client_name ?? ''} onChange={(e) => patchDraft({ client_name: e.target.value })} /></label>
                <label className="text-xs text-slate-400">Client phone (optional)<input className={`${inputClass} mt-1`} value={draft.client_phone ?? ''} onChange={(e) => patchDraft({ client_phone: e.target.value })} /></label>
                <label className="text-xs text-slate-400">4-digit PIN (optional)<input className={`${inputClass} mt-1`} inputMode="numeric" maxLength={4} value={draft.pin ?? ''} onChange={(e) => patchDraft({ pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="No PIN" /></label>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button onClick={() => void copyLink()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-sm"><Copy className="h-4 w-4" /> Copy Link</button>
                <button onClick={openWhatsApp} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 px-3 py-2 text-sm text-emerald-300"><MessageCircle className="h-4 w-4" /> WhatsApp</button>
                <a href={publicUrl(draft.public_token)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-sm"><ExternalLink className="h-4 w-4" /> Preview</a>
                <button onClick={() => void toggleLock()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-sm">{draft.is_locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}{draft.is_locked ? 'Unlock' : 'Lock'}</button>
                <button onClick={() => void clone()} className="rounded-lg border border-slate-700 px-3 py-2 text-sm">Clone</button>
                <button onClick={() => void remove()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-2 text-sm text-rose-300"><Trash2 className="h-4 w-4" /> Delete</button>
              </div>
              {draft.is_locked && <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200">Finalized / Frozen — unlock to allow revision.</p>}
              {draft.selected_package && <div className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Client selected</p><p className="mt-1 font-bold">{draft.selected_package.package_name} · {draft.selected_package.price}</p><p className="text-xs text-slate-300">{draft.selected_package.client_name} · {draft.selected_package.client_phone} · {new Date(draft.selected_package.submitted_at).toLocaleString()}</p>{draft.selected_package.note && <p className="mt-1 text-sm text-slate-300">{draft.selected_package.note}</p>}<button onClick={() => void downloadAndShareSelection()} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400"><Download className="h-4 w-4" /> Download PDF &amp; WhatsApp</button><p className="mt-2 text-xs text-emerald-100/75">PDF includes the full selected package. Attach the downloaded file in WhatsApp to send it.</p></div>}
            </div>
            <div className="space-y-3">
              {draft.packages_data.map((slide, index) => <article key={slide.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Package slide {index + 1}</h2><div className="flex gap-1"><button title="Move up" onClick={() => moveSlide(index, -1)} className="rounded border border-slate-700 p-2"><ArrowUp className="h-4 w-4" /></button><button title="Move down" onClick={() => moveSlide(index, 1)} className="rounded border border-slate-700 p-2"><ArrowDown className="h-4 w-4" /></button><button onClick={() => patchDraft({ packages_data: draft.packages_data.filter((_, i) => i !== index) })} className="rounded border border-rose-500/30 p-2 text-rose-300"><Trash2 className="h-4 w-4" /></button></div></div>
                <div className="grid gap-3 sm:grid-cols-3"><label className="text-xs text-slate-400">Package name<input className={`${inputClass} mt-1`} value={slide.package_name} onChange={(e) => updateSlide(index, { package_name: e.target.value })} placeholder="PACKAGE 1" /></label><label className="text-xs text-slate-400">Price<input className={`${inputClass} mt-1`} value={slide.price} onChange={(e) => updateSlide(index, { price: e.target.value })} placeholder="Rs. 40k" /></label><label className="text-xs text-slate-400">Badge<input className={`${inputClass} mt-1`} value={slide.badge} onChange={(e) => updateSlide(index, { badge: e.target.value })} placeholder="Best Value" /></label></div>
                <label className="mt-3 block text-xs text-slate-400">Deliverables (one per line)<textarea className={`${textareaClass} mt-1 min-h-24`} value={slide.deliverables.join('\n')} onChange={(e) => updateSlide(index, { deliverables: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) })} /></label>
                <div className="mt-3 space-y-2"><div className="flex items-center justify-between"><span className="text-xs text-slate-400">Event coverage</span><button onClick={() => updateSlide(index, { events: [...slide.events, { name: '', coverage: '' }] })} className="text-xs text-amber-300">+ Add event</button></div>{slide.events.map((event, eventIndex) => <div key={`${slide.id}-${eventIndex}`} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]"><input className={inputClass} value={event.name} onChange={(e) => updateSlide(index, { events: slide.events.map((value, i) => i === eventIndex ? { ...value, name: e.target.value } : value) })} placeholder="Wedding" /><input className={inputClass} value={event.coverage} onChange={(e) => updateSlide(index, { events: slide.events.map((value, i) => i === eventIndex ? { ...value, coverage: e.target.value } : value) })} placeholder="Coverage details" /><button onClick={() => updateSlide(index, { events: slide.events.filter((_, i) => i !== eventIndex) })} className="rounded border border-slate-700 px-3 text-rose-300">×</button></div>)}</div>
                <div className="mt-3 space-y-2"><div className="flex items-center justify-between"><span className="text-xs text-slate-400">Sample video URLs</span><button onClick={() => updateSlide(index, { video_urls: [...(slide.video_urls ?? (slide.video_embed_url ? [slide.video_embed_url] : [''])), ''] })} className="text-xs text-amber-300">+ Add URL</button></div>{(slide.video_urls ?? (slide.video_embed_url ? [slide.video_embed_url] : [''])).map((videoUrl, videoIndex) => <div key={`${slide.id}-video-${videoIndex}`} className="flex gap-2"><input className={inputClass} value={videoUrl} onChange={(e) => updateSlide(index, { video_urls: (slide.video_urls ?? (slide.video_embed_url ? [slide.video_embed_url] : [''])).map((value, i) => i === videoIndex ? e.target.value : value), video_embed_url: undefined })} placeholder="YouTube, Vimeo, or direct/cloud video URL" /><button onClick={() => updateSlide(index, { video_urls: (slide.video_urls ?? (slide.video_embed_url ? [slide.video_embed_url] : [''])).filter((_, i) => i !== videoIndex), video_embed_url: undefined })} aria-label="Remove video URL" className="rounded-lg border border-slate-700 px-3 text-rose-300">×</button></div>)}</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-400">Album PDF link<input className={`${inputClass} mt-1`} value={slide.album_pdf_url ?? ''} onChange={(e) => updateSlide(index, { album_pdf_url: e.target.value })} placeholder="PDF share link" /></label><label className="text-xs text-slate-400">Photo folder link<input className={`${inputClass} mt-1`} value={slide.photo_folder_url ?? ''} onChange={(e) => updateSlide(index, { photo_folder_url: e.target.value })} placeholder="Google Drive / Dropbox folder link" /></label></div>
              </article>)}
              <button onClick={() => patchDraft({ packages_data: [...draft.packages_data, emptySlide()] })} className="inline-flex items-center gap-2 rounded-lg border border-dashed border-amber-400/50 px-4 py-3 text-sm text-amber-200"><Plus className="h-4 w-4" /> Add package slide</button>
            </div>
            <footer className="sticky bottom-3 flex justify-end gap-2 rounded-xl border border-slate-800 bg-slate-950/90 p-3 backdrop-blur"><span className="mr-auto self-center text-xs text-slate-400">{dirty ? 'Unsaved changes' : 'All changes saved'}</span><button disabled={!dirty || saving} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Proposal'}</button></footer>
          </section>}
        </div>
      </div>
    </div>
  );
}
