const MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

const encoder = new TextEncoder();

function json(body, status, origin, allowed) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  if (origin && allowed) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function rfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeObjectKey(key) {
  return key.split('/').map(rfc3986).join('/');
}

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmac(key, value) {
  const imported = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', imported, encoder.encode(value));
}

async function sha256(value) {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function presignPut(env, key) {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const canonicalUri = `/${rfc3986(env.BUCKET_NAME)}/${encodeObjectKey(key)}`;
  const params = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${env.R2_ACCESS_KEY_ID}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': '300',
    'X-Amz-SignedHeaders': 'host',
    'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
  };
  const canonicalQuery = Object.entries(params)
    .map(([name, value]) => [rfc3986(name), rfc3986(value)])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
  const canonicalRequest = ['PUT', canonicalUri, canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonicalRequest)].join('\n');
  const dateKey = await hmac(encoder.encode(`AWS4${env.R2_SECRET_ACCESS_KEY}`), dateStamp);
  const regionKey = await hmac(dateKey, 'auto');
  const serviceKey = await hmac(regionKey, 's3');
  const signingKey = await hmac(serviceKey, 'aws4_request');
  const signature = toHex(await hmac(signingKey, stringToSign));
  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function canonicalQueryString(entries) {
  return [...entries]
    .map(([name, value]) => [rfc3986(name), rfc3986(value)])
    .sort(([leftName, leftValue], [rightName, rightValue]) => leftName.localeCompare(rightName) || leftValue.localeCompare(rightValue))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
}

async function signedR2Request(env, method, canonicalUri, queryEntries = [], body = '') {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const payloadHash = await sha256(body);
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';
  const canonicalQuery = canonicalQueryString(queryEntries);
  const canonicalRequest = [method, canonicalUri, canonicalQuery, `${canonicalHeaders}${signedHeaders}`, payloadHash].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonicalRequest)].join('\n');
  const dateKey = await hmac(encoder.encode(`AWS4${env.R2_SECRET_ACCESS_KEY}`), dateStamp);
  const regionKey = await hmac(dateKey, 'auto');
  const serviceKey = await hmac(regionKey, 's3');
  const signingKey = await hmac(serviceKey, 'aws4_request');
  const signature = toHex(await hmac(signingKey, stringToSign));
  const url = `https://${host}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ''}`;
  const headers = {
    Authorization: `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (body) headers['Content-Type'] = 'application/xml';
  return fetch(url, { method, headers, ...(body ? { body } : {}) });
}

function decodeXml(value) {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function xmlTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? decodeXml(match[1]) : '';
}

async function listR2Keys(env, prefix) {
  const path = `/${rfc3986(env.BUCKET_NAME)}`;
  const keys = [];
  let continuationToken = '';
  do {
    const query = [['list-type', '2'], ['max-keys', '1000'], ['prefix', prefix]];
    if (continuationToken) query.push(['continuation-token', continuationToken]);
    const response = await signedR2Request(env, 'GET', path, query);
    if (!response.ok) throw new Error('R2 could not list this session’s images.');
    const xml = await response.text();
    for (const match of xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)) keys.push(decodeXml(match[1]));
    const truncated = xmlTag(xml, 'IsTruncated') === 'true';
    continuationToken = truncated ? xmlTag(xml, 'NextContinuationToken') : '';
    if (truncated && !continuationToken) throw new Error('R2 returned an incomplete image list.');
  } while (continuationToken);
  return keys;
}

async function deleteR2Keys(env, keys) {
  let deleted = 0;
  for (let index = 0; index < keys.length; index += 1000) {
    const batch = keys.slice(index, index + 1000);
    const body = `<Delete><Quiet>true</Quiet>${batch.map((key) => `<Object><Key>${key.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Key></Object>`).join('')}</Delete>`;
    const response = await signedR2Request(env, 'POST', `/${rfc3986(env.BUCKET_NAME)}`, [['delete', '']], body);
    const result = await response.text();
    if (!response.ok || /<Error>/.test(result)) throw new Error('R2 could not permanently delete every session image.');
    deleted += batch.length;
  }
  return deleted;
}

async function deletePhotoSessionAssets(env, sessionId, supabaseUrl, apiKey, token, origin, allowed) {
  const sessionUrl = new URL(`${supabaseUrl}/rest/v1/photo_selection_sessions`);
  sessionUrl.searchParams.set('id', `eq.${sessionId}`);
  sessionUrl.searchParams.set('select', 'id');
  const sessionResponse = await fetch(sessionUrl, {
    headers: { apikey: apiKey, Authorization: `Bearer ${token}` },
  });
  if (!sessionResponse.ok) return json({ error: 'Could not validate the Photo Selection session.' }, 503, origin, allowed);
  const sessions = await sessionResponse.json();
  if (!sessions.some((session) => session.id === sessionId)) return json({ error: 'Photo Selection session was not found.' }, 404, origin, allowed);

  const prefixes = [`photo-selection/${sessionId}/`, `photo-selection-proof/${sessionId}/`];
  const keys = [];
  for (const prefix of prefixes) keys.push(...await listR2Keys(env, prefix));
  const deletedObjects = await deleteR2Keys(env, keys);
  return json({ deletedObjects }, 200, origin, allowed);
}

function safeFolder(value) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.length > 100) return null;
  const parts = value.split('/').map((part) => part.trim().replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '-'));
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  return parts.join('/');
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowedOrigins = new Set(env.ALLOWED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean));
    const allowed = Boolean(origin && allowedOrigins.has(origin));

    if (request.method === 'OPTIONS') {
      if (!allowed) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        },
      });
    }
    if (!allowed) return json({ error: 'Origin not allowed.' }, 403, origin, allowed);
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, origin, allowed);

    const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json({ error: 'Administrator sign-in is required.' }, 401, origin, allowed);

    let action = 'upload';
    try {
      const baseUrl = env.SUPABASE_URL.replace(/\/$/, '');
      // Prefer the same public key that the app uses. This avoids auth
      // failures if the Worker's optional fallback key drifts from Vercel.
      const supabaseApiKey = request.headers.get('apikey') || env.SUPABASE_ANON_KEY;
      if (!supabaseApiKey) return json({ error: 'Supabase authentication is not configured for uploads.' }, 503, origin, allowed);
      const userResponse = await fetch(`${baseUrl}/auth/v1/user`, {
        headers: { apikey: supabaseApiKey, Authorization: `Bearer ${token}` },
      });
      if (!userResponse.ok) return json({ error: 'Administrator sign-in is required.' }, 401, origin, allowed);
      const user = await userResponse.json();
      if (user.app_metadata?.role !== 'admin') return json({ error: 'Administrator access is required.' }, 403, origin, allowed);

      const body = await request.json();
      action = body.action || 'upload';
      if (action === 'delete-session') {
        const sessionId = body.sessionId;
        if (typeof sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
          return json({ error: 'A valid Photo Selection session is required.' }, 400, origin, allowed);
        }
        return await deletePhotoSessionAssets(env, sessionId, baseUrl, supabaseApiKey, token, origin, allowed);
      }
      if (action !== 'upload') return json({ error: 'Unsupported Photo Selection upload action.' }, 400, origin, allowed);
      const { purpose, sessionId, fileSize, contentType } = body;
      if (purpose !== 'photo-selection' && purpose !== 'photo-selection-proof') {
        return json({ error: 'Only Photo Selection images can be uploaded here.' }, 400, origin, allowed);
      }
      if (typeof sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
        return json({ error: 'A valid Photo Selection session is required.' }, 400, origin, allowed);
      }
      if (typeof contentType !== 'string' || !MIME_EXTENSIONS[contentType]) {
        return json({ error: 'Choose a supported image (JPG, PNG, WebP, AVIF, or GIF).' }, 400, origin, allowed);
      }
      const maxBytes = Number(env.MAX_UPLOAD_BYTES || 104857600);
      if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > maxBytes) {
        return json({ error: 'Image is larger than the upload limit.' }, 400, origin, allowed);
      }
      const folder = safeFolder(body.folder);
      if (folder === null) return json({ error: 'Folder name is invalid.' }, 400, origin, allowed);

      const sessionUrl = new URL(`${baseUrl}/rest/v1/photo_selection_sessions`);
      sessionUrl.searchParams.set('id', `eq.${sessionId}`);
      sessionUrl.searchParams.set('select', 'id');
      const sessionResponse = await fetch(sessionUrl, {
        headers: { apikey: supabaseApiKey, Authorization: `Bearer ${token}` },
      });
      if (!sessionResponse.ok) return json({ error: 'Could not validate the Photo Selection session.' }, 503, origin, allowed);
      const sessions = await sessionResponse.json();
      if (!sessions.some((session) => session.id === sessionId)) return json({ error: 'Photo Selection session was not found.' }, 404, origin, allowed);

      const keyParts = [purpose, sessionId, folder].filter(Boolean);
      keyParts.push(`${crypto.randomUUID()}.${MIME_EXTENSIONS[contentType]}`);
      const key = keyParts.join('/');
      const publicBase = env.R2_PUBLIC_BASE_URL.replace(/\/$/, '');
      const publicUrl = `${publicBase}/${encodeObjectKey(key)}`;
      const uploadUrl = await presignPut(env, key);
      return json({ uploadUrl, publicUrl, previewUrl: publicUrl, method: 'PUT', headers: { 'Content-Type': contentType } }, 200, origin, allowed);
    } catch (error) {
      const message = action === 'delete-session' && error instanceof Error
        ? error.message
        : 'Could not prepare the secure image upload.';
      return json({ error: message }, action === 'delete-session' ? 500 : 400, origin, allowed);
    }
  },
};
