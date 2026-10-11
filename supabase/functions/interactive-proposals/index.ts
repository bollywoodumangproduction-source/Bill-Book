import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL')!;
const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
const serviceKey = (secretKeys ? JSON.parse(secretKeys) as Record<string, string> : {}).default
  || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const origins = (Deno.env.get('ALLOWED_APP_ORIGINS') || 'https://bollywood-umang.vercel.app,http://localhost:5173,http://localhost:5174')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function respond(request: Request, body: unknown, status = 200) {
  const origin = request.headers.get('origin') || '';
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origins.includes(origin) ? origin : origins[0] || 'null',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    },
  });
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function publicProposal(row: Record<string, unknown>) {
  const { pin: _pin, ...safe } = row;
  return safe;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return respond(request, { ok: true });
  if (request.method !== 'POST') return respond(request, { error: 'Method not allowed.' }, 405);

  try {
    const body = await request.json();
    const action = body?.action;
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token || token.length > 160) return respond(request, { error: 'Invalid proposal link.' }, 400);

    const { data: row, error } = await db.from('studio_interactive_packages')
      .select('*').eq('public_token', token).maybeSingle();
    if (error) throw error;
    if (!row) return respond(request, { error: 'Proposal not found.' }, 404);

    const configuredPin = typeof row.pin === 'string' ? row.pin : '';
    const suppliedPin = typeof body?.pin === 'string' ? body.pin : '';
    if (configuredPin && !constantTimeEqual(configuredPin, suppliedPin)) {
      if (action === 'read' && !suppliedPin) return respond(request, { requiresPin: true });
      return respond(request, { error: 'Incorrect PIN.' }, 401);
    }

    if (action === 'read') return respond(request, { proposal: publicProposal(row) });

    if (action === 'finalize') {
      if (row.is_locked) return respond(request, { error: 'This proposal is locked by the studio.' }, 409);
      const packageId = typeof body?.packageId === 'string' ? body.packageId : '';
      const chosen = (Array.isArray(row.packages_data) ? row.packages_data : [])
        .find((item: Record<string, unknown>) => item?.id === packageId);
      if (!chosen) return respond(request, { error: 'Selected package is not part of this proposal.' }, 400);
      const clientName = typeof body?.clientName === 'string' ? body.clientName.trim().slice(0, 160) : '';
      const clientPhone = typeof body?.clientPhone === 'string' ? body.clientPhone.trim().slice(0, 40) : '';
      const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : '';
      if (!clientName || !clientPhone) return respond(request, { error: 'Client name and phone are required.' }, 400);

      const selected = {
        package_id: chosen.id,
        package_name: chosen.package_name,
        price: chosen.price,
        client_name: clientName,
        client_phone: clientPhone,
        note,
        submitted_at: new Date().toISOString(),
      };
      const { data: updated, error: updateError } = await db.from('studio_interactive_packages')
        .update({ selected_package: selected, client_name: clientName, client_phone: clientPhone, status: 'finalized' })
        .eq('id', row.id).eq('is_locked', false).select('*').maybeSingle();
      if (updateError) throw updateError;
      if (!updated) return respond(request, { error: 'This proposal was locked before the selection could be saved.' }, 409);
      return respond(request, { proposal: publicProposal(updated), selected_package: selected });
    }

    return respond(request, { error: 'Unsupported action.' }, 400);
  } catch (error) {
    console.error('Interactive proposal request failed:', error);
    return respond(request, { error: 'Could not process this proposal request.' }, 500);
  }
});
