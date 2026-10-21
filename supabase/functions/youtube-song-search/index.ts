import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const youtubeApiKey = Deno.env.get('YOUTUBE_API_KEY');
const YOUTUBE_CACHE_TTL_MS = 5 * 60 * 1000;
const youtubeResponseCache = new Map<string, { expiresAt: number; body: unknown }>();
const origins = (Deno.env.get('ALLOWED_APP_ORIGINS') || 'https://bollywood-umang.vercel.app,http://localhost:5173')
  .split(',').map((origin) => origin.trim()).filter(Boolean);

function respond(request: Request, body: unknown, status = 200) {
  const origin = request.headers.get('origin') || '';
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origins.includes(origin) ? origin : origins[0] || 'null',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
      'Cache-Control': 'no-store',
    },
  });
}

function getYouTubeVideoId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let videoId = '';
    if (host === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0] || '';
    else if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
      videoId = url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)?.[1] || '';
    }
    return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

function getCachedResponse(key: string): unknown | null {
  const cached = youtubeResponseCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    youtubeResponseCache.delete(key);
    return null;
  }
  return cached.body;
}

function cacheResponse(key: string, body: unknown) {
  youtubeResponseCache.set(key, { expiresAt: Date.now() + YOUTUBE_CACHE_TTL_MS, body });
  if (youtubeResponseCache.size > 100) {
    const oldestKey = youtubeResponseCache.keys().next().value;
    if (oldestKey) youtubeResponseCache.delete(oldestKey);
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return respond(request, { ok: true });
  if (request.method !== 'POST') return respond(request, { error: 'Method not allowed.' }, 405);
  if (!youtubeApiKey) return respond(request, { error: 'YouTube search is not configured. Add YOUTUBE_API_KEY to Supabase Edge Function secrets.' }, 503);

  const authorization = request.headers.get('Authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return respond(request, { error: 'Administrator sign-in is required.' }, 401);

  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || user?.app_metadata?.role !== 'admin') return respond(request, { error: 'Administrator access is required.' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return respond(request, { error: 'Invalid search request.' }, 400);
  }

  if (typeof body.url === 'string') {
    const videoId = getYouTubeVideoId(body.url);
    if (!videoId) return respond(request, { error: 'Enter a valid YouTube video link.' }, 400);
    const cacheKey = `video:${videoId}`;
    const cached = getCachedResponse(cacheKey);
    if (cached) return respond(request, cached);
    const params = new URLSearchParams({ part: 'snippet', id: videoId, key: youtubeApiKey });
    const videoResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);
    const payload = await videoResponse.json().catch(() => ({}));
    if (!videoResponse.ok) {
      const reason = payload?.error?.errors?.[0]?.reason;
      const message = reason === 'quotaExceeded'
        ? 'YouTube API daily quota is used up. Try again later.'
        : 'Could not fetch the YouTube title. Check the API key and YouTube Data API v3 setup.';
      return respond(request, { error: message }, videoResponse.status === 403 ? 502 : 503);
    }
    const video = Array.isArray(payload.items) ? payload.items[0] : null;
    if (!video?.snippet?.title) return respond(request, { error: 'YouTube video was not found.' }, 404);
    const result = {
      metadata: {
        videoId,
        title: String(video.snippet.title).slice(0, 300),
        channel: String(video.snippet.channelTitle || '').slice(0, 200),
        url: `https://www.youtube.com/watch?v=${videoId}`,
      },
    };
    cacheResponse(cacheKey, result);
    return respond(request, result);
  }

  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 200) : '';
  if (query.length < 2) return respond(request, { error: 'Enter at least two characters to search.' }, 400);
  const cacheKey = `search:${query.toLocaleLowerCase().replace(/\s+/g, ' ')}`;
  const cached = getCachedResponse(cacheKey);
  if (cached) return respond(request, cached);

  const params = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '10', q: query, key: youtubeApiKey });
  const youtubeResponse = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
  const payload = await youtubeResponse.json().catch(() => ({}));
  if (!youtubeResponse.ok) {
    const reason = payload?.error?.errors?.[0]?.reason;
    const message = reason === 'quotaExceeded'
      ? 'YouTube API daily quota is used up. Try again later.'
      : 'YouTube search failed. Check the API key and YouTube Data API v3 setup.';
    return respond(request, { error: message }, youtubeResponse.status === 403 ? 502 : 503);
  }

  const results = Array.isArray(payload.items) ? payload.items.flatMap((item: any) => {
    const videoId = item?.id?.videoId;
    if (typeof videoId !== 'string' || !videoId) return [];
    return [{
      videoId,
      title: String(item?.snippet?.title || 'Untitled video').slice(0, 300),
      channel: String(item?.snippet?.channelTitle || '').slice(0, 200),
      thumbnail: String(item?.snippet?.thumbnails?.medium?.url || item?.snippet?.thumbnails?.default?.url || ''),
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    }];
  }) : [];
  const result = { results };
  cacheResponse(cacheKey, result);
  return respond(request, result);
});
