import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const encoder = new TextEncoder();
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const pinPepper = Deno.env.get('PORTAL_PIN_PEPPER')!;
const allowedOrigins = (Deno.env.get('ALLOWED_APP_ORIGINS') || 'https://bollywood-umang.vercel.app,http://localhost:5173')
  .split(',').map((origin) => origin.trim()).filter(Boolean);

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const publicAuth = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

type Portal = 'partner' | 'client_booking' | 'client_lab';
type PortalRecord = Record<string, unknown> & { id: string; is_login_allowed?: boolean; status?: string };

function cleanPhone(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '').slice(-10);
}

function json(request: Request, body: unknown, status = 200): Response {
  const origin = request.headers.get('origin') || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || 'null';
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
      'Cache-Control': 'no-store',
    },
  });
}

async function hmacHex(value: string): Promise<string> {
  if (!pinPepper) throw new Error('Portal security secret is not configured.');
  const key = await crypto.subtle.importKey('raw', encoder.encode(pinPepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function pinHash(portal: Portal, id: string, pin: string): Promise<string> {
  return `v1$${await hmacHex(`pin:${portal}:${id}:${pin}`)}`;
}

async function authPassword(portal: Portal, id: string, pin: string): Promise<string> {
  // Keep the existing four-digit PIN at the UI while giving Supabase Auth a
  // high-entropy server-derived password. The pepper never reaches the app.
  return await hmacHex(`auth:${portal}:${id}:${pin}`);
}

function authEmail(portal: Portal, id: string): string {
  return `${portal}.${id}@portal.invalid`;
}

function safePartner(row: PortalRecord) {
  return {
    id: row.id,
    name: String(row.name ?? ''),
    mobile: String(row.mobile ?? ''),
    studio_name: String(row.studio_name ?? ''),
  };
}

function safePartnerLabOrder(row: Record<string, unknown>) {
  const fields = [
    'id', 'order_no', 'partner_id', 'partner_name', 'studio_name', 'studio_mobile', 'studio_address',
    'project_name', 'work_type', 'clients', 'extra_items', 'total_album_bill', 'total_video_bill',
    'current_order_total', 'previous_back_due', 'master_total', 'advance_paid', 'net_due', 'net_final_due',
    'back_due', 'payment_mode', 'payment_date', 'payment_note', 'payment_history', 'promised_delivery_date',
    'order_status', 'album_status', 'video_status', 'album_started_at', 'video_started_at',
    'album_completed_at', 'video_completed_at', 'delivered_at', 'delivery_mode', 'parcel_tracking_details',
    'video_rows', 'album_rows', 'created_at', 'archived_at', 'deleted_at', 'is_emergency',
    'album_required_date', 'video_delivery_date', 'date_pending', 'storage_locations',
  ];
  return Object.fromEntries(fields.filter((field) => field in row).map((field) => [field, row[field]]));
}

async function getTarget(portal: Portal, id: string): Promise<{ table: string; pinColumn: string; userColumn: string; row: PortalRecord } | null> {
  const config = portal === 'partner'
    ? { table: 'partners', pinColumn: 'portal_password', userColumn: 'auth_user_id' }
    : portal === 'client_booking'
      ? { table: 'bookings', pinColumn: 'access_pin', userColumn: 'client_auth_user_id' }
      : { table: 'studio_lab_orders', pinColumn: 'access_pin', userColumn: 'client_auth_user_id' };
  const { data, error } = await admin.from(config.table).select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return { ...config, row: data as PortalRecord };
}

async function findLoginTargets(portal: 'partner' | 'client', identifier: string) {
  if (portal === 'partner') {
    const phone = cleanPhone(identifier);
    if (phone.length !== 10) return [];
    const { data, error } = await admin.from('partners').select('*').ilike('mobile', `%${phone}`).limit(1000);
    if (error) throw error;
    return (data ?? []).filter((row) => cleanPhone(row.mobile) === phone).map((row) => ({
      portal: 'partner' as Portal, table: 'partners', pinColumn: 'portal_password', userColumn: 'auth_user_id', row: row as PortalRecord,
    }));
  }

  const key = identifier.trim().toLowerCase();
  const phone = cleanPhone(identifier);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier.trim());
  const findRows = async (table: 'bookings' | 'studio_lab_orders', referenceColumn: 'booking_no' | 'order_no', phoneColumn: 'client_mobile' | 'studio_mobile') => {
    const referenceQuery = admin.from(table).select('*').ilike(referenceColumn, identifier.trim());
    const phoneQuery = phone.length === 10
      ? admin.from(table).select('*').ilike(phoneColumn, `%${phone}`).limit(1000)
      : Promise.resolve({ data: [], error: null });
    const idQuery = isUuid
      ? admin.from(table).select('*').eq('id', identifier.trim()).maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const [references, phones, byId] = await Promise.all([referenceQuery, phoneQuery, idQuery]);
    for (const result of [references, phones, byId]) if (result.error) throw result.error;
    const rows = new Map<string, Record<string, unknown>>();
    for (const row of references.data ?? []) rows.set(String(row.id), row);
    for (const row of phones.data ?? []) {
      if (cleanPhone(row[phoneColumn]) === phone) rows.set(String(row.id), row);
    }
    if (byId.data) rows.set(String(byId.data.id), byId.data);
    return [...rows.values()];
  };

  const [bookings, orders] = await Promise.all([
    findRows('bookings', 'booking_no', 'client_mobile'),
    findRows('studio_lab_orders', 'order_no', 'studio_mobile'),
  ]);
  return [
    ...bookings.map((row) => ({ portal: 'client_booking' as Portal, table: 'bookings', pinColumn: 'access_pin', userColumn: 'client_auth_user_id', row: row as PortalRecord })),
    ...orders.map((row) => ({ portal: 'client_lab' as Portal, table: 'studio_lab_orders', pinColumn: 'access_pin', userColumn: 'client_auth_user_id', row: row as PortalRecord })),
  ];
}

async function verifyPin(portal: Portal, id: string, stored: unknown, input: string): Promise<'ok' | 'migrate' | 'invalid'> {
  if (typeof stored !== 'string' || !stored) return 'invalid';
  if (stored.startsWith('v1$')) return stored === await pinHash(portal, id, input) ? 'ok' : 'invalid';
  return stored === input ? 'migrate' : 'invalid';
}

function legacyDefaultPin(portal: Portal, row: PortalRecord): string {
  const phone = portal === 'partner' ? row.mobile : portal === 'client_booking' ? row.client_mobile : row.studio_mobile;
  return cleanPhone(phone).slice(-4);
}

async function recordFailedAttempt(identifier: string, ip: string) {
  await admin.from('portal_auth_attempts').delete().lt('attempted_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const compactIdentifier = identifier.trim().replace(/[\s()+.-]/g, '');
  const canonicalIdentifier = /^\d{10,13}$/.test(compactIdentifier)
    ? `phone:${compactIdentifier.slice(-10)}`
    : identifier.trim().toLowerCase();
  const identifierHash = await hmacHex(`attempt-id:${canonicalIdentifier}`);
  // Do not put every request with missing proxy headers in one global IP
  // bucket; use the already rate-limited identifier as the fallback scope.
  const ipHash = await hmacHex(ip === 'unknown' ? `attempt-ip:unknown:${identifierHash}` : `attempt-ip:${ip}`);
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [identifierAttempts, ipAttempts] = await Promise.all([
    admin.from('portal_auth_attempts').select('id', { count: 'exact', head: true })
      .eq('identifier_hash', identifierHash).gte('attempted_at', since).eq('succeeded', false),
    ip === 'unknown'
      ? Promise.resolve({ count: 0, error: null })
      : admin.from('portal_auth_attempts').select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash).gte('attempted_at', since).eq('succeeded', false),
  ]);
  if (identifierAttempts.error) throw identifierAttempts.error;
  if (ipAttempts.error) throw ipAttempts.error;
  return {
    identifierHash,
    ipHash,
    blocked: (identifierAttempts.count ?? 0) >= 5 || (ipAttempts.count ?? 0) >= 30,
  };
}

async function createOrUpdatePortalAuth(target: { portal: Portal; table: string; pinColumn: string; userColumn: string; row: PortalRecord }, pin: string) {
  const email = authEmail(target.portal, target.row.id);
  const appMetadata = { role: target.portal, portal_record_id: target.row.id };
  const password = await authPassword(target.portal, target.row.id, pin);
  let userId = typeof target.row[target.userColumn] === 'string' ? String(target.row[target.userColumn]) : '';
  if (userId) {
    const { error } = await admin.auth.admin.updateUserById(userId, { password, app_metadata: appMetadata });
    if (error) throw error;
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: appMetadata });
    if (error || !data.user) throw error ?? new Error('Could not create the portal account.');
    userId = data.user.id;
  }
  const { error: linkError } = await admin.from(target.table).update({
    [target.pinColumn]: await pinHash(target.portal, target.row.id, pin),
    [target.userColumn]: userId,
    ...(target.portal === 'partner' ? { password_changed: true } : { pin_changed: true }),
  }).eq('id', target.row.id);
  if (linkError) throw linkError;
  return { userId, email, password };
}

async function requireUser(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sign in again to continue.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error('Your session has expired. Sign in again.');
  return data.user;
}

async function handleLogin(request: Request, body: Record<string, unknown>) {
  const portal = body.portal === 'partner' ? 'partner' : body.portal === 'client' ? 'client' : null;
  const identifier = String(body.identifier ?? '').trim();
  const pin = String(body.pin ?? '').trim();
  if (!portal || !identifier || !/^\d{4}$/.test(pin)) return json(request, { error: 'Enter the registered mobile/reference and 4-digit PIN.' }, 400);

  const ip = request.headers.get('cf-connecting-ip')?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const rate = await recordFailedAttempt(identifier, ip);
  if (rate.blocked) return json(request, { error: 'Too many attempts. Wait 15 minutes and try again.' }, 429);

  const targets = await findLoginTargets(portal, identifier);
  let target: Awaited<ReturnType<typeof findLoginTargets>>[number] | null = null;
  for (const candidate of targets) {
    if (!candidate.row.is_login_allowed || (candidate.portal === 'partner' && candidate.row.status && candidate.row.status !== 'Active')) continue;
    const storedPin = candidate.row[candidate.pinColumn];
    const result = typeof storedPin === 'string' && storedPin && !storedPin.startsWith('v1$') && storedPin.length > 4
      ? (pin === legacyDefaultPin(candidate.portal, candidate.row) ? 'migrate' : 'invalid')
      : await verifyPin(candidate.portal, candidate.row.id, storedPin, pin);
    if (result !== 'invalid') {
      target = candidate;
      break;
    }
  }
  if (!target) {
    await admin.from('portal_auth_attempts').insert({ identifier_hash: rate.identifierHash, ip_hash: rate.ipHash, succeeded: false });
    return json(request, { error: 'Login details are incorrect or access is disabled.' }, 401);
  }

  const credentials = await createOrUpdatePortalAuth(target, pin);
  const { data: sessionData, error: signInError } = await publicAuth.auth.signInWithPassword({ email: credentials.email, password: credentials.password });
  if (signInError || !sessionData.session) throw signInError ?? new Error('Sign in failed.');
  await admin.from('portal_auth_attempts').insert({ identifier_hash: rate.identifierHash, ip_hash: rate.ipHash, succeeded: true });
  return json(request, {
    session: { access_token: sessionData.session.access_token, refresh_token: sessionData.session.refresh_token },
    portal: target.portal,
    recordId: target.row.id,
    ...(target.portal === 'partner' ? { partner: safePartner(target.row) } : {}),
  });
}

async function handlePinChange(request: Request, body: Record<string, unknown>) {
  const user = await requireUser(request);
  const portal = user.app_metadata?.role as Portal;
  const recordId = String(user.app_metadata?.portal_record_id ?? '');
  const currentPin = String(body.currentPin ?? '').trim();
  const newPin = String(body.newPin ?? '').trim();
  if (!['partner', 'client_booking', 'client_lab'].includes(portal) || !recordId) return json(request, { error: 'This account cannot change a portal PIN.' }, 403);
  if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) return json(request, { error: 'PIN must be exactly 4 digits.' }, 400);
  const target = await getTarget(portal, recordId);
  if (!target || !target.row.is_login_allowed) return json(request, { error: 'Portal access is disabled.' }, 403);
  if (await verifyPin(portal, recordId, target.row[target.pinColumn], currentPin) === 'invalid') return json(request, { error: 'Current PIN is incorrect.' }, 401);
  await createOrUpdatePortalAuth({ ...target, portal }, newPin);
  return json(request, { success: true });
}

async function handleAdminPinSet(request: Request, body: Record<string, unknown>) {
  const user = await requireUser(request);
  if (user.app_metadata?.role !== 'admin') return json(request, { error: 'Administrator access is required.' }, 403);
  const portal = body.portal as Portal;
  const recordId = String(body.recordId ?? '');
  const pin = String(body.pin ?? '').trim();
  if (!['partner', 'client_booking', 'client_lab'].includes(portal) || !recordId || !/^\d{4}$/.test(pin)) {
    return json(request, { error: 'Choose a record and enter a 4-digit PIN.' }, 400);
  }
  const target = await getTarget(portal, recordId);
  if (!target) return json(request, { error: 'Account was not found.' }, 404);
  await createOrUpdatePortalAuth({ ...target, portal }, pin);
  return json(request, { success: true, recordId });
}

async function handlePartnerBookings(request: Request) {
  const user = await requireUser(request);
  const partnerId = String(user.app_metadata?.portal_record_id ?? '');
  if (user.app_metadata?.role !== 'partner' || !partnerId) {
    return json(request, { error: 'Partner access is required.' }, 403);
  }
  const target = await getTarget('partner', partnerId);
  if (!target || !target.row.is_login_allowed || (target.row.status && target.row.status !== 'Active')) {
    return json(request, { error: 'Partner portal access is disabled.' }, 403);
  }

  const { data: assignments, error: assignmentsError } = await admin.from('shoot_assignments')
    .select('booking_id,function_name,role,reporting_time')
    .eq('partner_id', partnerId);
  if (assignmentsError) throw assignmentsError;
  const assignmentRows = assignments ?? [];
  const bookingIds = [...new Set(assignmentRows.map((assignment) => String(assignment.booking_id)).filter(Boolean))];
  if (!bookingIds.length) return json(request, { bookings: [] });

  // Only return the operational fields the partner dashboard needs. Do not
  // expose the booking's package price, advance, discount, or account history.
  const { data: bookings, error: bookingsError } = await admin.from('bookings')
    .select('id,client_name,client_mobile,event_function,shoot_date,shoot_time,venue,events')
    .in('id', bookingIds)
    .order('shoot_date');
  if (bookingsError) throw bookingsError;
  const byBooking = new Map<string, Array<{ function_name: string; role: string; reporting_time: string }>>();
  for (const assignment of assignmentRows) {
    const id = String(assignment.booking_id);
    const list = byBooking.get(id) ?? [];
    list.push({ function_name: assignment.function_name ?? '', role: assignment.role ?? '', reporting_time: assignment.reporting_time ?? '' });
    byBooking.set(id, list);
  }
  return json(request, {
    bookings: (bookings ?? []).map((booking) => ({
      ...booking,
      assignments: byBooking.get(String(booking.id)) ?? [],
    })),
  });
}

async function handlePartnerLabOrders(request: Request) {
  const user = await requireUser(request);
  const partnerId = String(user.app_metadata?.portal_record_id ?? '');
  if (user.app_metadata?.role !== 'partner' || !partnerId) {
    return json(request, { error: 'Partner access is required.' }, 403);
  }
  const target = await getTarget('partner', partnerId);
  if (!target || !target.row.is_login_allowed || (target.row.status && target.row.status !== 'Active')) {
    return json(request, { error: 'Partner portal access is disabled.' }, 403);
  }
  const { data, error } = await admin.from('studio_lab_orders').select('*').eq('partner_id', partnerId).order('created_at');
  if (error) throw error;
  return json(request, { orders: (data ?? []).map((row) => safePartnerLabOrder(row as Record<string, unknown>)) });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return json(request, { ok: true });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !pinPepper) return json(request, { error: 'Portal authentication is not configured on the server.' }, 503);
  try {
    const body = await request.json() as Record<string, unknown>;
    switch (body.action) {
      case 'login': return await handleLogin(request, body);
      case 'change-pin': return await handlePinChange(request, body);
      case 'set-pin': return await handleAdminPinSet(request, body);
      case 'partner-bookings': return await handlePartnerBookings(request);
      case 'partner-lab-orders': return await handlePartnerLabOrders(request);
      default: return json(request, { error: 'Unsupported portal authentication action.' }, 400);
    }
  } catch (error) {
    console.error('portal-auth request failed:', error instanceof Error ? error.message : 'unknown error');
    return json(request, { error: 'Could not complete portal authentication. Try again.' }, 500);
  }
});
