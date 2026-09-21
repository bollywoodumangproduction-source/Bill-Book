import type { PromoAd, PromoAdAudience, PromoPlacement, PromoTargetScope } from '@/lib/types';

export function getPromoPlacementForAudience(ad: Partial<PromoAd> | null | undefined, audience: PromoAdAudience, fallback: PromoPlacement): PromoPlacement {
  const placement = ad?.placement as PromoPlacement | undefined;
  if (placement === 'b2c_landing' || placement === 'b2c_dashboard' || placement === 'b2b_landing' || placement === 'b2b_dashboard') {
    return placement;
  }
  return audience === 'clients' ? (fallback === 'b2c_landing' ? 'b2c_landing' : 'b2c_dashboard') : (fallback === 'b2b_landing' ? 'b2b_landing' : 'b2b_dashboard');
}

function toDateValue(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isPromoWithinValidity(ad: PromoAd): boolean {
  const now = new Date();
  const start = toDateValue(ad.start_date);
  const end = toDateValue(ad.end_date);
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

export function promoMatchesIdentity(ad: PromoAd, audience: PromoAdAudience, currentUserId?: string | null): boolean {
  const targetScope: PromoTargetScope = ad.target_scope ?? 'all';
  if (targetScope === 'all') return true;
  if (!currentUserId) return false;
  if (audience === 'clients') {
    return (ad.client_id ?? null) === currentUserId;
  }
  return (ad.partner_id ?? null) === currentUserId;
}

export function getVisiblePromoAds(
  ads: PromoAd[],
  placement: PromoPlacement,
  audience: PromoAdAudience,
  currentUserId?: string | null,
): PromoAd[] {
  return (ads ?? [])
    .filter((ad) => Boolean(ad.is_active))
    .filter((ad) => getPromoPlacementForAudience(ad, audience, placement) === placement)
    .filter((ad) => ad.audience === audience)
    .filter((ad) => isPromoWithinValidity(ad))
    .filter((ad) => promoMatchesIdentity(ad, audience, currentUserId));
}

export function parseSlideImages(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}
