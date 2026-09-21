import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Camera, ChevronRight, Clock3, Image as ImageIcon, LogIn, PlayCircle, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import { getVisiblePromoAds } from '@/lib/promo';
import type { PromoAd } from '@/lib/types';

function useLandingPromos(audience: 'clients' | 'partners', placement: 'b2c_landing' | 'b2b_landing') {
  const [ads, setAds] = useState<PromoAd[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from('promo_ads').select('*').eq('is_active', true).eq('audience', audience).order('sort_order');
      if (cancelled) return;
      const visible = getVisiblePromoAds((data ?? []) as PromoAd[], placement, audience);
      setAds(visible);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [audience, placement]);

  return ads;
}

function PromoMedia({ ad }: { ad: PromoAd }) {
  const slides = ad.slide_images && ad.slide_images.length > 0 ? ad.slide_images : (ad.image_url ? [ad.image_url] : []);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, Math.max(2000, ad.slideshow_duration ?? 5000));
    return () => window.clearInterval(id);
  }, [ad.slideshow_duration, slides.length]);

  if (ad.video_url) {
    return (
      <a href={ad.video_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
        <div className="relative">
          <img src={ad.video_thumbnail_url || slides[0] || ad.background_image_url || ''} alt={ad.title} className="h-72 w-full object-cover opacity-90" />
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/30">
            <PlayCircle className="h-14 w-14 text-white drop-shadow" />
          </div>
        </div>
      </a>
    );
  }

  if (slides.length > 0) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
        <img src={slides[index]} alt={ad.title} className="h-72 w-full object-cover" />
        {slides.length > 1 && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 bg-gradient-to-t from-slate-950/70 to-transparent p-3">
            {slides.map((_, i) => (
              <span key={i} className={`h-1.5 w-8 rounded-full ${i === index ? 'bg-amber-400' : 'bg-white/40'}`} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (ad.background_image_url) {
    return <img src={ad.background_image_url} alt={ad.title} className="h-72 w-full rounded-2xl border border-white/10 object-cover" />;
  }

  return null;
}

function PromoCard({ ad, isCompact = false }: { ad: PromoAd; isCompact?: boolean }) {
  const hasLink = Boolean(ad.action_link || ad.video_url);
  const body = (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 shadow-xl shadow-slate-950/20">
      <PromoMedia ad={ad} />
      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200">Special Offer</span>
          {ad.cta_text && <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{ad.cta_text}</span>}
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">{ad.title}</h3>
          {ad.description && <p className="mt-2 text-sm leading-6 text-slate-300">{ad.description}</p>}
        </div>
        {hasLink && (
          <div className="flex items-center gap-2 text-sm font-medium text-amber-300">
            <span>{ad.cta_text || 'Learn more'}</span>
            <ChevronRight className="h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  );

  if (!hasLink) return body;

  const href = ad.video_url || ad.action_link || '#';
  return (
    <a href={href} target={ad.video_url ? '_blank' : '_self'} rel={ad.video_url ? 'noreferrer' : undefined} className="block transition-transform hover:-translate-y-0.5">
      {body}
    </a>
  );
}

function LandingShell({
  audience,
  pageTitle,
  subTitle,
  loginHref,
  loginLabel,
  accentClass,
}: {
  audience: 'clients' | 'partners';
  pageTitle: string;
  subTitle: string;
  loginHref: string;
  loginLabel: string;
  accentClass: string;
}) {
  const { settings } = useSettings();
  const promos = useLandingPromos(audience, audience === 'clients' ? 'b2c_landing' : 'b2b_landing');

  const heroImage = useMemo(() => {
    if (audience === 'clients') return settings?.films_logo_url || settings?.production_logo_url || '';
    return settings?.production_logo_url || settings?.films_logo_url || '';
  }, [audience, settings]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.12),_transparent_25%),linear-gradient(160deg,#020617_0%,#0f172a_38%,#0f172a_100%)] text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="rounded-[28px] border border-white/10 bg-slate-950/60 px-4 py-4 shadow-[0_20px_60px_rgba(2,6,23,0.45)] backdrop-blur-xl sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {heroImage ? (
                <img src={heroImage} alt="brand" className="h-11 w-11 rounded-2xl object-cover ring-1 ring-white/10" />
              ) : (
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${accentClass}`}>
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
              )}
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">{audience === 'clients' ? 'Client Portal' : 'Partner / Lab Portal'}</p>
                <p className="text-base font-semibold text-white">{settings?.films_title ?? 'Bollywood Umang Films'}</p>
              </div>
            </div>
            <Link to={loginHref} className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/25 transition hover:bg-amber-400">
              <LogIn className="h-4 w-4" />
              {loginLabel}
            </Link>
          </div>
        </header>

        <main className="mt-7 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="overflow-hidden rounded-[30px] border border-white/10 bg-slate-900/70 shadow-[0_24px_80px_rgba(2,6,23,0.6)]">
            <div className="relative overflow-hidden border-b border-white/10">
              {heroImage ? (
                <img src={heroImage} alt="brand banner" className="h-64 w-full object-cover opacity-25" />
              ) : (
                <div className="h-64 w-full bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.28),_transparent_35%),linear-gradient(135deg,#111827_0%,#1f2937_35%,#0f172a_100%)]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/70 to-slate-900/40" />
              <div className="relative space-y-5 p-6 sm:p-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-amber-200">
                  <Camera className="h-3.5 w-3.5" /> {pageTitle}
                </div>
                <div className="max-w-xl space-y-3">
                  <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">{subTitle}</h1>
                  <p className="max-w-lg text-sm leading-7 text-slate-300 sm:text-base">
                    {audience === 'clients'
                      ? 'Access your booking details, payment updates, photo selection, and creative portals from one secure client experience.'
                      : 'Access your team assignments, lab orders, project updates, and financial overview from your dedicated B2B portal.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Link to={loginHref} className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400">
                    {loginLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                    <Clock3 className="h-3.5 w-3.5" /> Secure access
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-5 sm:p-6">
              {promos.length === 0 ? null : (
                <div className="space-y-4">
                  {promos.map((ad) => (
                    <PromoCard key={ad.id} ad={ad} />
                  ))}
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[26px] border border-white/10 bg-slate-900/70 p-5 shadow-[0_20px_60px_rgba(2,6,23,0.5)]">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
                <ImageIcon className="h-4 w-4 text-amber-400" /> Studio Snapshot
              </div>
              <div className="grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Brand</p>
                  <p className="mt-2 text-lg font-semibold text-white">{settings?.films_title ?? 'Studio'}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Support</p>
                  <p className="mt-2 text-sm text-slate-200">{settings?.phone || settings?.studio_call_number || 'Studio contact available on login'}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Access</p>
                  <p className="mt-2 text-sm text-slate-200">{loginLabel}</p>
                </div>
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}

export function ClientLandingPage() {
  return (
    <LandingShell
      audience="clients"
      pageTitle="Client Portal"
      subTitle="Your wedding story starts here."
      loginHref="/client/login"
      loginLabel="Client Login"
      accentClass="bg-gradient-to-br from-amber-500 to-orange-500"
    />
  );
}

export function PartnerLandingPage() {
  return (
    <LandingShell
      audience="partners"
      pageTitle="Partner / Lab Portal"
      subTitle="Your operations, assignments, and delivery flow."
      loginHref="/partner/login"
      loginLabel="Partner / Lab Login"
      accentClass="bg-gradient-to-br from-cyan-500 to-sky-500"
    />
  );
}
