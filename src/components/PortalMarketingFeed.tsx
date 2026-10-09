import { useEffect, useState } from 'react';
import { Bell, ExternalLink, Megaphone, Tag, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { PromoAd } from '@/lib/types';
import { getVisiblePromoAds } from '@/lib/promo';
import { UniversalMediaPreview } from '@/components/UniversalMediaPreview';
import { isSupportedMediaUrl } from '@/lib/mediaResolver';

type PromoAudience = 'clients' | 'partners';
type AudienceValue = 'all' | PromoAudience;

interface PortalBanner {
  id: string;
  text: string;
  link: string;
  audience: AudienceValue;
  is_active: boolean;
}

interface PortalPopup {
  id: string;
  title: string;
  message: string;
  audience: AudienceValue;
  is_active: boolean;
}

interface PortalCoupon {
  id: string;
  code: string;
  percentage: number;
  valid_until: string;
  audience: AudienceValue;
  is_active: boolean;
}

interface PortalBroadcast {
  id: string;
  title: string;
  category: AudienceValue;
  message: string;
}

export function PortalMarketingFeed({ audience, identityId }: { audience: PromoAudience; identityId: string }) {
  const [banners, setBanners] = useState<PortalBanner[]>([]);
  const [popups, setPopups] = useState<PortalPopup[]>([]);
  const [coupons, setCoupons] = useState<PortalCoupon[]>([]);
  const [broadcasts, setBroadcasts] = useState<PortalBroadcast[]>([]);
  const [promoAds, setPromoAds] = useState<PromoAd[]>([]);
  const [dismissedPopupIds, setDismissedPopupIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [bannerResult, popupResult, couponResult, broadcastResult, promoResult] = await Promise.all([
        supabase.from('promo_banners').select('id,text,link,audience,is_active').eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('promo_popups').select('id,title,message,audience,is_active').eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('promo_coupons').select('id,code,percentage,valid_until,audience,is_active').eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('promo_broadcasts').select('id,title,category,message').order('created_at', { ascending: false }).limit(20),
        supabase.from('promo_ads').select('*').eq('is_active', true).eq('audience', audience).order('sort_order'),
      ]);
      if (cancelled) return;
      setBanners((bannerResult.data ?? []) as PortalBanner[]);
      setPopups((popupResult.data ?? []) as PortalPopup[]);
      setCoupons((couponResult.data ?? []) as PortalCoupon[]);
      setBroadcasts((broadcastResult.data ?? []) as PortalBroadcast[]);
      setPromoAds((promoResult.data ?? []) as PromoAd[]);
      const storageKey = `portal-marketing-dismissed:${audience}:${identityId}`;
      try { setDismissedPopupIds(JSON.parse(localStorage.getItem(storageKey) || '[]') as string[]); } catch { setDismissedPopupIds([]); }
    };
    void load();
    const channel = supabase.channel(`portal-marketing-${audience}-${identityId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promo_banners' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promo_popups' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promo_coupons' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promo_broadcasts' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promo_ads' }, () => { void load(); })
      .subscribe();
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [audience, identityId]);

  const visibleBanners = banners.filter((item) => item.audience === 'all' || item.audience === audience);
  const visiblePopups = popups.filter((item) => item.audience === 'all' || item.audience === audience);
  const visibleCoupons = coupons.filter((item) => {
    if (item.audience !== 'all' && item.audience !== audience) return false;
    if (!item.valid_until) return true;
    return new Date(`${item.valid_until}T23:59:59`).getTime() >= Date.now();
  });
  const roleCategory = audience === 'clients' ? 'clients' : 'partners';
  const visibleBroadcasts = broadcasts.filter((item) => item.category === 'all' || item.category === roleCategory);
  const popup = visiblePopups.find((item) => !dismissedPopupIds.includes(item.id));
  const visibleAds = getVisiblePromoAds(promoAds, audience === 'clients' ? 'b2c_dashboard' : 'b2b_dashboard', audience, identityId).slice(0, 3);

  const dismissPopup = () => {
    if (!popup) return;
    const next = [...dismissedPopupIds, popup.id];
    setDismissedPopupIds(next);
    try { localStorage.setItem(`portal-marketing-dismissed:${audience}:${identityId}`, JSON.stringify(next)); } catch { /* Storage is optional. */ }
  };

  if (!visibleBanners.length && !visibleCoupons.length && !visibleBroadcasts.length && !visibleAds.length && !popup) return null;

  return (
    <section className="space-y-3" aria-label="Studio announcements and offers">
      {visibleBanners.map((banner) => (
        <div key={banner.id} className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="min-w-0 flex-1">{banner.text}</p>
          {banner.link && <a href={banner.link} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-amber-300">Open <ExternalLink className="h-3 w-3" /></a>}
        </div>
      ))}

      {visibleBroadcasts.length > 0 && (
        <div className="rounded-xl border border-sky-400/20 bg-sky-500/5 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><Bell className="h-4 w-4 text-sky-400" /> Studio Updates</h2>
          <div className="space-y-2">
            {visibleBroadcasts.map((item) => <article key={item.id} className="rounded-lg border border-white/10 bg-slate-950/40 p-3"><p className="text-sm font-semibold text-white">{item.title}</p>{item.message && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-300">{item.message}</p>}</article>)}
          </div>
        </div>
      )}

      {visibleAds.length > 0 && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><Megaphone className="h-4 w-4 text-amber-400" /> Offers &amp; Add-Ons</h2>
          <div className="grid gap-2 sm:grid-cols-2">{visibleAds.map((ad) => <article key={ad.id} className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/40">{ad.image_url && <img src={ad.image_url} alt={ad.title} className="h-32 w-full object-cover" />}<div className="p-3">{isSupportedMediaUrl(ad.action_link) && <UniversalMediaPreview url={ad.action_link} kind="video" className="mb-3 overflow-hidden rounded-lg bg-black" showDownload />}<p className="text-sm font-semibold text-white">{ad.title}</p>{ad.description && <p className="mt-1 text-xs text-slate-300">{ad.description}</p>}{ad.action_link && <a href={ad.action_link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-300">{ad.cta_text || 'Learn more'} <ExternalLink className="h-3 w-3" /></a>}</div></article>)}</div>
        </div>
      )}

      {visibleCoupons.length > 0 && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><Tag className="h-4 w-4 text-emerald-400" /> Available Coupons</h2>
          <div className="grid gap-2 sm:grid-cols-2">{visibleCoupons.map((coupon) => <article key={coupon.id} className="rounded-lg border border-white/10 bg-slate-950/40 p-3"><p className="font-mono text-sm font-bold text-emerald-300">{coupon.code}</p><p className="mt-1 text-xs text-slate-300">{coupon.percentage}% off{coupon.valid_until ? ` · Valid until ${coupon.valid_until}` : ''}</p></article>)}</div>
        </div>
      )}

      {popup && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby={`portal-popup-${popup.id}`}>
          <div className="w-full max-w-md rounded-2xl border border-amber-400/25 bg-slate-900 p-5 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><Bell className="h-5 w-5 text-amber-400" /><h2 id={`portal-popup-${popup.id}`} className="text-base font-bold">{popup.title}</h2></div><button onClick={dismissPopup} aria-label="Close announcement" className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></div>
            {popup.message && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{popup.message}</p>}
            <button onClick={dismissPopup} className="mt-5 w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950">Got it</button>
          </div>
        </div>
      )}
    </section>
  );
}
