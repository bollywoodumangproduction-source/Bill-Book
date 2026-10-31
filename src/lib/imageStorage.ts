import { supabase } from '@/lib/supabase';

/**
 * Cloudflare R2 upload adapter. The browser only receives a short-lived
 * signed upload URL from the trusted API; bucket credentials must never be
 * added to VITE_* variables or shipped to the browser.
 *
 * Expected API contract:
 * POST {fileName, contentType, purpose} ->
 *   { uploadUrl, publicUrl, method?: "PUT", headers?: Record<string,string> }
 */
export interface UploadedImageAsset {
  publicUrl: string;
  previewUrl: string;
}

export interface ImageUploadContext {
  sessionId?: string;
  folder?: string;
}

function r2UploadApiUrl(): string {
  return import.meta.env.VITE_R2_UPLOAD_API_URL?.trim()
    || 'https://photo-selection-r2-upload.bollywoodumangproduction.workers.dev';
}

function supabasePublicApiKey(): string {
  return (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
}

async function requireAdminSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token || session.user.app_metadata?.role !== 'admin') {
    throw new Error('Administrator sign-in is required.');
  }
  return session;
}

export async function uploadImageAsset(file: File, purpose: string, context: ImageUploadContext = {}): Promise<UploadedImageAsset> {
  // This endpoint is public and protected by the Worker's origin and admin
  // session checks. Keep a production fallback so uploads still work if a
  // Vercel build is missing the optional environment variable.
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file.');
  }

  const session = await requireAdminSession();

  const response = await fetch(r2UploadApiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublicApiKey(),
    },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size, purpose, ...context }),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null) as { error?: unknown } | null;
    const message = typeof failure?.error === 'string' && failure.error.trim()
      ? failure.error
      : 'Could not prepare the secure image upload. Try again later.';
    throw new Error(message);
  }

  const signed = await response.json() as {
    uploadUrl?: string;
    publicUrl?: string;
    previewUrl?: string;
    method?: string;
    headers?: Record<string, string>;
  };
  if (!signed.uploadUrl || !signed.publicUrl) {
    throw new Error('The upload API returned an invalid response.');
  }

  const upload = await fetch(signed.uploadUrl, {
    method: signed.method || 'PUT',
    headers: { 'Content-Type': file.type, ...(signed.headers || {}) },
    body: file,
  });
  if (!upload.ok) {
    throw new Error('Cloudflare R2 did not accept the image. Try again.');
  }
  return { publicUrl: signed.publicUrl, previewUrl: signed.previewUrl || signed.publicUrl };
}

export async function deletePhotoSelectionSessionAssets(sessionId: string): Promise<number> {
  const session = await requireAdminSession();
  const response = await fetch(r2UploadApiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublicApiKey(),
    },
    body: JSON.stringify({ action: 'delete-session', sessionId }),
  });
  const result = await response.json().catch(() => null) as { error?: unknown; deletedObjects?: unknown } | null;
  if (!response.ok) {
    const message = typeof result?.error === 'string' && result.error.trim()
      ? result.error
      : 'Could not permanently delete this session’s R2 images.';
    throw new Error(message);
  }
  return typeof result?.deletedObjects === 'number' ? result.deletedObjects : 0;
}

export async function uploadImage(file: File, purpose: string, context: ImageUploadContext = {}): Promise<string> {
  const uploaded = await uploadImageAsset(file, purpose, context);
  return uploaded.publicUrl;
}

/** Studio logos and stamps live in the Supabase Storage branding bucket. */
export async function uploadBrandingImage(file: File): Promise<string> {
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  if (!allowedTypes.has(file.type)) throw new Error('Choose a JPG, PNG, WebP, or GIF image.');
  if (file.size > 2 * 1024 * 1024) throw new Error('Branding images must be 2 MB or smaller.');
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
  const path = `${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from('studio-branding').upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message || 'Could not upload the studio image to Supabase Storage.');
  const { data } = supabase.storage.from('studio-branding').getPublicUrl(path);
  return data.publicUrl;
}
