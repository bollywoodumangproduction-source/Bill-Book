const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type PcloudVariant = {
  path?: string;
  hosts?: string[];
  width?: number;
  height?: number;
  isoriginal?: boolean;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { url: sharedUrl } = await request.json();
    if (typeof sharedUrl !== 'string' || sharedUrl.length > 2048) {
      return json({ error: 'A valid pCloud video link is required.' }, 400);
    }

    const share = new URL(sharedUrl);
    if (share.protocol !== 'https:' || !/(^|\.)pcloud\.com$|(^|\.)pcloud\.link$/i.test(share.hostname)) {
      return json({ error: 'Only pCloud share links are supported.' }, 400);
    }
    const code = share.searchParams.get('code') ?? share.searchParams.get('shortcode');
    if (!code || !/^[a-zA-Z0-9_-]{3,128}$/.test(code)) {
      return json({ error: 'The pCloud link does not contain a valid share code.' }, 400);
    }

    const apiUrl = new URL('https://api.pcloud.com/getpubvideolinks');
    apiUrl.searchParams.set('code', code);
    apiUrl.searchParams.set('skipfilename', '1');
    const response = await fetch(apiUrl, {
      headers: { Referer: 'https://www.pcloud.com/' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return json({ error: 'pCloud could not prepare the video stream.' }, 502);

    const payload = await response.json();
    if (payload?.result !== 0 || !Array.isArray(payload?.variants)) {
      return json({ error: 'pCloud did not return a playable video stream.' }, 422);
    }

    const variants = (payload.variants as PcloudVariant[])
      .filter((variant) => typeof variant.path === 'string' && variant.path.startsWith('/') && Array.isArray(variant.hosts))
      .sort((a, b) => Number(Boolean(b.isoriginal)) - Number(Boolean(a.isoriginal)) || (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0));

    for (const variant of variants) {
      for (const host of variant.hosts ?? []) {
        if (!/^c\d+\.pcloud\.com$/i.test(host)) continue;
        if (variant.path!.startsWith('//') || variant.path!.includes('\\')) continue;
        const stream = new URL(variant.path!, `https://${host}`);
        if (stream.hostname.toLowerCase() !== host.toLowerCase()) continue;
        if (/\.(?:mp4|webm|ogv|ogg|mov)$/i.test(stream.pathname)) return json({ url: stream.toString() });
      }
    }

    return json({ error: 'pCloud did not provide a browser-playable video format.' }, 422);
  } catch {
    return json({ error: 'Could not resolve this pCloud video link.' }, 400);
  }
});

function json(body: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
