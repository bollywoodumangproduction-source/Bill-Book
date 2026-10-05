import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const encoder = new TextEncoder();
const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const pepper = Deno.env.get('PORTAL_PIN_PEPPER')!;
const origins = (Deno.env.get('ALLOWED_APP_ORIGINS') || 'https://bollywood-umang.vercel.app,http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean);
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function response(request: Request, body: unknown, status = 200) {
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

async function hmac(value: string) {
  if (!pepper) throw new Error('Public share security secret is not configured.');
  const key = await crypto.subtle.importKey('raw', encoder.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sameString(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function safeBooking(row: Record<string, unknown> | null) {
  if (!row) return null;
  const publicFields = [
    'id', 'booking_no', 'client_name', 'client_mobile', 'client_address',
    'bride_name', 'bride_mobile', 'event_function', 'shoot_date', 'venue',
    'booking_status', 'base_amount', 'total_amount', 'discount', 'advance_paid',
    'deliverables_data', 'events', 'is_dual_side', 'work_status',
  ];
  return Object.fromEntries(publicFields.filter((field) => field in row).map((field) => [field, row[field]]));
}

function safeTeaser(project: Record<string, any>, booking: Record<string, any> | null) {
  const amounts = booking
    ? [booking.total_amount, booking.discount, booking.advance_paid].map(Number)
    : [];
  const balanceKnown = amounts.length === 3 && amounts.every(Number.isFinite);
  const due = balanceKnown ? Math.max(0, amounts[0] - amounts[1] - amounts[2]) : Number.POSITIVE_INFINITY;
  return {
    id: project.id,
    client_name: project.client_name,
    status: project.status,
    video_url: project.video_url,
    watermark_text: project.watermark_text,
    drive_url: !booking || due <= 0 ? project.drive_url : null,
  };
}

function safeInvitation(project: Record<string, any>) {
  return Object.fromEntries(
    ['id', 'groom_name', 'bride_name', 'client_name', 'event_date', 'video_url', 'pdf_url', 'venue_url']
      .filter((field) => field in project)
      .map((field) => [field, project[field]]),
  );
}

function safeMusicProject(project: Record<string, any>) {
  return { id: project.id, client_name: project.client_name, mode: project.mode, status: project.status };
}

function safeMusicCue(cue: Record<string, any>) {
  return Object.fromEntries(
    ['id', 'project_id', 'category', 'track_title', 'track_url', 'start_time', 'usage_notes', 'priority', 'created_at']
      .filter((field) => field in cue)
      .map((field) => [field, cue[field]]),
  );
}

function photoSession(row: Record<string, any>) {
  return {
    id: row.id,
    billId: row.bill_id,
    clientName: row.client_name,
    partnerName: row.partner_name ?? '',
    partnerId: row.partner_id ?? undefined,
    labOrderNo: row.lab_order_no ?? undefined,
    phone: row.phone,
    pinCode: '',
    clientType: row.client_type,
    packageSheets: row.package_sheets,
    extraSheetRate: row.extra_sheet_rate,
    total_sheets: row.total_sheets,
    extra_sheets: row.extra_sheets,
    extra_amount: row.extra_amount,
    isLocked: row.is_locked,
    pdfDownloadAllowed: row.pdf_download_allowed,
    shareableUrl: row.shareable_url,
    folders: row.folders ?? [],
    photos: row.photos ?? [],
    proofSheets: row.proof_sheets ?? [],
    submitted_at: row.submitted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getPhoto(sessionId: string, pin: string) {
  const { data: row, error } = await db.from('photo_selection_sessions').select('*').eq('id', sessionId).maybeSingle();
  if (error || !row) return { error: 'Selection link not found.' };
  const provided = await hmac(`photo:${sessionId}:${pin}`);
  const expected = await hmac(`photo:${sessionId}:${String(row.pin_code ?? '')}`);
  if (!sameString(provided, expected)) return { error: 'Incorrect PIN. Please check and try again.' };
  let partner: Record<string, unknown> | null = null;
  if (row.partner_id) {
    const { data } = await db.from('partners').select('id,name,studio_name,logo_url').eq('id', row.partner_id).maybeSingle();
    partner = data;
  } else if (row.partner_name) {
    const { data } = await db.from('partners').select('id,name,studio_name,logo_url').eq('name', row.partner_name).maybeSingle();
    partner = data;
  }
  return { session: photoSession(row), partner };
}

async function rateLimit(request: Request, sessionId: string) {
  await db.from('portal_auth_attempts').delete().lt('attempted_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const ip = request.headers.get('cf-connecting-ip')?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const identifierHash = await hmac(`photo-session:${sessionId}`);
  // Keep unknown-IP traffic isolated per gallery instead of locking galleries
  // for every visitor when the hosting proxy omits forwarding headers.
  const ipHash = await hmac(ip === 'unknown' ? `photo-ip:unknown:${identifierHash}` : `photo-ip:${ip}`);
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [sessionAttempts, ipAttempts] = await Promise.all([
    db.from('portal_auth_attempts').select('id', { count: 'exact', head: true })
      .eq('identifier_hash', identifierHash).gte('attempted_at', since).eq('succeeded', false),
    ip === 'unknown'
      ? Promise.resolve({ count: 0, error: null })
      : db.from('portal_auth_attempts').select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash).gte('attempted_at', since).eq('succeeded', false),
  ]);
  if (sessionAttempts.error) throw sessionAttempts.error;
  if (ipAttempts.error) throw ipAttempts.error;
  return {
    identifierHash,
    ipHash,
    blocked: (sessionAttempts.count ?? 0) >= 5 || (ipAttempts.count ?? 0) >= 60,
  };
}

async function verifyPhoto(request: Request, sessionId: string, pin: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !/^\d{4}$/.test(pin)) return response(request, { error: 'Enter the 4-digit gallery PIN.' }, 400);
  const rate = await rateLimit(request, sessionId);
  if (rate.blocked) return response(request, { error: 'Too many attempts. Wait 15 minutes and try again.' }, 429);
  const result = await getPhoto(sessionId, pin);
  if (result.error) {
    await db.from('portal_auth_attempts').insert({ identifier_hash: rate.identifierHash, ip_hash: rate.ipHash, succeeded: false });
    return response(request, result, 401);
  }
  await db.from('portal_auth_attempts').insert({ identifier_hash: rate.identifierHash, ip_hash: rate.ipHash, succeeded: true });
  return response(request, result);
}

async function withPhotoPin(request: Request, body: Record<string, unknown>, action: 'update' | 'submit') {
  const sessionId = String(body.sessionId ?? '');
  const pin = String(body.pin ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !/^\d{4}$/.test(pin)) return response(request, { error: 'Gallery access could not be verified.' }, 401);
  const rate = await rateLimit(request, sessionId);
  if (rate.blocked) return response(request, { error: 'Too many attempts. Wait 15 minutes and try again.' }, 429);
  const result = await getPhoto(sessionId, pin);
  if (result.error || !result.session) {
    await db.from('portal_auth_attempts').insert({ identifier_hash: rate.identifierHash, ip_hash: rate.ipHash, succeeded: false });
    return response(request, { error: 'Gallery access could not be verified.' }, 401);
  }
  if (result.session.isLocked) return response(request, { error: 'This gallery is locked.' }, 403);
  if (action === 'update') {
    if (!Array.isArray(body.photos) || body.photos.length > 50000) return response(request, { error: 'Invalid photo selection.' }, 400);
    const { data, error } = await db.from('photo_selection_sessions').update({ photos: body.photos, updated_at: new Date().toISOString() }).eq('id', sessionId).eq('is_locked', false).select('*').maybeSingle();
    if (error || !data) return response(request, { error: 'Could not save your selection.' }, 409);
    return response(request, { session: photoSession(data) });
  }
  const submittedAt = new Date().toISOString();
  const { data, error } = await db.from('photo_selection_sessions').update({ is_locked: true, submitted_at: submittedAt, updated_at: submittedAt }).eq('id', sessionId).eq('is_locked', false).select('*').maybeSingle();
  if (error || !data) return response(request, { error: 'Could not submit your selection.' }, 409);
  return response(request, { session: photoSession(data) });
}

async function handle(request: Request, body: Record<string, unknown>) {
  const action = String(body.action ?? '');
  const id = String(body.id ?? '');
  if (action === 'photo-check') {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return response(request, { exists: false });
    const { data } = await db.from('photo_selection_sessions').select('id').eq('id', id).maybeSingle();
    return response(request, { exists: !!data });
  }
  if (action === 'photo-verify') return await verifyPhoto(request, id, String(body.pin ?? ''));
  if (action === 'photo-update') return await withPhotoPin(request, body, 'update');
  if (action === 'photo-submit') return await withPhotoPin(request, body, 'submit');

  if (action === 'invoice') {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return response(request, { error: 'Invoice not found.' }, 404);
    const { data, error } = await db.from('bookings').select('*').eq('id', id).maybeSingle();
    return !error && data ? response(request, { booking: safeBooking(data) }) : response(request, { error: 'Invoice not found.' }, 404);
  }
  if (action === 'teaser' || action === 'invitation') {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return response(request, { error: 'Project not found.' }, 404);
    const table = action === 'teaser' ? 'teaser_projects' : 'invitation_projects';
    const { data, error } = await db.from(table).select('*').eq('id', id).maybeSingle();
    if (error || !data) return response(request, { error: 'Project not found.' }, 404);
    const { data: booking } = data.booking_id ? await db.from('bookings').select('*').eq('id', data.booking_id).maybeSingle() : { data: null };
    return response(request, action === 'teaser'
      ? { project: safeTeaser(data, booking), booking: safeBooking(booking) }
      : { project: safeInvitation(data) });
  }
  if (action === 'music-read') {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return response(request, { error: 'Music project not found.' }, 404);
    const { data: project, error } = await db.from('music_projects').select('*').eq('id', id).maybeSingle();
    if (error || !project) return response(request, { error: 'Music project not found.' }, 404);
    const { data: cues } = await db.from('music_cues').select('*').eq('project_id', id).order('created_at');
    return response(request, { project: safeMusicProject(project), cues: (cues ?? []).map(safeMusicCue) });
  }
  if (action === 'music-add-cue') {
    const projectId = String(body.projectId ?? '');
    const cue = body.cue as Record<string, unknown> | null;
    const { data: project } = await db.from('music_projects').select('id,status').eq('id', projectId).maybeSingle();
    if (!project || project.status === 'locked') return response(request, { error: 'Music choices are locked.' }, 403);
    if (!cue || !String(cue.track_title ?? '').trim()) return response(request, { error: 'Enter a song title.' }, 400);
    const { data, error } = await db.from('music_cues').insert({
      project_id: projectId,
      category: String(cue.category ?? 'Teaser'),
      track_title: String(cue.track_title).slice(0, 300),
      track_url: String(cue.track_url ?? '').slice(0, 2000),
      start_time: String(cue.start_time ?? '').slice(0, 100),
      usage_notes: String(cue.usage_notes ?? '').slice(0, 3000),
      priority: ['must_use', 'preferred', 'reference'].includes(String(cue.priority)) ? cue.priority : 'preferred',
    }).select('*').single();
    if (error) return response(request, { error: 'Could not save this song choice.' }, 500);
    return response(request, { cue: data });
  }
  if (action === 'music-submit') {
    const projectId = String(body.projectId ?? '');
    const { data: project } = await db.from('music_projects').select('id,status').eq('id', projectId).maybeSingle();
    if (!project) return response(request, { error: 'Music project not found.' }, 404);
    const { error } = await db.from('music_projects').update({ status: 'locked', locked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', projectId).neq('status', 'locked');
    if (error) return response(request, { error: 'Could not submit music selection.' }, 500);
    return response(request, { success: true });
  }
  return response(request, { error: 'Unsupported public-share action.' }, 400);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return response(request, { ok: true });
  if (request.method !== 'POST') return response(request, { error: 'Method not allowed.' }, 405);
  if (!url || !serviceKey || !pepper) return response(request, { error: 'Public-share API is not configured on the server.' }, 503);
  try {
    return await handle(request, await request.json() as Record<string, unknown>);
  } catch (error) {
    console.error('public-share request failed:', error instanceof Error ? error.message : 'unknown error');
    return response(request, { error: 'Could not load this shared page.' }, 500);
  }
});
