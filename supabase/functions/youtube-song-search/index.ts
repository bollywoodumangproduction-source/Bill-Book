import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const youtubeApiKey = Deno.env.get('YOUTUBE_API_KEY');
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

  let query = '';
  try {
    const body = await request.json();
    query = typeof body?.query === 'string' ? body.query.trim().slice(0, 200) : '';
  } catch {
    return respond(request, { error: 'Invalid search request.' }, 400);
  }
  if (query.length < 2) return respond(request, { error: 'Enter at least two characters to search.' }, 400);

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
  return respond(request, { results });
});
