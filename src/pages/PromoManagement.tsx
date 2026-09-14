import { useState, useEffect, useCallback } from 'react';
import {
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  Save,
  Sparkles,
  Bell,
  Tag,
  Image as ImageIcon,
  Eye,
  EyeOff,
  Send,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { PromoAd, PromoAdAudience } from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import { Field, inputClass } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';

type Section = 'banners' | 'popups' | 'coupons' | 'broadcasts';

interface Banner {
  id: string;
  text: string;
  link: string;
  is_active: boolean;
  created_at: string;
}

interface Popup {
  id: string;
  title: string;
  message: string;
  is_active: boolean;
  created_at: string;
}

interface Coupon {
  id: string;
  code: string;
  percentage: number;
  valid_until: string;
  is_active: boolean;
  created_at: string;
}

interface Broadcast {
  id: string;
  title: string;
  category: string;
  message: string;
  created_at: string;
}

function uid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isoNow(): string {
  return new Date().toISOString();
}

export function PromoManagement() {
  const { toast } = useToast();
  const [section, setSection] = useState<Section>('banners');

  const [promoAds, setPromoAds] = useState<PromoAd[]>([]);
  const [showAdForm, setShowAdForm] = useState(false);
  const [editingAd, setEditingAd] = useState<PromoAd | null>(null);

  const [banners, setBanners] = useState<Banner[]>([]);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);

  const [bannerText, setBannerText] = useState('');
  const [bannerLink, setBannerLink] = useState('');

  const [popupTitle, setPopupTitle] = useState('');
  const [popupMessage, setPopupMessage] = useState('');

  const [couponCode, setCouponCode] = useState('');
  const [couponPct, setCouponPct] = useState('');
  const [couponValid, setCouponValid] = useState('');

  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastCategory, setBroadcastCategory] = useState('all');
  const [broadcastMessage, setBroadcastMessage] = useState('');

  const loadPromoAds = useCallback(async () => {
    const { data } = await supabase.from('promo_ads').select('*').order('sort_order');
    setPromoAds((data ?? []) as PromoAd[]);
  }, []);

  const loadBanners = useCallback(async () => {
    const { data } = await supabase.from('promo_banners').select('*').order('created_at', { ascending: false });
    setBanners((data ?? []) as Banner[]);
  }, []);

  const loadPopups = useCallback(async () => {
    const { data } = await supabase.from('promo_popups').select('*').order('created_at', { ascending: false });
    setPopups((data ?? []) as Popup[]);
  }, []);

  const loadCoupons = useCallback(async () => {
    const { data } = await supabase.from('promo_coupons').select('*').order('created_at', { ascending: false });
    setCoupons((data ?? []) as Coupon[]);
  }, []);

  const loadBroadcasts = useCallback(async () => {
    const { data } = await supabase.from('promo_broadcasts').select('*').order('created_at', { ascending: false });
    setBroadcasts((data ?? []) as Broadcast[]);
  }, []);

  useEffect(() => {
    loadPromoAds();
    loadBanners();
    loadPopups();
    loadCoupons();
    loadBroadcasts();
  }, [loadPromoAds, loadBanners, loadPopups, loadCoupons, loadBroadcasts]);

  const addBanner = async () => {
    if (!bannerText.trim()) { toast('Banner text is required', 'error'); return; }
    const banner: Banner = { id: uid(), text: bannerText.trim(), link: bannerLink.trim(), is_active: true, created_at: isoNow() };
    await supabase.from('promo_banners').insert(banner);
    setBannerText(''); setBannerLink('');
    loadBanners();
    toast('Banner created', 'success');
  };

  const toggleBanner = async (id: string, current: boolean) => {
    await supabase.from('promo_banners').update({ is_active: !current }).eq('id', id);
    loadBanners();
  };

  const deleteBanner = async (id: string) => {
    await supabase.from('promo_banners').delete().eq('id', id);
    loadBanners();
    toast('Banner deleted', 'info');
  };

  const addPopup = async () => {
    if (!popupTitle.trim()) { toast('Popup title is required', 'error'); return; }
    const popup: Popup = { id: uid(), title: popupTitle.trim(), message: popupMessage.trim(), is_active: true, created_at: isoNow() };
    await supabase.from('promo_popups').insert(popup);
    setPopupTitle(''); setPopupMessage('');
    loadPopups();
    toast('Popup created', 'success');
  };

  const togglePopup = async (id: string, current: boolean) => {
    await supabase.from('promo_popups').update({ is_active: !current }).eq('id', id);
    loadPopups();
  };

  const deletePopup = async (id: string) => {
    await supabase.from('promo_popups').delete().eq('id', id);
    loadPopups();
    toast('Popup deleted', 'info');
  };

  const addCoupon = async () => {
    if (!couponCode.trim()) { toast('Coupon code is required', 'error'); return; }
    if (Number(couponPct) <= 0 || Number(couponPct) > 100) { toast('Enter a valid percentage (1-100)', 'error'); return; }
    const coupon: Coupon = { id: uid(), code: couponCode.trim().toUpperCase(), percentage: Number(couponPct), valid_until: couponValid, is_active: true, created_at: isoNow() };
    await supabase.from('promo_coupons').insert(coupon);
    setCouponCode(''); setCouponPct(''); setCouponValid('');
    loadCoupons();
    toast('Coupon created', 'success');
  };

  const toggleCoupon = async (id: string, current: boolean) => {
    await supabase.from('promo_coupons').update({ is_active: !current }).eq('id', id);
    loadCoupons();
  };

  const deleteCoupon = async (id: string) => {
    await supabase.from('promo_coupons').delete().eq('id', id);
    loadCoupons();
    toast('Coupon deleted', 'info');
  };

  const addBroadcast = async () => {
    if (!broadcastTitle.trim()) { toast('Broadcast title is required', 'error'); return; }
    const bc: Broadcast = { id: uid(), title: broadcastTitle.trim(), category: broadcastCategory, message: broadcastMessage.trim(), created_at: isoNow() };
    await supabase.from('promo_broadcasts').insert(bc);
    setBroadcastTitle(''); setBroadcastCategory('all'); setBroadcastMessage('');
    loadBroadcasts();
    toast('Broadcast sent', 'success');
  };

  const deleteBroadcast = async (id: string) => {
    await supabase.from('promo_broadcasts').delete().eq('id', id);
    loadBroadcasts();
    toast('Broadcast deleted', 'info');
  };

  const toggleAd = async (ad: PromoAd) => {
    await supabase.from('promo_ads').update({ is_active: !ad.is_active }).eq('id', ad.id);
    loadPromoAds();
  };

  const deleteAd = async (id: string) => {
    await supabase.from('promo_ads').delete().eq('id', id);
    loadPromoAds();
    toast('Promo ad deleted', 'info');
  };

  const sections: { key: Section; label: string; icon: typeof Megaphone }[] = [
    { key: 'banners', label: 'Announcement Banners', icon: Megaphone },
    { key: 'popups', label: 'In-App Popups', icon: Bell },
    { key: 'coupons', label: 'Discount Coupons', icon: Tag },
    { key: 'broadcasts', label: 'Broadcast Notifications', icon: Send },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Promo &amp; Marketing</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Manage banners, popups, coupons, broadcasts, and promo ads</p>
      </div>

      {/* Section tabs */}
      <div className="flex flex-wrap gap-2">
        {sections.map((s) => {
          const Icon = s.icon;
          const active = section === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-amber-500 text-slate-900'
                  : 'border border-slate-200 text-slate-600 hover:bg-amber-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5'
              }`}
            >
              <Icon className="h-4 w-4" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* BANNERS */}
      {section === 'banners' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Megaphone className="h-4 w-4 text-amber-500" /> Create Announcement Banner
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Banner Text" className="sm:col-span-2">
                <input value={bannerText} onChange={(e) => setBannerText(e.target.value)} className={inputClass} placeholder="e.g., Monsoon Wedding Offer — 20% off!" />
              </Field>
              <Field label="Link (optional)">
                <input value={bannerLink} onChange={(e) => setBannerLink(e.target.value)} className={inputClass} placeholder="https://..." />
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={addBanner} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-amber-400">
                <Plus className="h-4 w-4" /> Add Banner
              </button>
            </div>
          </div>

          {banners.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No banners yet. Create one above.</p>
          ) : (
            <div className="space-y-2">
              {banners.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{b.text}</p>
                    {b.link && <p className="mt-0.5 truncate text-xs text-slate-400">{b.link}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleBanner(b.id, b.is_active)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${b.is_active ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 text-slate-400 dark:bg-white/5'}`}>
                      {b.is_active ? 'Active' : 'Inactive'}
                    </button>
                    <button onClick={() => deleteBanner(b.id)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* POPUPS */}
      {section === 'popups' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Bell className="h-4 w-4 text-amber-500" /> Create In-App Popup
            </h2>
            <div className="space-y-3">
              <Field label="Popup Title">
                <input value={popupTitle} onChange={(e) => setPopupTitle(e.target.value)} className={inputClass} placeholder="e.g., Festive Season Special" />
              </Field>
              <Field label="Popup Message">
                <textarea value={popupMessage} onChange={(e) => setPopupMessage(e.target.value)} className={`${inputClass} min-h-[80px]`} placeholder="Popup message content..." />
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={addPopup} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-amber-400">
                <Plus className="h-4 w-4" /> Add Popup
              </button>
            </div>
          </div>

          {popups.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No popups yet.</p>
          ) : (
            <div className="space-y-2">
              {popups.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{p.title}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">{p.message}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => togglePopup(p.id, p.is_active)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${p.is_active ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 text-slate-400 dark:bg-white/5'}`}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </button>
                    <button onClick={() => deletePopup(p.id)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* COUPONS */}
      {section === 'coupons' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Tag className="h-4 w-4 text-amber-500" /> Create Discount Coupon
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Coupon Code">
                <input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} className={`${inputClass} font-mono`} placeholder="MONSOON20" />
              </Field>
              <Field label="Discount %">
                <input type="number" value={couponPct} onChange={(e) => setCouponPct(e.target.value)} className={inputClass} placeholder="20" min="1" max="100" />
              </Field>
              <Field label="Valid Until">
                <input type="date" value={couponValid} onChange={(e) => setCouponValid(e.target.value)} className={inputClass} />
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={addCoupon} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-amber-400">
                <Plus className="h-4 w-4" /> Add Coupon
              </button>
            </div>
          </div>

          {coupons.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No coupons yet.</p>
          ) : (
            <div className="space-y-2">
              {coupons.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                      <Tag className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">{c.code}</p>
                      <p className="text-xs text-slate-400">{c.percentage}% off{c.valid_until ? ` · valid until ${c.valid_until}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleCoupon(c.id, c.is_active)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${c.is_active ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 text-slate-400 dark:bg-white/5'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </button>
                    <button onClick={() => deleteCoupon(c.id)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* BROADCASTS */}
      {section === 'broadcasts' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Send className="h-4 w-4 text-amber-500" /> Send Broadcast Notification
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Broadcast Title">
                  <input value={broadcastTitle} onChange={(e) => setBroadcastTitle(e.target.value)} className={inputClass} placeholder="e.g., New Service Launch" />
                </Field>
                <Field label="Target Category">
                  <select value={broadcastCategory} onChange={(e) => setBroadcastCategory(e.target.value)} className={inputClass}>
                    <option value="all">All Users</option>
                    <option value="clients">Clients Only</option>
                    <option value="partners">Partners Only</option>
                  </select>
                </Field>
              </div>
              <Field label="Message">
                <textarea value={broadcastMessage} onChange={(e) => setBroadcastMessage(e.target.value)} className={`${inputClass} min-h-[80px]`} placeholder="Broadcast message..." />
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={addBroadcast} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-amber-400">
                <Send className="h-4 w-4" /> Send Broadcast
              </button>
            </div>
          </div>

          {broadcasts.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No broadcasts sent yet.</p>
          ) : (
            <div className="space-y-2">
              {broadcasts.map((b) => (
                <div key={b.id} className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{b.title}</p>
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">{b.category}</span>
                    </div>
                    {b.message && <p className="mt-1 text-xs text-slate-400">{b.message}</p>}
                  </div>
                  <button onClick={() => deleteBroadcast(b.id)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PROMO ADS (existing) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <ImageIcon className="h-4 w-4 text-amber-500" /> Promo Ad Cards
          </h2>
          <button
            onClick={() => { setEditingAd(null); setShowAdForm(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
          >
            <Plus className="h-3.5 w-3.5" /> New Ad
          </button>
        </div>
        {promoAds.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No promo ads yet. Click "New Ad" to create one.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {promoAds.map((ad) => (
              <div key={ad.id} className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
                {ad.image_url && <img src={ad.image_url} alt={ad.title} className="h-32 w-full object-cover" />}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{ad.title}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">{ad.description}</p>
                      <p className="mt-1 text-[10px] text-slate-400">Audience: {ad.audience}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => toggleAd(ad)} className={`rounded p-1 ${ad.is_active ? 'text-emerald-500' : 'text-slate-400'}`} title={ad.is_active ? 'Active' : 'Inactive'}>
                        {ad.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                      <button onClick={() => { setEditingAd(ad); setShowAdForm(true); }} className="rounded p-1 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => deleteAd(ad.id)} className="rounded p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdForm && (
        <PromoAdForm
          open={showAdForm}
          onClose={() => { setShowAdForm(false); setEditingAd(null); }}
          onSaved={() => { setShowAdForm(false); setEditingAd(null); loadPromoAds(); }}
          editing={editingAd}
          toast={toast}
        />
      )}
    </div>
  );
}

function PromoAdForm({ open, onClose, onSaved, editing, toast }: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing: PromoAd | null;
  toast: (msg: string, type: 'success' | 'error' | 'info') => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [actionLink, setActionLink] = useState('');
  const [audience, setAudience] = useState<PromoAdAudience>('clients');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description);
      setImageUrl(editing.image_url);
      setActionLink(editing.action_link);
      setAudience(editing.audience);
      setIsActive(editing.is_active);
    } else {
      setTitle(''); setDescription(''); setImageUrl(''); setActionLink(''); setAudience('clients'); setIsActive(true);
    }
  }, [open, editing]);

  const handleSave = async () => {
    if (!title.trim()) { toast('Title is required', 'error'); return; }
    setSaving(true);
    const payload = { title: title.trim(), description: description.trim(), image_url: imageUrl.trim(), action_link: actionLink.trim(), audience, is_active: isActive };
    if (editing) {
      const { error } = await supabase.from('promo_ads').update(payload).eq('id', editing.id);
      if (error) { toast('Failed to update promo', 'error'); setSaving(false); return; }
      toast('Promo updated', 'success');
    } else {
      const { error } = await supabase.from('promo_ads').insert(payload);
      if (error) { toast('Failed to create promo', 'error'); setSaving(false); return; }
      toast('Promo created', 'success');
    }
    setSaving(false);
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Promo' : 'New Promo'} size="md" dismissible={false}>
      <div className="space-y-4">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g., Monsoon Wedding Offer 2026" />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} min-h-[80px]`} placeholder="Promo description..." />
        </Field>
        <Field label="Image / Footage URL">
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={inputClass} placeholder="https://example.com/promo-image.jpg" />
        </Field>
        <Field label="Action Link (optional)">
          <input value={actionLink} onChange={(e) => setActionLink(e.target.value)} className={inputClass} placeholder="https://example.com/offer" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Target Audience">
            <select value={audience} onChange={(e) => setAudience(e.target.value as PromoAdAudience)} className={inputClass}>
              <option value="clients">Clients Only</option>
              <option value="partners">Lab/Partners Only</option>
            </select>
          </Field>
          <Field label="Status">
            <select value={isActive ? 'active' : 'inactive'} onChange={(e) => setIsActive(e.target.value === 'active')} className={inputClass}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-amber-400 disabled:opacity-50">
            {saving ? <Sparkles className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Promo'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
